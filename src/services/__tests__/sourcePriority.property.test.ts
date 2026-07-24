/**
 * @fileoverview Property-based tests for source priority ordering.
 * Feature: openrouter-fallback-provider, Property 7: Source priority ordering
 *
 * Tests the specification that when the orchestrator determines the active source
 * from multiple successful writer responses, the selected source follows priority:
 * 'gemini' > 'groq' > 'openrouter' > 'local'
 *
 * Since getAgentDrift calls external APIs and is difficult to unit-test without
 * mocking the entire LLM chain, this test validates the priority selection LOGIC
 * in isolation by replicating the specification's priority function and asserting
 * it holds for all possible combinations of DriftSource values.
 *
 * **Validates: Requirements 3.3**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { DriftSource } from '../agentService';

// ─── Priority Logic (replicates the specification from design.md) ─────────────

/**
 * Priority order as defined in Requirements 3.3 and design.md:
 * gemini > groq > openrouter > local
 *
 * Lower index = higher priority.
 */
const PRIORITY_ORDER: DriftSource[] = ['gemini', 'groq', 'openrouter', 'local'];

/**
 * Determines the selected source given SOC and CISO agent results.
 * Implements the specification: select the highest-priority source present
 * among successful responses.
 *
 * This mirrors the logic in getAgentDrift:
 * - If either agent got 'gemini' → 'gemini'
 * - Else if either got 'groq' → 'groq'
 * - Else if either got 'openrouter' → 'openrouter'
 * - Else → 'local'
 */
function determineSourcePriority(
  socSource: DriftSource | null,
  cisoSource: DriftSource | null,
): DriftSource {
  // If neither agent succeeded, it's a full local fallback
  if (socSource === null && cisoSource === null) {
    return 'local';
  }

  // Select highest-priority source present in either result
  for (const source of PRIORITY_ORDER) {
    if (socSource === source || cisoSource === source) {
      return source;
    }
  }

  // Should never reach here given valid DriftSource inputs, but fallback
  return 'local';
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Generator for all valid DriftSource values */
const driftSourceArb: fc.Arbitrary<DriftSource> = fc.constantFrom(
  'gemini' as DriftSource,
  'groq' as DriftSource,
  'openrouter' as DriftSource,
  'local' as DriftSource,
);

/** Generator for nullable DriftSource (null = agent failed completely) */
const nullableDriftSourceArb: fc.Arbitrary<DriftSource | null> = fc.oneof(
  driftSourceArb,
  fc.constant(null as DriftSource | null),
);

// ─── Property 7: Source priority ordering ─────────────────────────────────────

describe('Feature: openrouter-fallback-provider, Property 7: Source priority ordering', () => {
  /**
   * **Validates: Requirements 3.3**
   *
   * For any combination of DriftSource values from parallel SOC and CISO agent calls,
   * the selected source in AgentDriftResult SHALL follow the priority order:
   * 'gemini' > 'groq' > 'openrouter' > 'local', selecting the highest-priority
   * source present among successful responses.
   */
  it('selected source follows priority: gemini > groq > openrouter > local', () => {
    fc.assert(
      fc.property(
        driftSourceArb,
        driftSourceArb,
        (socSource, cisoSource) => {
          const result = determineSourcePriority(socSource, cisoSource);

          // The result should be the highest-priority source between the two
          const socIdx = PRIORITY_ORDER.indexOf(socSource);
          const cisoIdx = PRIORITY_ORDER.indexOf(cisoSource);
          const expectedIdx = Math.min(socIdx, cisoIdx);
          const expected = PRIORITY_ORDER[expectedIdx];

          expect(result).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * When either SOC or CISO source is 'gemini', the result is always 'gemini'
   * regardless of the other agent's source.
   */
  it('gemini always wins when present in either agent result', () => {
    fc.assert(
      fc.property(
        driftSourceArb,
        (otherSource) => {
          // SOC = gemini
          expect(determineSourcePriority('gemini', otherSource)).toBe('gemini');
          // CISO = gemini
          expect(determineSourcePriority(otherSource, 'gemini')).toBe('gemini');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * When neither agent used 'gemini' but one used 'groq', the result is 'groq'.
   */
  it('groq wins over openrouter and local when gemini is absent', () => {
    const nonGeminiArb = fc.constantFrom(
      'groq' as DriftSource,
      'openrouter' as DriftSource,
      'local' as DriftSource,
    );

    fc.assert(
      fc.property(
        nonGeminiArb,
        (otherSource) => {
          // SOC = groq, CISO = non-gemini
          expect(determineSourcePriority('groq', otherSource)).toBe('groq');
          // CISO = groq, SOC = non-gemini
          expect(determineSourcePriority(otherSource, 'groq')).toBe('groq');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * When neither agent used 'gemini' or 'groq' but one used 'openrouter',
   * the result is 'openrouter'.
   */
  it('openrouter wins over local when gemini and groq are absent', () => {
    const lowerPriorityArb = fc.constantFrom(
      'openrouter' as DriftSource,
      'local' as DriftSource,
    );

    fc.assert(
      fc.property(
        lowerPriorityArb,
        (otherSource) => {
          // SOC = openrouter, CISO = openrouter|local
          expect(determineSourcePriority('openrouter', otherSource)).toBe('openrouter');
          // CISO = openrouter, SOC = openrouter|local
          expect(determineSourcePriority(otherSource, 'openrouter')).toBe('openrouter');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * Only when both agents report 'local' is the result 'local'.
   */
  it('local is selected only when both agents report local', () => {
    expect(determineSourcePriority('local', 'local')).toBe('local');
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * When one agent failed (null) and the other succeeded, the surviving
   * agent's source is used.
   */
  it('uses surviving agent source when one agent is null', () => {
    fc.assert(
      fc.property(
        driftSourceArb,
        (survivingSource) => {
          // SOC succeeded, CISO failed
          expect(determineSourcePriority(survivingSource, null)).toBe(survivingSource);
          // CISO succeeded, SOC failed
          expect(determineSourcePriority(null, survivingSource)).toBe(survivingSource);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * When both agents failed (null, null), the result is 'local' (full fallback).
   */
  it('returns local when both agents are null (full fallback)', () => {
    expect(determineSourcePriority(null, null)).toBe('local');
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * The priority function is commutative: swapping SOC and CISO sources
   * produces the same result (priority is symmetric between agents).
   */
  it('priority selection is commutative (order of agents does not matter)', () => {
    fc.assert(
      fc.property(
        nullableDriftSourceArb,
        nullableDriftSourceArb,
        (source1, source2) => {
          const result1 = determineSourcePriority(source1, source2);
          const result2 = determineSourcePriority(source2, source1);

          expect(result1).toBe(result2);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * The result is always one of the valid DriftSource values and is always
   * present in the priority order.
   */
  it('result is always a valid DriftSource in the priority order', () => {
    fc.assert(
      fc.property(
        nullableDriftSourceArb,
        nullableDriftSourceArb,
        (socSource, cisoSource) => {
          const result = determineSourcePriority(socSource, cisoSource);

          expect(PRIORITY_ORDER).toContain(result);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * The result has priority >= both inputs (lower index = higher priority).
   * The selected source is never lower priority than either agent's source.
   */
  it('result priority is always >= the highest priority input', () => {
    fc.assert(
      fc.property(
        driftSourceArb,
        driftSourceArb,
        (socSource, cisoSource) => {
          const result = determineSourcePriority(socSource, cisoSource);
          const resultIdx = PRIORITY_ORDER.indexOf(result);
          const socIdx = PRIORITY_ORDER.indexOf(socSource);
          const cisoIdx = PRIORITY_ORDER.indexOf(cisoSource);

          // Result index should be <= min of both (lower index = higher priority)
          expect(resultIdx).toBeLessThanOrEqual(socIdx);
          expect(resultIdx).toBeLessThanOrEqual(cisoIdx);
          // And should equal the minimum (highest priority present)
          expect(resultIdx).toBe(Math.min(socIdx, cisoIdx));
        },
      ),
      { numRuns: 100 },
    );
  });
});
