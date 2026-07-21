/**
 * @fileoverview Componente ComparisonPanel para vista side-by-side de snapshots.
 */

import type { Snapshot } from '../types';

interface ComparisonPanelProps {
  /** Snapshot anterior */
  fromSnapshot: Snapshot;
  /** Snapshot actual */
  toSnapshot: Snapshot;
}

/**
 * Panel de comparación side-by-side entre el snapshot anterior y el actual.
 * @param props - Props del componente
 * @returns Elemento JSX del panel de comparación
 */
export function ComparisonPanel({ fromSnapshot, toSnapshot }: ComparisonPanelProps) {
  return (
    <div className="comparison-panel">
      <div className="comparison-panel__column">
        <div className="comparison-panel__header">
          <span className="comparison-panel__badge comparison-panel__badge--previous">
            Anterior
          </span>
          <h3 className="comparison-panel__title">{fromSnapshot.title}</h3>
          <span className={`comparison-panel__severity comparison-panel__severity--${fromSnapshot.severity}`}>
            {fromSnapshot.severity.toUpperCase()}
          </span>
        </div>
        <p className="comparison-panel__summary">{fromSnapshot.summary}</p>
        <div className="comparison-panel__facts">
          <h4>Hechos ({fromSnapshot.facts.length})</h4>
          <ul>
            {fromSnapshot.facts.map((fact) => (
              <li key={fact.id} className="comparison-panel__fact">
                <span className={`comparison-panel__confidence comparison-panel__confidence--${fact.confidence}`}>
                  {fact.confidence}
                </span>
                {fact.description}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="comparison-panel__divider">
        <span className="comparison-panel__arrow">→</span>
      </div>

      <div className="comparison-panel__column">
        <div className="comparison-panel__header">
          <span className="comparison-panel__badge comparison-panel__badge--current">
            Actual
          </span>
          <h3 className="comparison-panel__title">{toSnapshot.title}</h3>
          <span className={`comparison-panel__severity comparison-panel__severity--${toSnapshot.severity}`}>
            {toSnapshot.severity.toUpperCase()}
          </span>
        </div>
        <p className="comparison-panel__summary">{toSnapshot.summary}</p>
        <div className="comparison-panel__facts">
          <h4>Hechos ({toSnapshot.facts.length})</h4>
          <ul>
            {toSnapshot.facts.map((fact) => (
              <li key={fact.id} className="comparison-panel__fact">
                <span className={`comparison-panel__confidence comparison-panel__confidence--${fact.confidence}`}>
                  {fact.confidence}
                </span>
                {fact.description}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
