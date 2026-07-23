/**
 * @fileoverview Unit tests for useTelemetryToggle hook.
 * Validates: Requirements 2.5, 3.1, 3.4, 5.3, 5.5
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTelemetryToggle } from '../useTelemetryToggle';

describe('useTelemetryToggle - Unit Tests', () => {
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let localStorageGetItemSpy: ReturnType<typeof vi.spyOn>;
  let sessionStorageGetItemSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    addEventListenerSpy = vi.spyOn(document, 'addEventListener');
    removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
    localStorageGetItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    sessionStorageGetItemSpy = vi.spyOn(Storage.prototype, 'getItem');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('When environment gate is enabled (VITE_SHOW_TELEMETRY = "true")', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_SHOW_TELEMETRY', 'true');
    });

    it('initializes isVisible to false', () => {
      const { result } = renderHook(() => useTelemetryToggle());

      expect(result.current.isVisible).toBe(false);
    });

    it('registers a keydown listener on document on mount', () => {
      renderHook(() => useTelemetryToggle());

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function)
      );
    });

    it('removes the keydown listener on document on unmount', () => {
      const { unmount } = renderHook(() => useTelemetryToggle());

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function)
      );
    });
  });

  describe('When environment gate is disabled', () => {
    it('does NOT register a keydown listener when env is undefined', () => {
      vi.stubEnv('VITE_SHOW_TELEMETRY', '');

      renderHook(() => useTelemetryToggle());

      const keydownCalls = addEventListenerSpy.mock.calls.filter(
        (call: [string, ...unknown[]]) => call[0] === 'keydown'
      );
      expect(keydownCalls).toHaveLength(0);
    });

    it('does NOT register a keydown listener when env is "True" (wrong case)', () => {
      vi.stubEnv('VITE_SHOW_TELEMETRY', 'True');

      renderHook(() => useTelemetryToggle());

      const keydownCalls = addEventListenerSpy.mock.calls.filter(
        (call: [string, ...unknown[]]) => call[0] === 'keydown'
      );
      expect(keydownCalls).toHaveLength(0);
    });
  });

  describe('Storage access on mount', () => {
    it('does NOT read from localStorage or sessionStorage on mount', () => {
      vi.stubEnv('VITE_SHOW_TELEMETRY', 'true');

      renderHook(() => useTelemetryToggle());

      expect(localStorageGetItemSpy).not.toHaveBeenCalled();
      expect(sessionStorageGetItemSpy).not.toHaveBeenCalled();
    });
  });
});
