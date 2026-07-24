/**
 * @fileoverview Integration tests for the full OpenRouter fallback chain.
 * Tests the complete Gemini → Groq → OpenRouter → Local fallback sequence
 * with mocked fetch, verifying source priority, telemetry, and cost computation.
 *
 * Validates: Requirements 1.8, 2.1, 2.2, 2.3, 2.4, 2.6, 3.2, 3.4, 4.3
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

const snapshotA = snapshots[0] as unknown as Snapshot;
const snapshotB = snapshots[1] as unknown as Snapshot;

describe('Integration: Full fallback chain Gemini → Groq → OpenRouter → Local', () => {
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
  });

  /**
   * Validates: Requirements 1.8, 2.1, 2.2, 2.3
   *
   * When Gemini and Groq both fail (HTTP error), but OpenRouter succeeds,
   * the source should be 'openrouter' and the response should contain valid briefings.
   */
  it('falls back through Gemini → Groq → OpenRouter successfully', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', 'test-gemini-key');
    vi.stubEnv('VITE_GROQ_API_KEY', 'test-groq-key');
    vi.stubEnv('VITE_OPENROUTER_API_KEY', 'test-openrouter-key');

    fetchMock.mockImplementation(async (url: string) => {
      // Gemini fails with HTTP 500
      if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com')) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      // Groq fails with HTTP 503
      if (typeof url === 'string' && url.includes('api.groq.com')) {
        return { ok: false, status: 503, json: async () => ({}) };
      }
      // OpenRouter succeeds
      if (typeof url === 'string' && url.includes('openrouter.ai')) {
        return {
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: JSON.stringify({ briefing: 'OpenRouter generated briefing for test' }),
              },
            }],
            usage: { total_tokens: 150 },
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const result = await getAgentDrift(snapshotA, snapshotB);

    expect(result.source).toBe('openrouter');
    expect(result.drift.socBriefing.length).toBeGreaterThan(0);
    expect(result.drift.cisoBriefing.length).toBeGreaterThan(0);
  });

  /**
   * Validates: Requirements 2.4, 2.6, 3.4
   *
   * When OpenRouter key is missing (empty), the provider is skipped entirely
   * without a network request, and the chain falls through to the local engine.
   * The fallbackReason should mention all three remote providers.
   */
  it('skips OpenRouter when key missing, falls back to local', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', 'test-gemini-key');
    vi.stubEnv('VITE_GROQ_API_KEY', 'test-groq-key');
    vi.stubEnv('VITE_OPENROUTER_API_KEY', '');

    fetchMock.mockImplementation(async (url: string) => {
      // Gemini fails
      if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com')) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      // Groq fails
      if (typeof url === 'string' && url.includes('api.groq.com')) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      // OpenRouter should NOT be called since key is empty
      if (typeof url === 'string' && url.includes('openrouter.ai')) {
        throw new Error('OpenRouter should not be called when key is empty');
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const result = await getAgentDrift(snapshotA, snapshotB);

    expect(result.source).toBe('local');
    expect(result.fallbackReason).toBeDefined();
    // The fallbackReason should reference all three providers
    expect(result.fallbackReason).toMatch(/Gemini/i);
    expect(result.fallbackReason).toMatch(/Groq/i);
    expect(result.fallbackReason).toMatch(/OpenRouter/i);
    // No OpenRouter fetch calls should have been made
    const openrouterCalls = fetchMock.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('openrouter.ai')
    );
    expect(openrouterCalls).toHaveLength(0);
  });

  /**
   * Validates: Requirements 3.2, 4.3
   *
   * When OpenRouter serves a response, getAgentDrift should return:
   * - source: 'openrouter'
   * - telemetry with latencyMs (positive integer), tokensConsumed, and estimatedCost
   * - estimatedCost should be 0 (since OpenRouter uses free-tier model)
   * - fallbackReason should indicate Gemini and Groq failed
   */
  it('returns correct source and telemetry when OpenRouter serves', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', 'test-gemini-key');
    vi.stubEnv('VITE_GROQ_API_KEY', 'test-groq-key');
    vi.stubEnv('VITE_OPENROUTER_API_KEY', 'test-openrouter-key');

    fetchMock.mockImplementation(async (url: string) => {
      // Gemini fails
      if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com')) {
        return { ok: false, status: 429, json: async () => ({}) };
      }
      // Groq fails
      if (typeof url === 'string' && url.includes('api.groq.com')) {
        return { ok: false, status: 429, json: async () => ({}) };
      }
      // OpenRouter succeeds with token usage
      if (typeof url === 'string' && url.includes('openrouter.ai')) {
        return {
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: JSON.stringify({ briefing: 'OpenRouter telemetry test briefing' }),
              },
            }],
            usage: { total_tokens: 250 },
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const result = await getAgentDrift(snapshotA, snapshotB);

    expect(result.source).toBe('openrouter');
    expect(result.telemetry).toBeDefined();
    expect(result.telemetry!.latencyMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.telemetry!.latencyMs).toBe('number');
    expect(result.telemetry!.tokensConsumed).toBe(500); // 250 tokens × 2 parallel agents
    expect(result.telemetry!.estimatedCost).toBe(0);
    // fallbackReason should mention Gemini and Groq failed
    expect(result.fallbackReason).toBeDefined();
    expect(result.fallbackReason).toMatch(/Gemini/i);
    expect(result.fallbackReason).toMatch(/Groq/i);
  });

  /**
   * Validates: Requirements 4.3
   *
   * computeEstimatedCost returns 0.0000 for openrouter source for any token count.
   * Tested indirectly through getAgentDrift telemetry output.
   */
  it('computeEstimatedCost returns 0 for openrouter source (any token count)', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', 'test-gemini-key');
    vi.stubEnv('VITE_GROQ_API_KEY', 'test-groq-key');
    vi.stubEnv('VITE_OPENROUTER_API_KEY', 'test-openrouter-key');

    // Test with various token counts — cost should always be 0
    const tokenCounts = [1, 100, 5000, 99999];

    for (const tokens of tokenCounts) {
      fetchMock.mockReset();
      fetchMock.mockImplementation(async (url: string) => {
        // Gemini and Groq fail
        if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com')) {
          return { ok: false, status: 500, json: async () => ({}) };
        }
        if (typeof url === 'string' && url.includes('api.groq.com')) {
          return { ok: false, status: 500, json: async () => ({}) };
        }
        // OpenRouter succeeds with varying token counts
        if (typeof url === 'string' && url.includes('openrouter.ai')) {
          return {
            ok: true,
            json: async () => ({
              choices: [{
                message: {
                  content: JSON.stringify({ briefing: `Briefing with ${tokens} tokens` }),
                },
              }],
              usage: { total_tokens: tokens },
            }),
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      });

      const result = await getAgentDrift(snapshotA, snapshotB);

      expect(result.source).toBe('openrouter');
      expect(result.telemetry).toBeDefined();
      expect(result.telemetry!.estimatedCost).toBe(0);
    }
  });

  /**
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4
   *
   * When all providers fail (Gemini HTTP error, Groq HTTP error, OpenRouter HTTP error),
   * the system falls back to local deterministic engine.
   */
  it('all remote providers fail → source is local with full fallback', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', 'test-gemini-key');
    vi.stubEnv('VITE_GROQ_API_KEY', 'test-groq-key');
    vi.stubEnv('VITE_OPENROUTER_API_KEY', 'test-openrouter-key');

    fetchMock.mockImplementation(async () => {
      return { ok: false, status: 500, json: async () => ({}) };
    });

    const result = await getAgentDrift(snapshotA, snapshotB);

    expect(result.source).toBe('local');
    expect(result.fallbackReason).toBeDefined();
    expect(result.fallbackReason).toMatch(/Gemini/i);
    expect(result.fallbackReason).toMatch(/Groq/i);
    expect(result.fallbackReason).toMatch(/OpenRouter/i);
    // Local fallback has no telemetry
    expect(result.telemetry).toBeUndefined();
    // Deterministic briefings should still be present
    expect(result.drift.socBriefing.length).toBeGreaterThan(0);
    expect(result.drift.cisoBriefing.length).toBeGreaterThan(0);
  });

  /**
   * Validates: Requirements 2.6
   *
   * When Gemini key is empty (skipped), Groq key is empty (skipped),
   * and OpenRouter key is empty (skipped), the chain falls back to local
   * without making any network requests.
   */
  it('all keys empty → no fetch calls, source is local', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', '');
    vi.stubEnv('VITE_GROQ_API_KEY', '');
    vi.stubEnv('VITE_OPENROUTER_API_KEY', '');

    const result = await getAgentDrift(snapshotA, snapshotB);

    expect(result.source).toBe('local');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.drift.socBriefing.length).toBeGreaterThan(0);
    expect(result.drift.cisoBriefing.length).toBeGreaterThan(0);
  });
});
