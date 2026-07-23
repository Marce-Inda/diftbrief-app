/**
 * @fileoverview Property-based tests for TelemetryPanel component.
 * Feature: hidden-telemetry-panel, Property 5: Telemetry Data Rendering Completeness
 * Validates: Requirements 4.1, 4.5
 */

// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { render } from '@testing-library/react';
import { TelemetryPanel } from '../TelemetryPanel';
import type { TelemetryData } from '../../types';

// ─── Property 5: Telemetry Data Rendering Completeness ────────────────────────
// Feature: hidden-telemetry-panel, Property 5: Telemetry Data Rendering Completeness
// Validates: Requirements 4.1, 4.5

describe('Feature: hidden-telemetry-panel, Property 5: Telemetry Data Rendering Completeness', () => {
  /**
   * **Validates: Requirements 4.1, 4.5**
   *
   * For any TelemetryData object with an arbitrary combination of null and non-null
   * values for tokensConsumed, latencyMs, and estimatedCost, the TelemetryPanel SHALL
   * render: formatted numeric values for each non-null field and a placeholder indicator
   * (—) for each null field. No field SHALL be rendered as empty or with stale data.
   */
  it('renders correct formatting for non-null values and placeholder for null values', () => {
    const telemetryDataArb = fc.record({
      tokensConsumed: fc.option(fc.nat(), { nil: null }),
      latencyMs: fc.option(fc.nat(), { nil: null }),
      estimatedCost: fc.option(
        fc.float({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
        { nil: null },
      ),
    }) as fc.Arbitrary<TelemetryData>;

    fc.assert(
      fc.property(telemetryDataArb, (data) => {
        const { container } = render(<TelemetryPanel data={data} />);
        const textContent = container.textContent ?? '';

        // Verify tokensConsumed rendering
        if (data.tokensConsumed !== null) {
          const expectedTokens = Math.round(data.tokensConsumed).toLocaleString();
          expect(textContent).toContain(expectedTokens);
        }

        // Verify latencyMs rendering
        if (data.latencyMs !== null) {
          const expectedLatency = `${Math.round(data.latencyMs)} ms`;
          expect(textContent).toContain(expectedLatency);
        }

        // Verify estimatedCost rendering
        if (data.estimatedCost !== null) {
          const expectedCost = `$${data.estimatedCost.toFixed(4)}`;
          expect(textContent).toContain(expectedCost);
        }

        // Verify placeholder indicators for null values
        // Count how many fields are null — each should produce a "—" placeholder
        const nullCount = [
          data.tokensConsumed,
          data.latencyMs,
          data.estimatedCost,
        ].filter((v) => v === null).length;

        const placeholderMatches = (textContent.match(/—/g) ?? []).length;
        expect(placeholderMatches).toBe(nullCount);
      }),
      { numRuns: 100 },
    );
  });
});
