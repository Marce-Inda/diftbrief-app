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
  /** Nueva evidencia técnica relevante para el SOC */
  newEvidence: string[];
  /** Activos afectados identificados */
  impactedAssets: string[];
  /** Impacto de negocio para perspectiva ejecutiva (CISO) */
  businessImpact: string[];
  /** Decisiones pendientes de tomar */
  openDecisions: string[];
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

// ─── Knowledge Base Types ─────────────────────────────────────────────────────

/** Artículo o referencia clave dentro de una regulación */
export interface RegulatoryArticle {
  /** Identificador del artículo (ej. "Art. 33") */
  id: string;
  /** Título o tema del artículo */
  title: string;
  /** Resumen de la obligación */
  summary: string;
}

/** Regulación o marco legal de ciberseguridad/privacidad */
export interface Regulation {
  /** Identificador corto de la regulación */
  id: string;
  /** Nombre completo */
  name: string;
  /** Jurisdicción aplicable */
  jurisdiction: string;
  /** Ámbito de aplicación */
  scope: string;
  /** Tiempo máximo de notificación obligatoria (en horas, si aplica) */
  notificationDeadlineHours: number | null;
  /** Descripción de multas o sanciones */
  penalties: string;
  /** Artículos clave relevantes para respuesta a incidentes */
  keyArticles: RegulatoryArticle[];
}

/** Táctica del framework MITRE ATT&CK */
export interface MitreAttackTactic {
  /** ID de la táctica (ej. "TA0010") */
  id: string;
  /** Nombre de la táctica */
  name: string;
  /** Descripción breve */
  description: string;
  /** Técnicas comunes asociadas */
  commonTechniques: string[];
  /** Mitigaciones recomendadas */
  mitigations: string[];
}

/** Paso de un playbook de respuesta a incidentes */
export interface PlaybookStep {
  /** Orden del paso */
  order: number;
  /** Acción a realizar */
  action: string;
  /** Detalle de la acción */
  detail: string;
}

/** Playbook (directriz estándar) de respuesta a incidentes */
export interface IncidentPlaybook {
  /** Identificador del playbook */
  id: string;
  /** Nombre del playbook */
  name: string;
  /** Cuándo aplicar este playbook */
  applicableWhen: string;
  /** Prioridad (1 = máxima) */
  priority: number;
  /** Pasos del playbook */
  steps: PlaybookStep[];
}

/** Estructura completa de la base de conocimiento de seguridad */
export interface SecurityKnowledgeBase {
  /** Regulaciones y marcos legales */
  regulations: Regulation[];
  /** Tácticas MITRE ATT&CK relevantes */
  frameworks: MitreAttackTactic[];
  /** Playbooks de respuesta a incidentes */
  playbooks: IncidentPlaybook[];
}

// ─── Drift Types ──────────────────────────────────────────────────────────────

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
