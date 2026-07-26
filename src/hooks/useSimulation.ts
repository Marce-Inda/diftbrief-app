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
 * Secuencia completa del tour guiado (~40 segundos).
 * Narrativa: "Panorama General ➔ Profundización Interactiva"
 *
 * FASE 1 (0s-12s): Recorrido panorámico visual con auto-scrolls temporizados
 * para que el usuario conozca la estructura completa del dashboard.
 *
 * FASE 2 (12s-40s): Retorno al inicio y profundización interactiva con
 * apertura secuencial de modales, cambio de vistas y acciones ejecutivas.
 */
const TOUR_STEPS: TourStep[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // FASE 1: PANORAMA GENERAL (0s - 12s)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Paso 1 (0s - 4s): Inicio en top, Vista SOC, transición A-B ──
  {
    id: 'phase1-step1-init',
    description: 'Iniciar en A-B, Vista SOC, scroll a top',
    startMs: 0,
    action: { type: 'SET_TRANSITION', transition: 'A-B' },
  },
  {
    id: 'phase1-step1-role',
    description: 'Establecer Vista SOC',
    startMs: 100,
    action: { type: 'SET_ROLE', role: 'soc' },
  },
  {
    id: 'phase1-step1-scroll',
    description: 'Scroll a top para observar encabezado',
    startMs: 200,
    action: { type: 'SCROLL_TO', target: 'top' },
  },

  // ── Paso 2 (4s - 8s): Auto-scroll a zona de deltas/timeline ──
  {
    id: 'phase1-step2-scroll-deltas',
    description: 'Scroll suave a deltas para observar timeline',
    startMs: 4000,
    action: { type: 'SCROLL_TO', target: 'deltas' },
  },

  // ── Paso 3 (8s - 12s): Auto-scroll a zona inferior (briefing/decision) ──
  {
    id: 'phase1-step3-scroll-briefing',
    description: 'Scroll suave a briefing/decision para ver parte inferior',
    startMs: 8000,
    action: { type: 'SCROLL_TO', target: 'briefing' },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE 2: PROFUNDIZACIÓN INTERACTIVA (12s - 40s)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Paso 4 (12s - 15s): Retorno a top, inicio de interactividad ──
  {
    id: 'phase2-step4-scroll-top',
    description: 'Retorno suave a top para iniciar interactividad',
    startMs: 12000,
    action: { type: 'SCROLL_TO', target: 'top' },
  },

  // ── Paso 5 (15s - 20s): Abrir TriageModal, cerrar, scroll a deltas, abrir SnapshotDetail ──
  {
    id: 'phase2-step5-open-triage',
    description: 'Abrir modal de eficiencia de triage',
    startMs: 15000,
    action: { type: 'OPEN_TRIAGE_MODAL' },
  },
  {
    id: 'phase2-step5-close-triage',
    description: 'Cerrar modal de triage',
    startMs: 17000,
    action: { type: 'CLOSE_TRIAGE_MODAL' },
  },
  {
    id: 'phase2-step5-scroll-deltas',
    description: 'Scroll a deltas para abrir detalle forense',
    startMs: 17500,
    action: { type: 'SCROLL_TO', target: 'deltas' },
  },
  {
    id: 'phase2-step5-open-snapshot',
    description: 'Abrir detalle forense de Snapshot B',
    startMs: 18500,
    action: { type: 'OPEN_SNAPSHOT_DETAIL', snapshotId: 'B' },
  },
  {
    id: 'phase2-step5-close-snapshot',
    description: 'Cerrar modal de detalle forense',
    startMs: 20000,
    action: { type: 'CLOSE_SNAPSHOT_DETAIL' },
  },

  // ── Paso 6 (20s - 26s): Cambiar a B-C + CISO, scroll top, abrir modales financieros ──
  {
    id: 'phase2-step6-transition',
    description: 'Cambiar a transición B-C',
    startMs: 20500,
    action: { type: 'SET_TRANSITION', transition: 'B-C' },
  },
  {
    id: 'phase2-step6-role-ciso',
    description: 'Cambiar a Vista CISO',
    startMs: 20700,
    action: { type: 'SET_ROLE', role: 'ciso' },
  },
  {
    id: 'phase2-step6-scroll-top',
    description: 'Scroll a top para vista CISO',
    startMs: 21000,
    action: { type: 'SCROLL_TO', target: 'top' },
  },
  {
    id: 'phase2-step6-open-financial',
    description: 'Abrir modal de riesgo financiero',
    startMs: 22000,
    action: { type: 'OPEN_FINANCIAL_MODAL' },
  },
  {
    id: 'phase2-step6-close-financial',
    description: 'Cerrar modal de riesgo financiero',
    startMs: 24000,
    action: { type: 'CLOSE_FINANCIAL_MODAL' },
  },
  {
    id: 'phase2-step6-open-regulatory',
    description: 'Abrir modal de SLA regulatorio (GDPR)',
    startMs: 24500,
    action: { type: 'OPEN_REGULATORY_MODAL', regulationId: 'gdpr' },
  },
  {
    id: 'phase2-step6-close-regulatory',
    description: 'Cerrar modal regulatorio',
    startMs: 26000,
    action: { type: 'CLOSE_REGULATORY_MODAL' },
  },

  // ── Paso 7 (26s - 34s): Scroll a decision, simular aprobación ejecutiva ──
  {
    id: 'phase2-step7-scroll-decision',
    description: 'Scroll a la decisión urgente CISO',
    startMs: 26500,
    action: { type: 'SCROLL_TO', target: 'decision' },
  },
  {
    id: 'phase2-step7-approve',
    description: 'Simular aprobación ejecutiva de aislamiento',
    startMs: 28000,
    action: { type: 'TRIGGER_DECISION_APPROVAL', actionId: 'approve-isolation' },
  },

  // ── Paso 8 (34s - 40s): Scroll a briefing, copiar briefing CISO y completar ──
  {
    id: 'phase2-step8-scroll-briefing',
    description: 'Scroll al panel de briefing CISO',
    startMs: 34000,
    action: { type: 'SCROLL_TO', target: 'briefing' },
  },
  {
    id: 'phase2-step8-copy-ciso',
    description: 'Disparar copia de briefing CISO',
    startMs: 36000,
    action: { type: 'TRIGGER_COPY_BRIEFING' },
  },
  {
    id: 'phase2-step8-complete',
    description: 'Finalizar simulación',
    startMs: 40000,
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
