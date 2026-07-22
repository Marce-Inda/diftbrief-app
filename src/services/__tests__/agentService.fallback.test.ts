/**
 * @fileoverview Property-based tests for deterministic fallback completeness.
 * Feature: mcp-tool-calling, Property 10: Deterministic fallback completeness
 * Validates: Requirements 8.4
 *
 * For any pair of valid Snapshot objects with valid `id` fields forming a known
 * TransitionId, `calculateDrift` SHALL return a Drift object with non-empty
 * `socBriefing` (string length > 0) and non-empty `cisoBriefing` (string length > 0).
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calculateDrift } from '../driftComparator';
import type { Snapshot, SeverityLevel, ConfidenceLevel, UserRole } from '../../types';

// ─── Import real snapshot data for unit tests ─────────────────────────────────
import snapshotsData from '../../data/snapshots.json';

const snapshotA = snapshotsData[0] as unknown as Snapshot;
const snapshotB = snapshotsData[1] as unknown as Snapshot;
const snapshotC = snapshotsData[2] as unknown as Snapshot;

// ─── Custom Generators ────────────────────────────────────────────────────────

const arbSeverityLevel: fc.Arbitrary<SeverityLevel> = fc.constantFrom('low', 'medium', 'high', 'critical');
const arbConfidenceLevel: fc.Arbitrary<ConfidenceLevel> = fc.constantFrom('unconfirmed', 'probable', 'confirmed');
const arbUserRole: fc.Arbitrary<UserRole> = fc.constantFrom('soc', 'ciso');

/**
 * Generates a valid Snapshot object with a fixed `id` and arbitrary other fields.
 * The `recommendedActions` array always has at least 1 element to ensure briefings
 * have action content to render.
 */
function arbSnapshot(id: string): fc.Arbitrary<Snapshot> {
  return fc.record({
    id: fc.constant(id),
    title: fc.string({ minLength: 1 }),
    timestamp: fc.string({ minLength: 1 }),
    severity: arbSeverityLevel,
    summary: fc.string({ minLength: 1 }),
    facts: fc.array(fc.record({
      id: fc.string({ minLength: 1 }),
      description: fc.string({ minLength: 1 }),
      confidence: arbConfidenceLevel,
      category: fc.string({ minLength: 1 }),
    }), { minLength: 0, maxLength: 3 }),
    hypotheses: fc.array(fc.record({
      id: fc.string({ minLength: 1 }),
      description: fc.string({ minLength: 1 }),
      confidence: arbConfidenceLevel,
    }), { minLength: 0, maxLength: 2 }),
    iocs: fc.array(fc.record({
      type: fc.constantFrom('ip', 'hash', 'domain'),
      value: fc.string({ minLength: 1 }),
      description: fc.string({ minLength: 1 }),
    }), { minLength: 0, maxLength: 3 }),
    recommendedActions: fc.array(fc.record({
      description: fc.string({ minLength: 1 }),
      priority: fc.integer({ min: 1, max: 5 }),
      role: arbUserRole,
    }), { minLength: 1, maxLength: 3 }),
    newEvidence: fc.array(fc.string({ minLength: 1 }), { minLength: 0, maxLength: 3 }),
    impactedAssets: fc.array(fc.string({ minLength: 1 }), { minLength: 0, maxLength: 3 }),
    businessImpact: fc.array(fc.string({ minLength: 1 }), { minLength: 0, maxLength: 3 }),
    openDecisions: fc.array(fc.string({ minLength: 1 }), { minLength: 0, maxLength: 3 }),
  });
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Feature: mcp-tool-calling, Property 10: Deterministic fallback completeness', () => {
  /**
   * **Validates: Requirements 8.4**
   *
   * For any pair of valid Snapshot objects with from.id='A' and to.id='B',
   * calculateDrift returns Drift with non-empty socBriefing and cisoBriefing.
   */
  it('calculateDrift returns Drift with non-empty socBriefing and cisoBriefing for A-B transition', () => {
    fc.assert(
      fc.property(arbSnapshot('A'), arbSnapshot('B'), (from, to) => {
        const drift = calculateDrift(from, to);
        expect(drift.socBriefing.length).toBeGreaterThan(0);
        expect(drift.cisoBriefing.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.4**
   *
   * For any pair of valid Snapshot objects with from.id='B' and to.id='C',
   * calculateDrift returns Drift with non-empty socBriefing and cisoBriefing.
   */
  it('calculateDrift returns Drift with non-empty socBriefing and cisoBriefing for B-C transition', () => {
    fc.assert(
      fc.property(arbSnapshot('B'), arbSnapshot('C'), (from, to) => {
        const drift = calculateDrift(from, to);
        expect(drift.socBriefing.length).toBeGreaterThan(0);
        expect(drift.cisoBriefing.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.4**
   *
   * For any known TransitionId ('A-B' or 'B-C'), the drift.transitionId is correctly set.
   */
  it('calculateDrift sets transitionId correctly for known transitions', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('A-B', 'B-C') as fc.Arbitrary<'A-B' | 'B-C'>,
        fc.oneof(arbSnapshot('A'), arbSnapshot('B')),
        fc.oneof(arbSnapshot('B'), arbSnapshot('C')),
        (transitionId, from, to) => {
          const [fromId, toId] = transitionId.split('-');
          const fromSnapshot = { ...from, id: fromId };
          const toSnapshot = { ...to, id: toId };
          const drift = calculateDrift(fromSnapshot, toSnapshot);
          expect(drift.transitionId).toBe(transitionId);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Unit Tests with Real Snapshot Data ───────────────────────────────────────

describe('Deterministic fallback completeness - Unit Tests', () => {
  /**
   * **Validates: Requirements 8.4**
   *
   * Real snapshot data produces complete Drift for A-B transition.
   */
  it('real snapshot data produces complete Drift for A-B transition', () => {
    const drift = calculateDrift(snapshotA, snapshotB);
    expect(drift.socBriefing.length).toBeGreaterThan(0);
    expect(drift.cisoBriefing.length).toBeGreaterThan(0);
    expect(drift.transitionId).toBe('A-B');
  });

  /**
   * **Validates: Requirements 8.4**
   *
   * Real snapshot data produces complete Drift for B-C transition.
   */
  it('real snapshot data produces complete Drift for B-C transition', () => {
    const drift = calculateDrift(snapshotB, snapshotC);
    expect(drift.socBriefing.length).toBeGreaterThan(0);
    expect(drift.cisoBriefing.length).toBeGreaterThan(0);
    expect(drift.transitionId).toBe('B-C');
  });

  /**
   * **Validates: Requirements 8.4**
   *
   * Drift socBriefing contains SOC-specific header.
   */
  it('socBriefing contains SOC header marker', () => {
    const drift = calculateDrift(snapshotA, snapshotB);
    expect(drift.socBriefing).toContain('SOC');
  });

  /**
   * **Validates: Requirements 8.4**
   *
   * Drift cisoBriefing contains CISO-specific header.
   */
  it('cisoBriefing contains CISO header marker', () => {
    const drift = calculateDrift(snapshotA, snapshotB);
    expect(drift.cisoBriefing).toContain('CISO');
  });
});
