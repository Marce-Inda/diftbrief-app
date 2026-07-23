/**
 * @fileoverview Property-based tests for useTelemetryToggle hook.
 * Feature: hidden-telemetry-panel
 *
 * This file contains property tests validating correctness properties
 * from the design document. Each describe block tests one property.
 */

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { renderHook, act } from '@testing-library/react';
import { useTelemetryToggle } from '../useTelemetryToggle';

// ─── Property 1: Strict Environment Gate Validation ───────────────────────────
// Feature: hidden-telemetry-panel, Property 1: Strict Environment Gate Validation
// Validates: Requirements 1.1, 1.2, 2.3, 4.2, 5.4, 5.5

describe('Feature: hidden-telemetry-panel, Property 1: Strict Environment Gate Validation', () => {
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    addEventListenerSpy = vi.spyOn(document, 'addEventListener');
  });

  afterEach(() => {
    addEventListenerSpy.mockRestore();
    // Clean up env var
    delete (import.meta.env as Record<string, unknown>).VITE_SHOW_TELEMETRY;
  });

  /**
   * **Validates: Requirements 1.1, 1.2, 2.3, 4.2, 5.4, 5.5**
   *
   * For any string value of VITE_SHOW_TELEMETRY (including undefined, empty,
   * mixed-case variants, "1", or arbitrary strings), the telemetry system SHALL
   * be enabled if and only if the value is exactly "true" (case-sensitive).
   *
   * When disabled: isVisible = false and no keydown listener registered.
   * When enabled: isVisible starts false and a keydown listener IS registered.
   */
  it('only the exact string "true" enables the telemetry system (registers listener and allows toggle)', () => {
    const envValueArb = fc.oneof(
      fc.constant('true' as string | undefined),
      fc.constant('True' as string | undefined),
      fc.constant('TRUE' as string | undefined),
      fc.constant('1' as string | undefined),
      fc.constant('' as string | undefined),
      fc.constant(undefined as string | undefined),
      fc.string(),
    );

    fc.assert(
      fc.property(envValueArb, (envValue) => {
        // Reset spy call count for each iteration
        addEventListenerSpy.mockClear();

        // Set the environment variable
        if (envValue === undefined) {
          delete (import.meta.env as Record<string, unknown>).VITE_SHOW_TELEMETRY;
        } else {
          (import.meta.env as Record<string, unknown>).VITE_SHOW_TELEMETRY = envValue;
        }

        // Render the hook
        const { result, unmount } = renderHook(() => useTelemetryToggle());

        const shouldBeEnabled = envValue === 'true';

        if (shouldBeEnabled) {
          // When enabled: isVisible starts as false
          expect(result.current.isVisible).toBe(false);

          // A keydown listener should have been registered on document
          const keydownCalls = addEventListenerSpy.mock.calls.filter(
            (call: [string, ...unknown[]]) => call[0] === 'keydown',
          );
          expect(keydownCalls.length).toBeGreaterThan(0);
        } else {
          // When disabled: isVisible must always be false
          expect(result.current.isVisible).toBe(false);

          // No keydown listener should be registered
          const keydownCalls = addEventListenerSpy.mock.calls.filter(
            (call: [string, ...unknown[]]) => call[0] === 'keydown',
          );
          expect(keydownCalls.length).toBe(0);
        }

        // Cleanup
        unmount();
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 4: Visibility State Independence ────────────────────────────────
// Feature: hidden-telemetry-panel, Property 4: Visibility State Independence
// Validates: Requirements 3.3

describe('Feature: hidden-telemetry-panel, Property 4: Visibility State Independence', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
    (import.meta.env as Record<string, unknown>).VITE_SHOW_TELEMETRY = 'true';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (import.meta.env as Record<string, unknown>).VITE_SHOW_TELEMETRY;
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * For any sequence of application state changes (role switches between SOC/CISO,
   * snapshot transition changes between A-B/B-C), the isVisible state SHALL remain
   * unchanged from its value prior to the state change sequence. External app state
   * mutations do not affect telemetry visibility.
   *
   * This test toggles visibility to true, then simulates external re-renders
   * (as would happen when parent props/context change) and verifies isVisible
   * remains true throughout.
   */
  it('visibility state (true) remains unchanged after sequences of external app state mutations', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.constant('soc'),
            fc.constant('ciso'),
            fc.constant('A-B'),
            fc.constant('B-C'),
          ),
          { minLength: 1, maxLength: 20 },
        ),
        (stateChanges) => {
          const { result, rerender, unmount } = renderHook(() => useTelemetryToggle());

          // Initially isVisible is false
          expect(result.current.isVisible).toBe(false);

          // Toggle visibility to true via keyboard shortcut
          act(() => {
            const event = new KeyboardEvent('keydown', {
              key: 'D',
              shiftKey: true,
              ctrlKey: true,
              metaKey: false,
              bubbles: true,
            });
            document.dispatchEvent(event);
          });

          // After toggle, isVisible should be true
          expect(result.current.isVisible).toBe(true);

          // Simulate external state changes by re-rendering the hook
          // (as would happen when parent component re-renders due to role/transition changes)
          for (const _change of stateChanges) {
            rerender();
          }

          // Visibility state must remain unchanged after all external state mutations
          expect(result.current.isVisible).toBe(true);

          unmount();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * Same property but for the false state: when visibility has NOT been toggled,
   * external state changes should not inadvertently activate it.
   */
  it('visibility state (false) remains unchanged after sequences of external app state mutations', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.constant('soc'),
            fc.constant('ciso'),
            fc.constant('A-B'),
            fc.constant('B-C'),
          ),
          { minLength: 1, maxLength: 20 },
        ),
        (stateChanges) => {
          const { result, rerender, unmount } = renderHook(() => useTelemetryToggle());

          // Initially isVisible is false — do NOT toggle
          expect(result.current.isVisible).toBe(false);

          // Simulate external state changes by re-rendering the hook
          for (const _change of stateChanges) {
            rerender();
          }

          // Visibility state must remain false after all external state mutations
          expect(result.current.isVisible).toBe(false);

          unmount();
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ─── Property 2: Keyboard Event Discrimination ───────────────────────────────
// Feature: hidden-telemetry-panel, Property 2: Keyboard Event Discrimination
// Validates: Requirements 2.1, 2.2, 2.4

describe('Feature: hidden-telemetry-panel, Property 2: Keyboard Event Discrimination', () => {
  let originalUserAgent: string;

  beforeEach(() => {
    // Enable the telemetry system
    (import.meta.env as Record<string, unknown>).VITE_SHOW_TELEMETRY = 'true';
    originalUserAgent = navigator.userAgent;
  });

  afterEach(() => {
    delete (import.meta.env as Record<string, unknown>).VITE_SHOW_TELEMETRY;
    // Restore original userAgent
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      configurable: true,
    });
  });

  /**
   * **Validates: Requirements 2.1, 2.2, 2.4**
   *
   * For any keyboard event with arbitrary combinations of key, shiftKey, ctrlKey,
   * and metaKey values on any platform (macOS or non-macOS), the hook SHALL toggle
   * the visibility state if and only if: key is "d" (case-insensitive), shiftKey
   * is true, AND the platform-appropriate modifier is active (metaKey on macOS,
   * ctrlKey on Windows/Linux). All other key combinations SHALL produce no state change.
   */
  it('only the correct combination (key="d" case-insensitive + shiftKey + platform modifier) triggers toggle', () => {
    const keyboardEventArb = fc.record({
      key: fc.string(),
      shiftKey: fc.boolean(),
      ctrlKey: fc.boolean(),
      metaKey: fc.boolean(),
    });
    const isMacOSArb = fc.boolean();

    fc.assert(
      fc.property(keyboardEventArb, isMacOSArb, (eventProps, isMacOS) => {
        // Mock navigator.userAgent for platform detection
        const userAgentValue = isMacOS
          ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
          : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

        Object.defineProperty(navigator, 'userAgent', {
          value: userAgentValue,
          configurable: true,
        });

        // Render the hook
        const { result, unmount } = renderHook(() => useTelemetryToggle());

        // Initial state should be false
        expect(result.current.isVisible).toBe(false);

        // Dispatch the keyboard event
        act(() => {
          const keyboardEvent = new KeyboardEvent('keydown', {
            key: eventProps.key,
            shiftKey: eventProps.shiftKey,
            ctrlKey: eventProps.ctrlKey,
            metaKey: eventProps.metaKey,
            bubbles: true,
          });
          document.dispatchEvent(keyboardEvent);
        });

        // Determine expected result based on the hook's logic
        const isTargetKey = eventProps.key === 'D' || eventProps.key === 'd';
        const hasShift = eventProps.shiftKey;
        const hasModifier = isMacOS ? eventProps.metaKey : eventProps.ctrlKey;
        const expectedToggle = isTargetKey && hasShift && hasModifier;

        expect(result.current.isVisible).toBe(expectedToggle);

        // Cleanup
        unmount();
      }),
      { numRuns: 100 },
    );
  });

  it('non-matching keys never change the visibility state regardless of modifiers', () => {
    const nonTargetKeyArb = fc.string().filter((k) => k !== 'd' && k !== 'D');
    const isMacOSArb = fc.boolean();

    fc.assert(
      fc.property(
        nonTargetKeyArb,
        fc.boolean(), // shiftKey
        fc.boolean(), // ctrlKey
        fc.boolean(), // metaKey
        isMacOSArb,
        (key, shiftKey, ctrlKey, metaKey, isMacOS) => {
          const userAgentValue = isMacOS
            ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

          Object.defineProperty(navigator, 'userAgent', {
            value: userAgentValue,
            configurable: true,
          });

          const { result, unmount } = renderHook(() => useTelemetryToggle());

          expect(result.current.isVisible).toBe(false);

          act(() => {
            const keyboardEvent = new KeyboardEvent('keydown', {
              key,
              shiftKey,
              ctrlKey,
              metaKey,
              bubbles: true,
            });
            document.dispatchEvent(keyboardEvent);
          });

          // Non-target keys should never trigger toggle
          expect(result.current.isVisible).toBe(false);

          unmount();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('missing shiftKey prevents toggle even with correct key and platform modifier', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('d', 'D'),
        fc.boolean(), // isMacOS
        (key, isMacOS) => {
          const userAgentValue = isMacOS
            ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

          Object.defineProperty(navigator, 'userAgent', {
            value: userAgentValue,
            configurable: true,
          });

          const { result, unmount } = renderHook(() => useTelemetryToggle());

          act(() => {
            const keyboardEvent = new KeyboardEvent('keydown', {
              key,
              shiftKey: false, // missing shift
              ctrlKey: !isMacOS, // correct modifier for platform
              metaKey: isMacOS, // correct modifier for platform
              bubbles: true,
            });
            document.dispatchEvent(keyboardEvent);
          });

          // Without shiftKey, toggle should not activate
          expect(result.current.isVisible).toBe(false);

          unmount();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('wrong platform modifier prevents toggle (metaKey on non-Mac, ctrlKey on Mac)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('d', 'D'),
        fc.boolean(), // isMacOS
        (key, isMacOS) => {
          const userAgentValue = isMacOS
            ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

          Object.defineProperty(navigator, 'userAgent', {
            value: userAgentValue,
            configurable: true,
          });

          const { result, unmount } = renderHook(() => useTelemetryToggle());

          act(() => {
            // Use the WRONG modifier for the platform
            const keyboardEvent = new KeyboardEvent('keydown', {
              key,
              shiftKey: true,
              ctrlKey: isMacOS, // wrong: ctrlKey on macOS doesn't trigger
              metaKey: !isMacOS, // wrong: metaKey on non-macOS doesn't trigger
              bubbles: true,
            });
            document.dispatchEvent(keyboardEvent);
          });

          // Wrong modifier should not trigger toggle
          expect(result.current.isVisible).toBe(false);

          unmount();
        },
      ),
      { numRuns: 100 },
    );
  });
});
