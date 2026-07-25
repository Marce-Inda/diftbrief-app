/**
 * @fileoverview Hook personalizado para la simulación automática de evolución del incidente.
 * Gestiona el temporizador que alterna entre transiciones de snapshots y roles.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { TransitionId, UserRole } from '../types';

/** Estado de la simulación */
export type SimulationStatus = 'idle' | 'running' | 'completed';

/** Intervalo entre transiciones en milisegundos (7 segundos para apreciar deltas) */
const TRANSITION_INTERVAL_MS = 7000;

/** Duración del badge "Simulación Completada" en milisegundos */
const COMPLETED_BADGE_DURATION_MS = 4000;

/** Posición vertical de auto-scroll para ubicar la zona de deltas */
const AUTO_SCROLL_TOP = 380;

interface UseSimulationOptions {
  /** Transición activa actualmente */
  activeTransition: TransitionId;
  /** Callback para cambiar la transición */
  onTransitionChange: (transition: TransitionId) => void;
  /** Callback opcional para cambiar el rol durante la simulación */
  onRoleChange?: (role: UserRole) => void;
}

interface UseSimulationReturn {
  /** Estado actual de la simulación */
  status: SimulationStatus;
  /** Inicia o pausa la simulación */
  toggle: () => void;
  /** Cancela la simulación (por interacción manual del usuario) */
  cancel: () => void;
}

/**
 * Hook que gestiona la lógica de simulación automática de evolución del incidente.
 * Alterna secuencialmente entre las transiciones A→B y B→C con un intervalo de 7s.
 * Durante A→B muestra la vista SOC; al pasar a B→C cambia a vista CISO.
 *
 * @param options - Configuración de la simulación
 * @returns Estado y controles de la simulación
 */
export function useSimulation({ activeTransition, onTransitionChange, onRoleChange }: UseSimulationOptions): UseSimulationReturn {
  const [status, setStatus] = useState<SimulationStatus>('idle');
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Limpia todos los temporizadores activos */
  const clearTimers = useCallback(() => {
    if (intervalRef.current !== null) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
    if (completedTimeoutRef.current !== null) {
      clearTimeout(completedTimeoutRef.current);
      completedTimeoutRef.current = null;
    }
  }, []);

  /** Cancela la simulación (para interacción manual del usuario) */
  const cancel = useCallback(() => {
    clearTimers();
    setStatus('idle');
  }, [clearTimers]);

  /**
   * Ejecuta un auto-scroll suave hacia la zona de deltas y comparación.
   * Permite que el usuario vea los cambios relevantes sin esfuerzo.
   */
  const performAutoScroll = useCallback(() => {
    window.scrollTo({ top: AUTO_SCROLL_TOP, behavior: 'smooth' });
  }, []);

  /** Inicia o pausa la simulación */
  const toggle = useCallback(() => {
    if (status === 'running') {
      // Pausar
      clearTimers();
      setStatus('idle');
      return;
    }

    // Si está en la última transición o completada, resetear a A-B primero
    if (activeTransition === 'B-C' || status === 'completed') {
      onTransitionChange('A-B');
    }

    // Establecer vista SOC al inicio de la simulación
    onRoleChange?.('soc');

    // Auto-scroll suave hacia la zona de deltas
    performAutoScroll();

    setStatus('running');
  }, [status, activeTransition, onTransitionChange, onRoleChange, clearTimers, performAutoScroll]);

  /** Efecto principal: gestiona el ciclo de simulación */
  useEffect(() => {
    if (status !== 'running') return;

    if (activeTransition === 'A-B') {
      // Paso 1: En A-B con vista SOC, programar avance a B-C después de 7s
      intervalRef.current = setTimeout(() => {
        onTransitionChange('B-C');
        // Cambiar a vista CISO para mostrar la perspectiva ejecutiva
        onRoleChange?.('ciso');
      }, TRANSITION_INTERVAL_MS);
    } else if (activeTransition === 'B-C') {
      // Paso 2: En B-C con vista CISO, programar finalización después de 7s
      intervalRef.current = setTimeout(() => {
        setStatus('completed');
      }, TRANSITION_INTERVAL_MS);
    }

    return () => {
      if (intervalRef.current !== null) {
        clearTimeout(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [status, activeTransition, onTransitionChange, onRoleChange]);

  /** Efecto: temporizador para resetear el badge "completada" */
  useEffect(() => {
    if (status === 'completed') {
      completedTimeoutRef.current = setTimeout(() => {
        setStatus('idle');
      }, COMPLETED_BADGE_DURATION_MS);

      return () => {
        if (completedTimeoutRef.current !== null) {
          clearTimeout(completedTimeoutRef.current);
          completedTimeoutRef.current = null;
        }
      };
    }
  }, [status]);

  /** Limpieza en desmontaje del componente */
  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  return { status, toggle, cancel };
}
