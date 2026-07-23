/**
 * @fileoverview Custom hook que encapsula la lógica de visibilidad del panel
 * de telemetría. Implementa un mecanismo dual-gate: variable de entorno +
 * atajo de teclado (Ctrl+Shift+D / Cmd+Shift+D).
 */

import { useState, useEffect } from 'react';

/**
 * Resultado del hook useTelemetryToggle.
 */
export interface UseTelemetryToggleResult {
  /** Si el panel de telemetría debe ser visible */
  isVisible: boolean;
}

/**
 * Custom hook que controla la visibilidad del panel de telemetría mediante
 * un mecanismo dual-gate:
 * 1. Environment Gate: `VITE_SHOW_TELEMETRY` debe ser exactamente `"true"`.
 * 2. Keyboard Toggle: `Ctrl+Shift+D` (Win/Linux) o `Cmd+Shift+D` (macOS).
 *
 * Si el environment gate está deshabilitado, no se registra ningún listener
 * y `isVisible` permanece en `false` permanentemente.
 *
 * @returns Objeto con el estado de visibilidad del panel
 */
export function useTelemetryToggle(): UseTelemetryToggleResult {
  const isEnabled = import.meta.env.VITE_SHOW_TELEMETRY === 'true';

  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    const isMacOS = navigator.userAgent.includes('Mac');

    const handleKeyDown = (event: KeyboardEvent): void => {
      const isTargetKey = event.key === 'D' || event.key === 'd';
      const hasShift = event.shiftKey;
      const hasModifier = isMacOS ? event.metaKey : event.ctrlKey;

      if (isTargetKey && hasShift && hasModifier) {
        event.preventDefault();
        setIsVisible((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isEnabled]);

  if (!isEnabled) {
    return { isVisible: false };
  }

  return { isVisible };
}
