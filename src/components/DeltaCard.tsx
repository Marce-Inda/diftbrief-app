/**
 * @fileoverview Componente DeltaCard para mostrar cambios individuales del drift.
 */

import type { Fact, IOC, ConfidenceShift } from '../types';

interface DeltaCardProps {
  /** Título de la sección de deltas */
  title: string;
  /** Icono decorativo */
  icon: string;
  /** Tipo de color del card */
  variant: 'drift' | 'confirmed' | 'critical' | 'probable';
  /** Nuevos hechos (opcional) */
  facts?: Fact[];
  /** Nuevos IOCs (opcional) */
  iocs?: IOC[];
  /** Cambios de confianza (opcional) */
  shifts?: ConfidenceShift[];
}

/**
 * Tarjeta que muestra un grupo de cambios detectados en el drift.
 * @param props - Props del componente
 * @returns Elemento JSX de la tarjeta de delta
 */
export function DeltaCard({ title, icon, variant, facts, iocs, shifts }: DeltaCardProps) {
  return (
    <div className={`delta-card delta-card--${variant}`}>
      <div className="delta-card__header">
        <span className="delta-card__icon">{icon}</span>
        <h3 className="delta-card__title">{title}</h3>
      </div>
      <div className="delta-card__content">
        {facts && facts.length > 0 && (
          <ul className="delta-card__list">
            {facts.map((fact) => (
              <li key={fact.id} className="delta-card__item">
                <span className={`delta-card__badge delta-card__badge--${fact.confidence}`}>
                  {fact.confidence}
                </span>
                {fact.description}
              </li>
            ))}
          </ul>
        )}
        {iocs && iocs.length > 0 && (
          <ul className="delta-card__list">
            {iocs.map((ioc, index) => (
              <li key={`${ioc.type}-${index}`} className="delta-card__item">
                <span className="delta-card__badge delta-card__badge--ioc">
                  {ioc.type}
                </span>
                <code className="delta-card__code">{ioc.value}</code>
                <span className="delta-card__desc">{ioc.description}</span>
              </li>
            ))}
          </ul>
        )}
        {shifts && shifts.length > 0 && (
          <ul className="delta-card__list">
            {shifts.map((shift) => (
              <li key={shift.itemId} className="delta-card__item">
                <span className="delta-card__shift">
                  {shift.from} → {shift.to}
                </span>
                {shift.description}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
