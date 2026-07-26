/**
 * @fileoverview Hook de simulación guiada (Guided Product Tour) para DriftBrief.
 * Gestiona una secuencia automatizada de ~30 segundos que demuestra las
 * capacidades completas del producto: vistas SOC/CISO, modales explicativos,
 * decisiones ejecutivas y exportación de briefings.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { TransitionId, UserRole } from '../types';

/** Estado de la simulación */
export type SimulationStatus = 'idle' | 'running' | 'completed';

/** Paso individual del tour guiado */
export interface TourStep {
  /** Identificador único del paso */
  id: string;
  /** Descripción breve del paso (para debugging/accesibilidad) */
  description: string;
  /** Milisegundos desde el inicio del tour para ejecutar este paso */
  startMs: number;
  /** Acción a ejecutar cuando se alcanza este paso */
  action: SimulationAction;
}

/** Acciones que la simulación puede despachar */
export type SimulationAction =
  | { type: 'SET_TRANSITION'; transition: TransitionId }
  | { type: 'SET_ROLE'; role: UserRole }
  | { type: 'OPEN_TRIAGE_MODAL' }
  | { type: 'CLOSE_TRIAGE_MODAL' }
  | { type: 'OPEN_SNAPSHOT_DETAIL'; snapshotId: string }
  | { type: 'CLOSE_SNAPSHOT_DETAIL' }
  | { type: 'OPEN_FINANCIAL_MODAL' }
  | { type: 'CLOSE_FINANCIAL_MODAL' }
  | { type: 'OPEN_REGULATORY_MODAL'; regulationId: string }
  | { type: 'CLOSE_REGULATORY_MODAL' }
  | { type: 'TRIGGER_COPY_BRIEFING' }
  | { type: 'TRIGGER_DECISION_APPROVAL'; actionId: string }
  | { type: 'SCROLL_TO'; target: 'top' | 'deltas' | 'briefing' | 'decision' }
  | { type: 'COMPLETE' };

/** Duración del badge "Simulación Completada" en milisegundos */
const COMPLETED_BADGE_DURATION_MS = 5000;

/**
 * Secuencia completa del tour guiado (~43 segundos).
 * Cada paso se ejecuta en el momento indicado por startMs.
 * Duración por paso: ~6s (pasos 1-5, 7) y ~7s (paso 6 con animación CISO).
 */
const TOUR_STEPS: TourStep[] = [
  // ── Paso 1 (0s-6s): Transición A-B, Vista SOC, abrir TriageEfficiencyModal ──
  {
    id: 'step-1-init',
    description: 'Iniciar en A-B, Vista SOC',
    startMs: 0,
    action: { type: 'SET_TRANSITION', transition: 'A-B' },
  },
  {
    id: 'step-1-role',
    description: 'Establecer Vista SOC',
    startMs: 100,
    action: { type: 'SET_ROLE', role: 'soc' },
  },
  {
    id: 'step-1-scroll-top',
    description: 'Scroll al inicio para ver métricas',
    startMs: 200,
    action: { type: 'SCROLL_TO', target: 'top' },
  },
  {
    id: 'step-1-open-triage',
    description: 'Abrir modal de eficiencia de triage',
    startMs: 500,
    action: { type: 'OPEN_TRIAGE_MODAL' },
  },

  // ── Paso 2 (6s-12s): Cerrar modal, scroll a Deltas, abrir SnapshotDetailModal ──
  {
    id: 'step-2-close-triage',
    description: 'Cerrar modal de triage',
    startMs: 6000,
    action: { type: 'CLOSE_TRIAGE_MODAL' },
  },
  {
    id: 'step-2-scroll-deltas',
    description: 'Scroll a zona de deltas',
    startMs: 6500,
    action: { type: 'SCROLL_TO', target: 'deltas' },
  },
  {
    id: 'step-2-open-snapshot',
    description: 'Abrir detalle forense de Snapshot B',
    startMs: 7000,
    action: { type: 'OPEN_SNAPSHOT_DETAIL', snapshotId: 'B' },
  },

  // ── Paso 3 (12s-18s): Cerrar modal forense, scroll a briefing, copiar SOC ──
  {
    id: 'step-3-close-snapshot',
    description: 'Cerrar modal de detalle forense',
    startMs: 12000,
    action: { type: 'CLOSE_SNAPSHOT_DETAIL' },
  },
  {
    id: 'step-3-scroll-briefing',
    description: 'Scroll al panel de briefing',
    startMs: 12500,
    action: { type: 'SCROLL_TO', target: 'briefing' },
  },
  {
    id: 'step-3-copy-soc',
    description: 'Disparar copia de briefing SOC',
    startMs: 13500,
    action: { type: 'TRIGGER_COPY_BRIEFING' },
  },

  // ── Paso 4 (18s-24s): Cambiar a B-C + CISO, abrir FinancialRiskModal ──
  {
    id: 'step-4-transition',
    description: 'Cambiar a transición B-C',
    startMs: 18000,
    action: { type: 'SET_TRANSITION', transition: 'B-C' },
  },
  {
    id: 'step-4-role-ciso',
    description: 'Cambiar a Vista CISO',
    startMs: 18200,
    action: { type: 'SET_ROLE', role: 'ciso' },
  },
  {
    id: 'step-4-scroll-top',
    description: 'Scroll al inicio para ver métricas actualizadas',
    startMs: 18500,
    action: { type: 'SCROLL_TO', target: 'top' },
  },
  {
    id: 'step-4-open-financial',
    description: 'Abrir modal de riesgo financiero',
    startMs: 19000,
    action: { type: 'OPEN_FINANCIAL_MODAL' },
  },

  // ── Paso 5 (24s-30s): Cerrar FinancialRisk, abrir RegulatorySlaModal ──
  {
    id: 'step-5-close-financial',
    description: 'Cerrar modal de riesgo financiero',
    startMs: 24000,
    action: { type: 'CLOSE_FINANCIAL_MODAL' },
  },
  {
    id: 'step-5-open-regulatory',
    description: 'Abrir modal de SLA regulatorio (GDPR)',
    startMs: 24500,
    action: { type: 'OPEN_REGULATORY_MODAL', regulationId: 'gdpr' },
  },
  {
    id: 'step-5-close-regulatory',
    description: 'Cerrar modal regulatorio',
    startMs: 30000,
    action: { type: 'CLOSE_REGULATORY_MODAL' },
  },

  // ── Paso 6 (30s-37s): Scroll a decisión, simular aprobación ejecutiva (7s) ──
  {
    id: 'step-6-scroll-decision',
    description: 'Scroll a la decisión urgente CISO',
    startMs: 30500,
    action: { type: 'SCROLL_TO', target: 'decision' },
  },
  {
    id: 'step-6-approve',
    description: 'Simular aprobación ejecutiva de aislamiento',
    startMs: 32000,
    action: { type: 'TRIGGER_DECISION_APPROVAL', actionId: 'approve-isolation' },
  },

  // ── Paso 7 (37s-43s): Copiar briefing CISO y completar ──
  {
    id: 'step-7-scroll-briefing',
    description: 'Scroll al panel de briefing CISO',
    startMs: 37000,
    action: { type: 'SCROLL_TO', target: 'briefing' },
  },
  {
    id: 'step-7-copy-ciso',
    description: 'Disparar copia de briefing CISO',
    startMs: 38000,
    action: { type: 'TRIGGER_COPY_BRIEFING' },
  },
  {
    id: 'step-7-complete',
    description: 'Finalizar simulación',
    startMs: 43000,
    action: { type: 'COMPLETE' },
  },
];

interface UseSimulationOptions {
  /** Transición activa actualmente */
  activeTransition: TransitionId;
  /** Callback para cambiar la transición */
  onTransitionChange: (transition: TransitionId) => void;
  /** Callback para cambiar el rol durante la simulación */
  onRoleChange?: (role: UserRole) => void;
  /** Callback para despachar acciones de simulación a los componentes */
  onAction?: (action: SimulationAction) => void;
}

interface UseSimulationReturn {
  /** Estado actual de la simulación */
  status: SimulationStatus;
  /** Paso activo actual (para indicador de progreso) */
  currentStepIndex: number;
  /** Total de pasos del tour */
  totalSteps: number;
  /** Inicia o pausa la simulación */
  toggle: () => void;
  /** Cancela la simulación (por interacción manual del usuario) */
  cancel: () => void;
}

/**
 * Hook que gestiona la secuencia de tour guiado completo de DriftBrief.
 * Ejecuta una serie de pasos temporizados (~43s) que demuestran el flujo
 * completo del producto incluyendo modales, vistas de rol y exportaciones.
 *
 * @param options - Configuración de la simulación
 * @returns Estado y controles de la simulación
 */
export function useSimulation({
  activeTransition,
  onTransitionChange,
  onRoleChange,
  onAction,
}: UseSimulationOptions): UseSimulationReturn {
  const [status, setStatus] = useState<SimulationStatus>('idle');
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const completedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Limpia todos los temporizadores activos */
  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (completedTimeoutRef.current !== null) {
      clearTimeout(completedTimeoutRef.current);
      completedTimeoutRef.current = null;
    }
  }, []);

  /** Cancela la simulación (para interacción manual del usuario) */
  const cancel = useCallback(() => {
    clearAllTimers();
    setStatus('idle');
    setCurrentStepIndex(0);
  }, [clearAllTimers]);

  /**
   * Ejecuta una acción de simulación, delegando a los callbacks correspondientes.
   */
  const executeAction = useCallback((action: SimulationAction, stepIndex: number) => {
    setCurrentStepIndex(stepIndex);

    switch (action.type) {
      case 'SET_TRANSITION':
        onTransitionChange(action.transition);
        break;
      case 'SET_ROLE':
        onRoleChange?.(action.role);
        break;
      case 'SCROLL_TO': {
        const scrollTargets: Record<string, number> = {
          top: 0,
          deltas: 600,
          briefing: 1200,
          decision: 900,
        };
        window.scrollTo({
          top: scrollTargets[action.target] ?? 0,
          behavior: 'smooth',
        });
        break;
      }
      case 'COMPLETE':
        setStatus('completed');
        break;
      default:
        // Despachar al handler externo (modales, copy, decisiones)
        onAction?.(action);
        break;
    }
  }, [onTransitionChange, onRoleChange, onAction]);

  /** Inicia o pausa la simulación */
  const toggle = useCallback(() => {
    if (status === 'running') {
      // Pausar
      clearAllTimers();
      setStatus('idle');
      return;
    }

    // Resetear estado
    setCurrentStepIndex(0);

    // Si está en la última transición o completada, resetear a A-B
    if (activeTransition === 'B-C' || status === 'completed') {
      onTransitionChange('A-B');
    }

    setStatus('running');
  }, [status, activeTransition, onTransitionChange, clearAllTimers]);

  /** Efecto principal: programa todos los pasos cuando inicia la simulación */
  useEffect(() => {
    if (status !== 'running') return;

    // Programar cada paso como un timeout independiente
    const newTimers = TOUR_STEPS.map((step, index) =>
      setTimeout(() => {
        executeAction(step.action, index);
      }, step.startMs)
    );

    timersRef.current = newTimers;

    return () => {
      newTimers.forEach(clearTimeout);
    };
  }, [status, executeAction]);

  /** Efecto: temporizador para resetear el badge "completada" */
  useEffect(() => {
    if (status === 'completed') {
      completedTimeoutRef.current = setTimeout(() => {
        setStatus('idle');
        setCurrentStepIndex(0);
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
      clearAllTimers();
    };
  }, [clearAllTimers]);

  return {
    status,
    currentStepIndex,
    totalSteps: TOUR_STEPS.length,
    toggle,
    cancel,
  };
}
