/**
 * @fileoverview Tipos TypeScript estrictos para DriftBrief.
 * Define el contrato de datos para Snapshots, Drift y Requests.
 */

/** Nivel de severidad del incidente */
export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

/** Nivel de confianza de un hecho o hipótesis */
export type ConfidenceLevel = 'unconfirmed' | 'probable' | 'confirmed';

/** Rol del usuario consumidor del briefing */
export type UserRole = 'soc' | 'ciso';

/** Transición entre snapshots */
export type TransitionId = 'A-B' | 'B-C';

/** Indicador de Compromiso (IOC) */
export interface IOC {
  /** Tipo de indicador (hash, IP, dominio, etc.) */
  type: string;
  /** Valor del indicador */
  value: string;
  /** Descripción del indicador */
  description: string;
}

/** Hecho confirmado dentro de un snapshot */
export interface Fact {
  /** Identificador único del hecho */
  id: string;
  /** Descripción del hecho */
  description: string;
  /** Nivel de confianza */
  confidence: ConfidenceLevel;
  /** Categoría del hecho */
  category: string;
}

/** Hipótesis activa en un snapshot */
export interface Hypothesis {
  /** Identificador único */
  id: string;
  /** Descripción de la hipótesis */
  description: string;
  /** Nivel de confianza */
  confidence: ConfidenceLevel;
  /** Si fue descartada en un snapshot posterior */
  discarded?: boolean;
}

/** Acción recomendada */
export interface RecommendedAction {
  /** Descripción de la acción */
  description: string;
  /** Prioridad (1 = máxima) */
  priority: number;
  /** Rol al que aplica la acción */
  role: UserRole;
}

/** Snapshot de un incidente en un punto en el tiempo */
export interface Snapshot {
  /** Identificador único del snapshot (A, B, C) */
  id: string;
  /** Título descriptivo del snapshot */
  title: string;
  /** Timestamp del snapshot */
  timestamp: string;
  /** Nivel de severidad del incidente en este punto */
  severity: SeverityLevel;
  /** Resumen ejecutivo del estado */
  summary: string;
  /** Hechos confirmados */
  facts: Fact[];
  /** Hipótesis activas */
  hypotheses: Hypothesis[];
  /** Indicadores de compromiso detectados */
  iocs: IOC[];
  /** Acciones recomendadas */
  recommendedActions: RecommendedAction[];
}

/** Solicitud de cálculo de drift */
export interface DriftRequest {
  /** Snapshot de origen */
  fromSnapshotId: string;
  /** Snapshot de destino */
  toSnapshotId: string;
  /** Rol del usuario */
  role: UserRole;
}

/** Cambio de severidad entre snapshots */
export interface SeverityChange {
  /** Severidad anterior */
  from: SeverityLevel;
  /** Severidad actual */
  to: SeverityLevel;
  /** Justificación del cambio */
  justification: string;
}

/** Giro de confianza (cambio en nivel de confianza) */
export interface ConfidenceShift {
  /** ID del hecho o hipótesis */
  itemId: string;
  /** Descripción del item */
  description: string;
  /** Confianza anterior */
  from: ConfidenceLevel;
  /** Confianza actual */
  to: ConfidenceLevel;
}

/** Decisión urgente requerida */
export interface UrgentDecision {
  /** Título de la decisión */
  title: string;
  /** Descripción detallada */
  description: string;
  /** Deadline o contexto temporal */
  deadline: string;
  /** Impacto de no tomar la decisión */
  impact: string;
  /** Rol responsable */
  responsibleRole: UserRole;
}

/** Resultado del cálculo de drift entre dos snapshots */
export interface Drift {
  /** Transición calculada */
  transitionId: TransitionId;
  /** Headline del cambio más importante */
  headline: string;
  /** Nuevos hechos confirmados */
  newFacts: Fact[];
  /** Cambio de severidad */
  severityChange: SeverityChange;
  /** Giros de confianza */
  confidenceShifts: ConfidenceShift[];
  /** Hipótesis descartadas */
  discardedHypotheses: Hypothesis[];
  /** Nuevos IOCs detectados */
  newIOCs: IOC[];
  /** Decisión urgente requerida */
  urgentDecision: UrgentDecision;
  /** Acciones recomendadas según el rol */
  recommendedActions: RecommendedAction[];
  /** Briefing de texto para el rol SOC */
  socBriefing: string;
  /** Briefing de texto para el rol CISO */
  cisoBriefing: string;
}
