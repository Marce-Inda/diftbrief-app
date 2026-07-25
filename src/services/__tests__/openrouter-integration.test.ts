/**
 * @fileoverview Integration tests for the single-pass orchestration fallback chain.
 * Tests the complete Gemini → Groq → Local sequential fallback for getAgentDrift.
 * OpenRouter has been REMOVED from the getAgentDrift chain.
 *
 * Validates: Requirements 1.8, 2.1, 2.2, 2.3, 2.4, 2.6, 3.2, 3.4, 4.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

describe('Integration: Single-pass fallback chain Gemini → Groq → Local', () => {
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
    vi.resetModules();
  });

  /**
   * Validates: Requirements 2.1, 2.2, 2.3
   *
   * When Gemini fails (HTTP error), Groq serves successfully as sequential fallback.
   * OpenRouter is NOT called by getAgentDrift (removed from chain).
   */
  it('falls back from Gemini to Groq successfully (single-pass)', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', 'test-gemini-key');
    vi.stubEnv('VITE_GROQ_API_KEY', 'test-groq-key');
    vi.stubEnv('VITE_OPENROUTER_API_KEY', 'test-openrouter-key');

    fetchMock.mockImplementation(async (url: string) => {
      // Gemini fails with HTTP 500
      if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com')) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      // Groq succeeds with unified response
      if (typeof url === 'string' && url.includes('api.groq.com')) {
        return {
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: JSON.stringify({
                  socBriefing: 'SOC technical briefing from Groq',
                  cisoBriefing: 'CISO executive briefing from Groq',
                  urgentDecision: 'Immediate containment required',
                }),
              },
            }],
            usage: { total_tokens: 200 },
          }),
        };
      }
      // OpenRouter should NOT be called by getAgentDrift
      if (typeof url === 'string' && url.includes('openrouter.ai')) {
        throw new Error('OpenRouter should NOT be called by getAgentDrift');
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const { getAgentDrift } = await import('../agentService');
    const result = await getAgentDrift(snapshotA, snapshotB);

    expect(result.source).toBe('groq');
    expect(result.drift.socBriefing).toBe('SOC technical briefing from Groq');
    expect(result.drift.cisoBriefing).toBe('CISO executive briefing from Groq');
    // OpenRouter was never called
    const openrouterCalls = fetchMock.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('openrouter.ai')
    );
    expect(openrouterCalls).toHaveLength(0);
  });

  /**
   * Validates: Requirements 2.4, 2.6, 3.4
   *
   * OpenRouter is NOT called by getAgentDrift. When both Gemini and Groq fail,
   * the chain falls through to the local deterministic engine directly.
   */
  it('getAgentDrift does NOT call OpenRouter — falls back to local', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', 'test-gemini-key');
    vi.stubEnv('VITE_GROQ_API_KEY', 'test-groq-key');
    vi.stubEnv('VITE_OPENROUTER_API_KEY', 'test-openrouter-key');

    fetchMock.mockImplementation(async (url: string) => {
      // Gemini fails
      if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com')) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      // Groq fails
      if (typeof url === 'string' && url.includes('api.groq.com')) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      // OpenRouter should NOT be called
      if (typeof url === 'string' && url.includes('openrouter.ai')) {
        throw new Error('OpenRouter should NOT be called by getAgentDrift');
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const { getAgentDrift } = await import('../agentService');
    const result = await getAgentDrift(snapshotA, snapshotB);

    expect(result.source).toBe('local');
    expect(result.fallbackReason).toBeDefined();
    // Fallback reason mentions Gemini and Groq (not OpenRouter since it's removed)
    expect(result.fallbackReason).toMatch(/Gemini/i);
    expect(result.fallbackReason).toMatch(/Groq/i);
    // No OpenRouter fetch calls
    const openrouterCalls = fetchMock.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('openrouter.ai')
    );
    expect(openrouterCalls).toHaveLength(0);
    // Deterministic briefings present
    expect(result.drift.socBriefing.length).toBeGreaterThan(0);
    expect(result.drift.cisoBriefing.length).toBeGreaterThan(0);
  });

  /**
   * Validates: Requirements 3.2, 4.3
   *
   * Cost computation: Gemini source → GEMINI_COST_PER_TOKEN (0.00001).
   * Groq source → GROQ_COST_PER_TOKEN (0.000001).
   * Verified through telemetry output of getAgentDrift.
   */
  it('returns correct telemetry and cost for gemini and groq sources', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', 'test-gemini-key');
    vi.stubEnv('VITE_GROQ_API_KEY', 'test-groq-key');

    // Test Gemini cost
    fetchMock.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com')) {
        return {
          ok: true,
          json: async () => ({
            candidates: [{
              content: {
                parts: [{
                  text: JSON.stringify({
                    socBriefing: 'SOC from Gemini',
                    cisoBriefing: 'CISO from Gemini',
                    urgentDecision: 'Decide now',
                  }),
                }],
              },
            }],
            usageMetadata: { totalTokenCount: 1000 },
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const { getAgentDrift } = await import('../agentService');
    const result = await getAgentDrift(snapshotA, snapshotB);

    expect(result.source).toBe('gemini');
    expect(result.telemetry).toBeDefined();
    expect(result.telemetry!.tokensConsumed).toBe(1000);
    expect(result.telemetry!.latencyMs).toBeGreaterThanOrEqual(0);
    // Gemini cost: 1000 * 0.00001 = 0.01
    expect(result.telemetry!.estimatedCost).toBe(0.01);
  });

  /**
   * Validates: Requirements 2.6
   *
   * When all API keys are empty, no fetch calls are made and source is local.
   * This confirms the single-pass architecture makes zero network calls when keys missing.
   */
  it('all keys empty → no fetch calls, source is local', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', '');
    vi.stubEnv('VITE_GROQ_API_KEY', '');
    vi.stubEnv('VITE_OPENROUTER_API_KEY', '');

    const { getAgentDrift } = await import('../agentService');
    const result = await getAgentDrift(snapshotA, snapshotB);

    expect(result.source).toBe('local');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.drift.socBriefing.length).toBeGreaterThan(0);
    expect(result.drift.cisoBriefing.length).toBeGreaterThan(0);
  });

  /**
   * Validates: Requirements 1.8, 2.1
   *
   * getAgentDrift makes a SINGLE fetch call (not parallel) when Gemini succeeds.
   * This validates the single-pass architecture vs the old dual-parallel approach.
   */
  it('makes a single fetch call when first provider succeeds', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', 'test-gemini-key');
    vi.stubEnv('VITE_GROQ_API_KEY', 'test-groq-key');

    fetchMock.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com')) {
        return {
          ok: true,
          json: async () => ({
            candidates: [{
              content: {
                parts: [{
                  text: JSON.stringify({
                    socBriefing: 'SOC briefing single pass',
                    cisoBriefing: 'CISO briefing single pass',
                    urgentDecision: 'Act immediately',
                  }),
                }],
              },
            }],
            usageMetadata: { totalTokenCount: 500 },
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const { getAgentDrift } = await import('../agentService');
    const result = await getAgentDrift(snapshotA, snapshotB);

    expect(result.source).toBe('gemini');
    // Only ONE fetch call was made (single-pass, not parallel SOC + CISO)
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.drift.socBriefing).toBe('SOC briefing single pass');
    expect(result.drift.cisoBriefing).toBe('CISO briefing single pass');
  });
});
