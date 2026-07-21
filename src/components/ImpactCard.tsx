/**
 * @fileoverview Componente ImpactCard para la vista CISO.
 * Muestra el cambio de severidad institucional/reputacional entre snapshots,
 * incluyendo la transición visual y la justificación del cambio.
 */

import type { SeverityChange, SeverityLevel } from '../types';

interface ImpactCardProps {
  /** Cambio de severidad entre snapshots */
  severityChange: SeverityChange;
}

/**
 * Mapea un nivel de severidad a su etiqueta legible en español.
 * @param level - Nivel de severidad
 * @returns Etiqueta traducida del nivel
 */
function getSeverityLabel(level: SeverityLevel): string {
  const labels: Record<SeverityLevel, string> = {
    low: 'Bajo',
    medium: 'Medio',
    high: 'Alto',
    critical: 'Crítico',
  };
  return labels[level];
}

/**
 * Tarjeta de impacto institucional/reputacional para la vista CISO.
 * Visualiza la transición de severidad con badges y muestra la justificación del cambio.
 * @param props - Props del componente
 * @param props.severityChange - Objeto con la transición de severidad y justificación
 * @returns Elemento JSX de la tarjeta de impacto institucional
 */
export function ImpactCard({ severityChange }: ImpactCardProps) {
  return (
    <div className="impact-card" role="region" aria-label="Impacto institucional y reputacional">
      <div className="impact-card__header">
        <span className="impact-card__icon">🏛️</span>
        <h3 className="impact-card__title">Impacto Institucional / Reputacional</h3>
      </div>
      <div className="impact-card__body">
        <div className="impact-card__transition">
          <span className={`impact-card__badge impact-card__badge--${severityChange.from}`}>
            {getSeverityLabel(severityChange.from)}
          </span>
          <span className="impact-card__arrow">→</span>
          <span className={`impact-card__badge impact-card__badge--${severityChange.to}`}>
            {getSeverityLabel(severityChange.to)}
          </span>
        </div>
        <p className="impact-card__justification">{severityChange.justification}</p>
      </div>
    </div>
  );
}
