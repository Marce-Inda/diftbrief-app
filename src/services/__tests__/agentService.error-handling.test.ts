/**
 * @fileoverview Property-based tests for error sanitization and malformed call handling.
 * Tests Properties 7, 8, and 9 from the MCP Tool Calling design document.
 *
 * Property 7: Unregistered function produces error Function_Response
 * Property 8: Tool error sanitization
 * Property 9: Malformed function call graceful handling
 *
 * Validates: Requirements 5.3, 7.1, 8.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { sanitizeErrorMessage, getAgentDrift } from '../agentService';
import type { Snapshot } from '../../types';
import snapshots from '../../data/snapshots.json';

// Mock the tools module to avoid simulated delays in tests
vi.mock('../tools', () => ({
  queryThreatIntelligence: vi.fn().mockResolvedValue({
    reputation: 'high-threat: known C2 infrastructure (score 87/100)',
    campaign: 'APT-29 Cozy Bear',
    action_recommended: 'block at perimeter firewall and flag for SOC review',
  }),
  queryRegulatoryPrecedents: vi.fn().mockResolvedValue({
    max_penalty: 'Up to €20 million or 4% of annual global turnover',
    recent_fine_example: 'Meta Platforms Ireland fined €1.2 billion (May 2023)',
    notification_deadline: '72 hours from breach discovery',
  }),
}));

// Use real snapshot data from the project
const snapshotA = snapshots[0] as unknown as Snapshot;
const snapshotB = snapshots[1] as unknown as Snapshot;

// Stub environment variables for API keys
vi.stubEnv('VITE_GEMINI_API_KEY', 'test-gemini-key');
vi.stubEnv('VITE_GROQ_API_KEY', 'test-groq-key');

describe('Property 7: Unregistered function produces error Function_Response', () => {
  /**
   * **Validates: Requirements 5.3**
   *
   * For any function name not present in the tool registry, when the LLM returns
   * a Function_Call referencing that name, the agentic loop SHALL construct a
   * Function_Response containing an error message indicating the function is not
   * available, and send it back to the LLM.
   */
  let fetchMock: ReturnType<typeof vi.fn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.stubEnv('VITE_GEMINI_API_KEY', 'test-gemini-key');
    vi.stubEnv('VITE_GROQ_API_KEY', 'test-groq-key');
  });

  it('logs warning for unregistered function names', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => 
          s !== 'queryThreatIntelligence' && 
          s !== 'queryRegulatoryPrecedents' &&
          !s.includes('"') && !s.includes('\\')
        ),
        async (unregisteredName) => {
          consoleWarnSpy.mockClear();
          fetchMock.mockReset();

          let callCount = 0;
          fetchMock.mockImplementation(async () => {
            callCount++;
            if (callCount <= 2) {
              // Initial call — returns a function call with unregistered name
              return {
                ok: true,
                json: async () => ({
                  candidates: [{
                    content: {
                      parts: [{
                        functionCall: {
                          name: unregisteredName,
                          args: { key: 'value' },
                        },
                      }],
                    },
                  }],
                }),
              };
            } else {
              // Follow-up call — returns text response after receiving error Function_Response
              return {
                ok: true,
                json: async () => ({
                  candidates: [{
                    content: {
                      parts: [{ text: '{"briefing":"Fallback briefing after unregistered tool"}' }],
                    },
                  }],
                }),
              };
            }
          });

          await getAgentDrift(snapshotA, snapshotB);

          // Verify console.warn was called with the unregistered function name
          expect(consoleWarnSpy).toHaveBeenCalledWith(
            `[AgentService] Unregistered function requested: ${unregisteredName}`
          );
        }
      ),
      { numRuns: 20 }
    );
  });
});

describe('Property 8: Tool error sanitization', () => {
  /**
   * **Validates: Requirements 7.1**
   *
   * For any exception thrown by a tool function, the constructed error Function_Response
   * SHALL have error set to true and a message field that excludes API keys
   * (strings matching VITE_* patterns), authentication tokens (Bearer tokens,
   * Authorization headers), and internal file paths (absolute paths containing
   * /src/ or /home/).
   */

  it('for any error message containing VITE_* env patterns (= format), strips them', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.constantFrom('GEMINI_API_KEY', 'GROQ_API_KEY', 'SECRET_TOKEN', 'API_SECRET'),
        fc.string({ minLength: 1, maxLength: 30 }).filter(s => !/\s/.test(s)),
        (prefix, envName, value) => {
          const input = `${prefix} VITE_${envName}=${value} some error`;
          const result = sanitizeErrorMessage(input);
          expect(result).not.toContain(`VITE_${envName}=${value}`);
          expect(result).toContain('[REDACTED_ENV]');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('for any error message containing VITE_* env patterns (: format), strips them', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.constantFrom('GEMINI_API_KEY', 'GROQ_API_KEY', 'SECRET_TOKEN'),
        fc.string({ minLength: 1, maxLength: 30 }).filter(s => !/\s/.test(s)),
        (prefix, envName, value) => {
          const input = `${prefix} VITE_${envName}: ${value} some error`;
          const result = sanitizeErrorMessage(input);
          expect(result).not.toContain(`VITE_${envName}: ${value}`);
          expect(result).toContain('[REDACTED_ENV]');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('for any error message containing Bearer tokens, strips them', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter(s => !/\s/.test(s) && s.length > 0 && !s.startsWith('[REDACTED') && !'[REDACTED]'.startsWith(s)),
        (token) => {
          const input = `Error with Bearer ${token} in request`;
          const result = sanitizeErrorMessage(input);
          expect(result).not.toContain(`Bearer ${token}`);
          expect(result).toContain('Bearer [REDACTED]');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('for any error message containing /home/ paths, strips them', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter(s => !/[\s:,)}\]]/.test(s) && s.length > 0),
        (pathSuffix) => {
          const input = `Error at /home/${pathSuffix} failed`;
          const result = sanitizeErrorMessage(input);
          expect(result).not.toContain(`/home/${pathSuffix}`);
          expect(result).toContain('[REDACTED_PATH]');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('for any error message containing /src/ paths, strips them', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter(s => !/[\s:,)}\]]/.test(s) && s.length > 0),
        (pathSuffix) => {
          const input = `Error at /src/${pathSuffix} failed`;
          const result = sanitizeErrorMessage(input);
          expect(result).not.toContain(`/src/${pathSuffix}`);
          expect(result).toContain('[REDACTED_PATH]');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('for any error message longer than 200 chars, truncates to 200', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 201, maxLength: 500 }),
        (message) => {
          const result = sanitizeErrorMessage(message);
          expect(result.length).toBeLessThanOrEqual(200);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('for any error message with Authorization header, strips it', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter(s => !/\s/.test(s) && s.length > 0 && !'[REDACTED]'.includes(s)),
        (token) => {
          const input = `Error with Authorization: ${token} header`;
          const result = sanitizeErrorMessage(input);
          expect(result).not.toContain(`Authorization: ${token}`);
          expect(result).toContain('Authorization: [REDACTED]');
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 9: Malformed function call graceful handling', () => {
  /**
   * **Validates: Requirements 8.2**
   *
   * For any LLM response containing a malformed Function_Call (missing function name,
   * unparseable arguments JSON, or null function call fields), the agentic loop SHALL
   * either extract text content present alongside the malformed call OR return null
   * to trigger the deterministic fallback — never throw an unhandled exception.
   */
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.stubEnv('VITE_GEMINI_API_KEY', 'test-gemini-key');
    vi.stubEnv('VITE_GROQ_API_KEY', 'test-groq-key');
  });

  it('missing function name in Gemini response falls back gracefully', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ functionCall: { name: null, args: {} } }] } }],
      }),
    });

    // Should not throw, should return a valid result (deterministic fallback)
    const result = await getAgentDrift(snapshotA, snapshotB);
    expect(result).toBeDefined();
    expect(result.drift).toBeDefined();
    expect(result.drift.socBriefing.length).toBeGreaterThan(0);
  });

  it('unparseable arguments in Groq response falls back gracefully', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', '');
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            tool_calls: [{
              id: 'call_bad',
              type: 'function',
              function: { name: 'queryThreatIntelligence', arguments: 'INVALID JSON{{{' },
            }],
          },
        }],
      }),
    });

    const result = await getAgentDrift(snapshotA, snapshotB);
    expect(result).toBeDefined();
    expect(result.drift.socBriefing.length).toBeGreaterThan(0);
  });

  it('null function call fields never throw unhandled exceptions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant({ functionCall: null }),
          fc.constant({ functionCall: { name: undefined, args: undefined } }),
          fc.constant({ functionCall: { name: '', args: null } }),
          fc.constant({ functionCall: { name: null, args: {} } }),
        ),
        async (malformedPart) => {
          fetchMock.mockReset();
          fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({
              candidates: [{ content: { parts: [malformedPart] } }],
            }),
          });

          // Should never throw — always returns a defined result
          const result = await getAgentDrift(snapshotA, snapshotB);
          expect(result).toBeDefined();
          expect(result.drift).toBeDefined();
        }
      ),
      { numRuns: 10 }
    );
  });

  it('empty function name in Groq response falls back gracefully', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', '');
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            tool_calls: [{
              id: 'call_empty',
              type: 'function',
              function: { name: '', arguments: '{}' },
            }],
          },
        }],
      }),
    });

    const result = await getAgentDrift(snapshotA, snapshotB);
    expect(result).toBeDefined();
    expect(result.drift).toBeDefined();
    expect(result.drift.socBriefing.length).toBeGreaterThan(0);
  });
});
