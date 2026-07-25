/**
 * @fileoverview Unit tests for the single-pass orchestration in agentService.
 * Tests the unified Gemini → Groq → Local sequential fallback through the exported
 * `getAgentDrift` function by mocking global `fetch`.
 *
 * Each test dynamically imports agentService to get a fresh module instance
 * (avoiding stale in-memory driftCache between tests).
 *
 * Validates: Requirements 5.1, 5.2, 5.4, 5.5, 6.1, 6.3
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

// Use real snapshot data from the project
const snapshotA = snapshots[0] as unknown as Snapshot;
const snapshotB = snapshots[1] as unknown as Snapshot;

// Stub environment variables for API keys
vi.stubEnv('VITE_GEMINI_API_KEY', 'test-gemini-key');
vi.stubEnv('VITE_GROQ_API_KEY', 'test-groq-key');

describe('AgentService Single-Pass Orchestration', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
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
   * Req 5.2: When Gemini returns a valid unified response, the briefings
   * are extracted and returned with source 'gemini'.
   */
  it('returns unified briefing from Gemini with structured response (Req 5.2)', async () => {
    const unifiedResponse = JSON.stringify({
      socBriefing: 'SOC technical briefing from Gemini',
      cisoBriefing: 'CISO executive briefing from Gemini',
      urgentDecision: 'Immediate containment required',
    });

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: unifiedResponse }] } }],
        usageMetadata: { totalTokenCount: 500 },
      }),
    });

    const { getAgentDrift } = await import('../agentService');
    const result = await getAgentDrift(snapshotA, snapshotB);

    expect(result.drift).toBeDefined();
    expect(result.source).toBe('gemini');
    expect(result.drift.socBriefing).toBe('SOC technical briefing from Gemini');
    expect(result.drift.cisoBriefing).toBe('CISO executive briefing from Gemini');
  });

  /**
   * Req 5.1, 5.5: Single call architecture — getAgentDrift makes exactly
   * one fetch call to Gemini when it succeeds on the first try.
   */
  it('makes exactly one API call when Gemini succeeds (Req 5.1, 5.5)', async () => {
    const unifiedResponse = JSON.stringify({
      socBriefing: 'SOC briefing with MITRE ATT&CK context',
      cisoBriefing: 'CISO briefing with regulatory analysis',
      urgentDecision: 'Escalate to incident commander',
    });

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: unifiedResponse }] } }],
        usageMetadata: { totalTokenCount: 450 },
      }),
    });

    const { getAgentDrift } = await import('../agentService');
    const result = await getAgentDrift(snapshotA, snapshotB);

    expect(result.source).toBe('gemini');
    // Only one fetch call (single-pass, no parallel calls)
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  /**
   * Req 5.5: Groq fallback — Gemini fails (no API key),
   * Groq returns a valid unified response.
   */
  it('falls back to Groq when Gemini unavailable (Req 5.5)', async () => {
    // Remove Gemini key to force Groq fallback
    vi.stubEnv('VITE_GEMINI_API_KEY', '');

    const unifiedResponse = JSON.stringify({
      socBriefing: 'SOC briefing from Groq fallback',
      cisoBriefing: 'CISO briefing with GDPR precedent data',
      urgentDecision: 'Notify DPA within 72 hours',
    });

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: unifiedResponse,
          },
        }],
        usage: { total_tokens: 350 },
      }),
    });

    const { getAgentDrift } = await import('../agentService');
    const result = await getAgentDrift(snapshotA, snapshotB);

    expect(result.source).toBe('groq');
    expect(result.drift.cisoBriefing).toBe('CISO briefing with GDPR precedent data');
  });

  /**
   * Req 5.4: When both Gemini and Groq fail, the system uses local
   * deterministic fallback and sets fallbackReason.
   */
  it('uses deterministic local fallback when all providers fail (Req 5.4)', async () => {
    // Remove both API keys
    vi.stubEnv('VITE_GEMINI_API_KEY', '');
    vi.stubEnv('VITE_GROQ_API_KEY', '');

    const { getAgentDrift } = await import('../agentService');
    const result = await getAgentDrift(snapshotA, snapshotB);

    // Should fall back to local deterministic source
    expect(result.source).toBe('local');
    // Deterministic fallback briefings should be present
    expect(result.drift.socBriefing).toBeDefined();
    expect(result.drift.socBriefing.length).toBeGreaterThan(0);
    expect(result.fallbackReason).toBeDefined();
  });

  /**
   * Req 6.3: Validation failure warning is logged when LLM response
   * doesn't pass unified response validation.
   */
  it('logs validation failure warning and falls back (Req 6.3)', async () => {
    // Gemini returns invalid response (missing urgentDecision)
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('generativelanguage.googleapis.com')) {
        return {
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: '{"socBriefing":"ok","cisoBriefing":"ok"}' }] } }],
          }),
        };
      }
      // Groq also unavailable
      return { ok: false, json: async () => ({}) };
    });

    // Remove Groq key so it skips Groq
    vi.stubEnv('VITE_GROQ_API_KEY', '');

    const { getAgentDrift } = await import('../agentService');
    const result = await getAgentDrift(snapshotA, snapshotB);

    // Should fall back to local since Gemini response was invalid
    expect(result.source).toBe('local');
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[Orchestrator] Gemini response validation failed, trying Groq...'
    );
  });

  /**
   * Req 6.1: Orchestrator logs routing info at each step.
   */
  it('logs orchestrator routing context (Req 6.1)', async () => {
    const unifiedResponse = JSON.stringify({
      socBriefing: 'test soc',
      cisoBriefing: 'test ciso',
      urgentDecision: 'test decision',
    });

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: unifiedResponse }] } }],
      }),
    });

    const { getAgentDrift } = await import('../agentService');
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
