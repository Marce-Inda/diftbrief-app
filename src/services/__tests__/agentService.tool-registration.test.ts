/**
 * @fileoverview Property-based tests for tool registration and prompt instruction conditionality.
 * Tests Property 4 from the design document: SOC prompt instruction presence is conditional on IOCs.
 *
 * **Validates: Requirements 3.4, 3.5**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { Drift, TransitionId, IOC, SeverityLevel, UserRole } from '../../types';
import { buildSOCSystemPrompt } from '../agentService';

// ─── Arbitrary Generators ─────────────────────────────────────────────────────

const arbIOC: fc.Arbitrary<IOC> = fc.record({
  type: fc.constantFrom('ip', 'hash', 'domain', 'account'),
  value: fc.string({ minLength: 1 }),
  description: fc.string({ minLength: 1 }),
});

const arbSeverityLevel: fc.Arbitrary<SeverityLevel> = fc.constantFrom('low', 'medium', 'high', 'critical');
const arbUserRole: fc.Arbitrary<UserRole> = fc.constantFrom('soc', 'ciso');

/** Base Drift generator (shared structure without newIOCs) */
function arbDriftBase(newIOCs: fc.Arbitrary<IOC[]>): fc.Arbitrary<Drift> {
  return fc.record({
    transitionId: fc.constantFrom('A-B', 'B-C') as fc.Arbitrary<TransitionId>,
    headline: fc.string({ minLength: 1 }),
    newFacts: fc.constant([]),
    severityChange: fc.record({
      from: arbSeverityLevel,
      to: arbSeverityLevel,
      justification: fc.string(),
    }),
    confidenceShifts: fc.constant([]),
    discardedHypotheses: fc.constant([]),
    newIOCs,
    urgentDecision: fc.record({
      title: fc.string(),
      description: fc.string(),
      deadline: fc.string(),
      impact: fc.string(),
      responsibleRole: arbUserRole,
    }),
    recommendedActions: fc.constant([]),
    socBriefing: fc.string({ minLength: 1 }),
    cisoBriefing: fc.string({ minLength: 1 }),
  });
}

/** Drift with at least one IOC */
const arbDriftWithIOCs = arbDriftBase(fc.array(arbIOC, { minLength: 1, maxLength: 5 }));

/** Drift with zero IOCs */
const arbDriftWithoutIOCs = arbDriftBase(fc.constant([]));

// ─── Property 4: SOC prompt instruction presence is conditional on IOCs ───────

describe('Feature: mcp-tool-calling, Property 4: SOC prompt instruction presence is conditional on IOCs', () => {
  it('WHEN drift has IOCs (newIOCs.length > 0), the SOC system prompt SHALL contain the tool invocation instruction', () => {
    fc.assert(
      fc.property(arbDriftWithIOCs, (drift) => {
        const prompt = buildSOCSystemPrompt(drift);

        // Must contain the tool invocation instruction section
        expect(prompt).toContain('HERRAMIENTA DISPONIBLE');
        expect(prompt).toContain('queryThreatIntelligence');
        // Must contain at least one IOC value from the drift
        for (const ioc of drift.newIOCs) {
          expect(prompt).toContain(ioc.value);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('WHEN drift has zero IOCs (newIOCs.length === 0), the SOC system prompt SHALL NOT contain the tool invocation instruction', () => {
    fc.assert(
      fc.property(arbDriftWithoutIOCs, (drift) => {
        const prompt = buildSOCSystemPrompt(drift);

        // Must NOT contain the tool invocation instruction section
        expect(prompt).not.toContain('HERRAMIENTA DISPONIBLE');
        // Must NOT contain the tool invocation directive
        expect(prompt).not.toContain('queryThreatIntelligence');
      }),
      { numRuns: 100 }
    );
  });
});
