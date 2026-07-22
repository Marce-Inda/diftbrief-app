/**
 * @fileoverview Unit tests for the ReAct loop behavior in agentService.
 * Tests the full Gemini and Groq tool-calling loop through the exported
 * `getAgentDrift` function by mocking global `fetch`.
 *
 * Validates: Requirements 5.1, 5.2, 5.4, 5.5, 6.1, 6.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAgentDrift } from '../agentService';
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

describe('AgentService ReAct Loop', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    // Re-stub keys for remaining tests
    vi.stubEnv('VITE_GEMINI_API_KEY', 'test-gemini-key');
    vi.stubEnv('VITE_GROQ_API_KEY', 'test-groq-key');
  });

  /**
   * Req 5.2: When no Function_Call is present in the LLM response,
   * the loop returns the text directly without executing any tool.
   */
  it('returns text directly when no Function_Call present (Req 5.2)', async () => {
    const briefingText = '{"briefing":"Direct text briefing without tool call"}';

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: briefingText }] } }],
      }),
    });

    const result = await getAgentDrift(snapshotA, snapshotB);

    expect(result.drift).toBeDefined();
    expect(result.source).toBe('gemini');
    // The briefing should come from the mocked LLM response
    expect(result.drift.socBriefing).toBe('Direct text briefing without tool call');
    expect(result.drift.cisoBriefing).toBe('Direct text briefing without tool call');
  });

  /**
   * Req 5.1, 5.5: Full Gemini ReAct loop — first call returns functionCall,
   * tool executes, follow-up returns enriched text.
   */
  it('completes full Gemini ReAct loop with tool execution (Req 5.1, 5.5)', async () => {
    fetchMock.mockImplementation(async (_url: string, options: RequestInit) => {
      const body = JSON.parse(options.body as string);

      // Distinguish initial call vs follow-up by checking contents structure.
      // Follow-up calls have multiple content entries (user, model functionCall, function response)
      const isFollowUp = Array.isArray(body.contents) && body.contents.length > 1;

      if (isFollowUp) {
        // Follow-up call — returns enriched text response
        return {
          ok: true,
          json: async () => ({
            candidates: [{
              content: {
                parts: [{
                  text: '{"briefing":"Enriched briefing with threat intel data from APT-29"}',
                }],
              },
            }],
          }),
        };
      } else {
        // Initial call — returns functionCall
        return {
          ok: true,
          json: async () => ({
            candidates: [{
              content: {
                parts: [{
                  functionCall: {
                    name: 'queryThreatIntelligence',
                    args: { ioc: '91.218.114.77' },
                  },
                }],
              },
            }],
          }),
        };
      }
    });

    const result = await getAgentDrift(snapshotA, snapshotB);

    expect(result.source).toBe('gemini');
    expect(result.drift.socBriefing).toBe('Enriched briefing with threat intel data from APT-29');
    expect(result.drift.cisoBriefing).toBe('Enriched briefing with threat intel data from APT-29');
    // Verify fetch was called multiple times (initial + follow-up for each agent)
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  /**
   * Req 5.5: Full Groq ReAct loop — Gemini fails (no API key),
   * Groq does tool calling successfully.
   */
  it('completes full Groq ReAct loop when Gemini unavailable (Req 5.5)', async () => {
    // Remove Gemini key to force Groq fallback
    vi.stubEnv('VITE_GEMINI_API_KEY', '');

    let groqCallCount = 0;

    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('groq.com')) {
        groqCallCount++;
        if (groqCallCount === 1 || groqCallCount === 3) {
          // Initial Groq call — returns tool_calls
          return {
            ok: true,
            json: async () => ({
              choices: [{
                message: {
                  tool_calls: [{
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'queryRegulatoryPrecedents',
                      arguments: '{"regulation":"GDPR"}',
                    },
                  }],
                },
              }],
            }),
          };
        } else {
          // Follow-up Groq call — returns text response
          return {
            ok: true,
            json: async () => ({
              choices: [{
                message: {
                  content: '{"briefing":"Regulatory briefing with GDPR precedent data"}',
                },
              }],
            }),
          };
        }
      }
      return { ok: false, json: async () => ({}) };
    });

    const result = await getAgentDrift(snapshotA, snapshotB);

    expect(result.source).toBe('groq');
    expect(result.drift.cisoBriefing).toBe('Regulatory briefing with GDPR precedent data');
  });

  /**
   * Req 5.4: When the follow-up response still contains a Function_Call,
   * the loop terminates (max iterations reached) and falls through.
   */
  it('terminates loop when follow-up still has Function_Call (Req 5.4)', async () => {
    // Make Gemini always return functionCall (even in follow-up)
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('generativelanguage.googleapis.com')) {
        return {
          ok: true,
          json: async () => ({
            candidates: [{
              content: {
                parts: [{
                  functionCall: {
                    name: 'queryThreatIntelligence',
                    args: { ioc: '185.220.101.34' },
                  },
                }],
              },
            }],
          }),
        };
      }
      // Groq also returns tool_calls in follow-up to trigger max iterations
      if (url.includes('groq.com')) {
        return {
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                tool_calls: [{
                  id: 'call_loop',
                  type: 'function',
                  function: {
                    name: 'queryThreatIntelligence',
                    arguments: '{"ioc":"185.220.101.34"}',
                  },
                }],
              },
            }],
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });

    const result = await getAgentDrift(snapshotA, snapshotB);

    // Should fall back to local deterministic source since both providers loop infinitely
    expect(result.source).toBe('local');
    // Deterministic fallback briefings should be present
    expect(result.drift.socBriefing).toBeDefined();
    expect(result.drift.socBriefing.length).toBeGreaterThan(0);
    expect(result.fallbackReason).toBeDefined();
  });

  /**
   * Req 6.3: Max iteration warning is logged when follow-up returns another function call.
   */
  it('logs max iteration warning when loop is terminated (Req 6.3)', async () => {
    // Same setup as the loop termination test — Gemini always returns functionCall
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('generativelanguage.googleapis.com')) {
        return {
          ok: true,
          json: async () => ({
            candidates: [{
              content: {
                parts: [{
                  functionCall: {
                    name: 'queryThreatIntelligence',
                    args: { ioc: '185.220.101.34' },
                  },
                }],
              },
            }],
          }),
        };
      }
      if (url.includes('groq.com')) {
        return {
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                tool_calls: [{
                  id: 'call_loop',
                  type: 'function',
                  function: {
                    name: 'queryThreatIntelligence',
                    arguments: '{"ioc":"185.220.101.34"}',
                  },
                }],
              },
            }],
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });

    await getAgentDrift(snapshotA, snapshotB);

    // Verify the max iterations warning was logged
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[AgentService] callWriterLLM: max iterations (2) reached'
    );
  });

  /**
   * Req 6.1: Orchestrator logs routing info at each step.
   */
  it('logs orchestrator routing context (Req 6.1)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"briefing":"test"}' }] } }],
      }),
    });

    await getAgentDrift(snapshotA, snapshotB);

    // Verify orchestrator logged routing info
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Orchestrator] Contexto enrutado localmente')
    );
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Orchestrator] ✅ Briefings generados')
    );
  });
});
