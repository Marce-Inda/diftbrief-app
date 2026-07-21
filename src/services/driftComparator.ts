/**
 * @fileoverview Motor determinista de cálculo de Drift entre snapshots.
 * Funciones puras que comparan dos snapshots y producen un objeto Drift estructurado.
 */

import type {
  Snapshot,
  Drift,
  TransitionId,
  SeverityChange,
  ConfidenceShift,
  Fact,
  Hypothesis,
  IOC,
  RecommendedAction,
  UserRole,
} from '../types';

/**
 * Identifica hechos nuevos en el snapshot destino que no existían en el origen.
 * @param from - Snapshot de origen
 * @param to - Snapshot de destino
 * @returns Array de hechos nuevos confirmados
 */
export function findNewFacts(from: Snapshot, to: Snapshot): Fact[] {
  const existingIds = new Set(from.facts.map((f) => f.id));
  return to.facts.filter((f) => !existingIds.has(f.id));
}

/**
 * Calcula el cambio de severidad entre dos snapshots.
 * @param from - Snapshot de origen
 * @param to - Snapshot de destino
 * @returns Objeto SeverityChange con justificación
 */
export function calculateSeverityChange(from: Snapshot, to: Snapshot): SeverityChange {
  const justifications: Record<string, string> = {
    'medium-critical': 'Escalación de anomalía técnica a compromiso confirmado con exfiltración activa',
    'critical-critical': 'Severidad se mantiene crítica: crisis institucional con presión mediática y regulatoria',
    'low-medium': 'Indicadores iniciales sugieren actividad sospechosa',
    'medium-high': 'Confirmación de acceso no autorizado',
    'high-critical': 'Compromiso activo con impacto operacional',
  };

  const key = `${from.severity}-${to.severity}`;
  const justification = justifications[key] || `Cambio de severidad de ${from.severity} a ${to.severity}`;

  return {
    from: from.severity,
    to: to.severity,
    justification,
  };
}

/**
 * Detecta giros de confianza: items cuyo nivel de confianza cambió entre snapshots.
 * @param from - Snapshot de origen
 * @param to - Snapshot de destino
 * @returns Array de cambios de confianza
 */
export function findConfidenceShifts(from: Snapshot, to: Snapshot): ConfidenceShift[] {
  const shifts: ConfidenceShift[] = [];

  const fromFactsMap = new Map(from.facts.map((f) => [f.id, f]));
  for (const toFact of to.facts) {
    const fromFact = fromFactsMap.get(toFact.id);
    if (fromFact && fromFact.confidence !== toFact.confidence) {
      shifts.push({
        itemId: toFact.id,
        description: toFact.description,
        from: fromFact.confidence,
        to: toFact.confidence,
      });
    }
  }

  const fromHypMap = new Map(from.hypotheses.map((h) => [h.id, h]));
  for (const toHyp of to.hypotheses) {
    const fromHyp = fromHypMap.get(toHyp.id);
    if (fromHyp && fromHyp.confidence !== toHyp.confidence) {
      shifts.push({
        itemId: toHyp.id,
        description: toHyp.description,
        from: fromHyp.confidence,
        to: toHyp.confidence,
      });
    }
  }

  return shifts;
}

/**
 * Identifica hipótesis que fueron descartadas entre snapshots.
 * @param from - Snapshot de origen
 * @param to - Snapshot de destino
 * @returns Array de hipótesis descartadas
 */
export function findDiscardedHypotheses(from: Snapshot, to: Snapshot): Hypothesis[] {
  const toHypIds = new Set(to.hypotheses.map((h) => h.id));
  return from.hypotheses
    .filter((h) => !toHypIds.has(h.id))
    .map((h) => ({ ...h, discarded: true }));
}

/**
 * Identifica nuevos IOCs en el snapshot destino.
 * @param from - Snapshot de origen
 * @param to - Snapshot de destino
 * @returns Array de nuevos IOCs
 */
export function findNewIOCs(from: Snapshot, to: Snapshot): IOC[] {
  const existingValues = new Set(from.iocs.map((i) => i.value));
  return to.iocs.filter((i) => !existingValues.has(i.value));
}

/**
 * Filtra acciones recomendadas según el rol del usuario.
 * @param actions - Array de acciones recomendadas
 * @param role - Rol del usuario
 * @returns Acciones filtradas y ordenadas por prioridad
 */
export function filterActionsByRole(actions: RecommendedAction[], role: UserRole): RecommendedAction[] {
  return actions
    .filter((a) => a.role === role)
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Genera el headline principal del drift.
 * @param transitionId - ID de la transición
 * @param severityChange - Cambio de severidad
 * @param newFacts - Nuevos hechos
 * @returns Headline descriptivo
 */
export function generateHeadline(
  transitionId: TransitionId,
  severityChange: SeverityChange,
  newFacts: Fact[]
): string {
  const headlines: Record<TransitionId, string> = {
    'A-B': '⚠️ ESCALACIÓN CRÍTICA: Malware X-Agent confirmado con exfiltración activa de datos del padrón electoral',
    'B-C': '🔴 CRISIS INSTITUCIONAL: Exposición mediática inminente — Decisión de comunicación pública requerida',
  };

  return headlines[transitionId] || `Drift detectado: ${newFacts.length} nuevos hechos, severidad ${severityChange.from} → ${severityChange.to}`;
}

/**
 * Genera el briefing de texto para el rol SOC.
 * @param drift - Datos parciales del drift
 * @returns Briefing formateado para SOC
 */
function generateSOCBriefing(
  headline: string,
  newFacts: Fact[],
  newIOCs: IOC[],
  actions: RecommendedAction[]
): string {
  const socActions = actions.filter((a) => a.role === 'soc');
  const lines: string[] = [
    `== DRIFT BRIEFING (SOC) ==`,
    ``,
    headline,
    ``,
    `--- NUEVOS HECHOS CONFIRMADOS ---`,
    ...newFacts.map((f) => `• [${f.confidence.toUpperCase()}] ${f.description}`),
    ``,
    `--- NUEVOS IOCs ---`,
    ...newIOCs.map((i) => `• [${i.type.toUpperCase()}] ${i.value} — ${i.description}`),
    ``,
    `--- ACCIONES PRIORITARIAS ---`,
    ...socActions.map((a) => `${a.priority}. ${a.description}`),
  ];
  return lines.join('\n');
}

/**
 * Genera el briefing de texto para el rol CISO.
 * @param headline - Headline del drift
 * @param severityChange - Cambio de severidad
 * @param urgentDecisionTitle - Título de la decisión urgente
 * @param urgentDecisionDesc - Descripción de la decisión
 * @param actions - Acciones recomendadas
 * @returns Briefing formateado para CISO
 */
function generateCISOBriefing(
  headline: string,
  severityChange: SeverityChange,
  urgentDecisionTitle: string,
  urgentDecisionDesc: string,
  actions: RecommendedAction[]
): string {
  const cisoActions = actions.filter((a) => a.role === 'ciso');
  const lines: string[] = [
    `== DRIFT BRIEFING (CISO) ==`,
    ``,
    headline,
    ``,
    `--- EVALUACIÓN DE RIESGO ---`,
    `Severidad: ${severityChange.from.toUpperCase()} → ${severityChange.to.toUpperCase()}`,
    `Justificación: ${severityChange.justification}`,
    ``,
    `--- DECISIÓN URGENTE ---`,
    `${urgentDecisionTitle}`,
    `${urgentDecisionDesc}`,
    ``,
    `--- ACCIONES ESTRATÉGICAS ---`,
    ...cisoActions.map((a) => `${a.priority}. ${a.description}`),
  ];
  return lines.join('\n');
}

/**
 * Obtiene la decisión urgente precalculada para cada transición.
 * @param transitionId - ID de la transición
 * @returns Decisión urgente estructurada
 */
function getUrgentDecision(transitionId: TransitionId) {
  const decisions: Record<TransitionId, {
    title: string;
    description: string;
    deadline: string;
    impact: string;
    responsibleRole: UserRole;
  }> = {
    'A-B': {
      title: 'Activar Protocolo de Incidente Nacional',
      description: 'Compromiso confirmado por APT estatal en infraestructura electoral crítica. Se requiere activación inmediata del protocolo de crisis y notificación a autoridades de ciberseguridad nacional.',
      deadline: 'Inmediato (< 2 horas)',
      impact: 'Retraso en contención permite exfiltración continuada y posible manipulación de sistemas de certificación electoral.',
      responsibleRole: 'ciso',
    },
    'B-C': {
      title: 'Comunicación Pública Proactiva vs Reactiva',
      description: 'Medios de comunicación tienen información parcial. Decidir entre emitir comunicado oficial proactivo (controlando la narrativa) o esperar y responder reactivamente (riesgo de narrativa adversa).',
      deadline: '< 4 horas (antes del ciclo de noticias nocturno)',
      impact: 'Una filtración incontrolada podría generar pánico público, deslegitimar el proceso electoral y provocar crisis institucional.',
      responsibleRole: 'ciso',
    },
  };

  return decisions[transitionId];
}

/**
 * Calcula el drift completo entre dos snapshots.
 * Función principal del motor determinista.
 * @param from - Snapshot de origen
 * @param to - Snapshot de destino
 * @returns Objeto Drift completo con análisis estructurado
 */
export function calculateDrift(from: Snapshot, to: Snapshot): Drift {
  const transitionId: TransitionId = `${from.id}-${to.id}` as TransitionId;

  const newFacts = findNewFacts(from, to);
  const severityChange = calculateSeverityChange(from, to);
  const confidenceShifts = findConfidenceShifts(from, to);
  const discardedHypotheses = findDiscardedHypotheses(from, to);
  const newIOCs = findNewIOCs(from, to);
  const urgentDecision = getUrgentDecision(transitionId);
  const headline = generateHeadline(transitionId, severityChange, newFacts);

  const socBriefing = generateSOCBriefing(headline, newFacts, newIOCs, to.recommendedActions);
  const cisoBriefing = generateCISOBriefing(
    headline,
    severityChange,
    urgentDecision.title,
    urgentDecision.description,
    to.recommendedActions
  );

  return {
    transitionId,
    headline,
    newFacts,
    severityChange,
    confidenceShifts,
    discardedHypotheses,
    newIOCs,
    urgentDecision,
    recommendedActions: to.recommendedActions,
    socBriefing,
    cisoBriefing,
  };
}
