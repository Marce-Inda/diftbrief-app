/**
 * @fileoverview Componente DecisionCard para mostrar la decisión urgente requerida.
 */

import type { UrgentDecision } from '../types';

interface DecisionCardProps {
  /** Decisión urgente a mostrar */
  decision: UrgentDecision;
}

/**
 * Tarjeta destacada que muestra la decisión urgente que requiere intervención.
 * @param props - Props del componente
 * @returns Elemento JSX de la tarjeta de decisión
 */
export function DecisionCard({ decision }: DecisionCardProps) {
  return (
    <div className="decision-card" role="alert" aria-live="assertive">
      <div className="decision-card__header">
        <span className="decision-card__icon">⚡</span>
        <h3 className="decision-card__title">Decisión Urgente Requerida</h3>
        <span className="decision-card__deadline">{decision.deadline}</span>
      </div>
      <div className="decision-card__body">
        <h4 className="decision-card__decision-title">{decision.title}</h4>
        <p className="decision-card__description">{decision.description}</p>
      </div>
      <div className="decision-card__footer">
        <div className="decision-card__impact">
          <span className="decision-card__impact-label">Impacto si no se actúa:</span>
          <p className="decision-card__impact-text">{decision.impact}</p>
        </div>
        <span className="decision-card__responsible">
          Responsable: {decision.responsibleRole.toUpperCase()}
        </span>
      </div>
    </div>
  );
}
