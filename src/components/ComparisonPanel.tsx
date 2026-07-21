/**
 * @fileoverview Componente ComparisonPanel para vista side-by-side de snapshots.
 * Muestra información diferente según el rol activo (SOC vs CISO).
 */

import type { Snapshot, UserRole } from '../types';

interface ComparisonPanelProps {
  /** Snapshot anterior */
  fromSnapshot: Snapshot;
  /** Snapshot actual */
  toSnapshot: Snapshot;
  /** Rol activo del usuario para filtrar campos visibles */
  activeRole: UserRole;
}

/**
 * Renderiza una columna de snapshot para la vista SOC (técnica).
 * Muestra hechos confirmados, nueva evidencia y activos afectados.
 * @param snapshot - Snapshot a renderizar
 * @param label - Etiqueta de la columna (Anterior/Actual)
 * @param badgeClass - Clase CSS del badge
 * @returns Elemento JSX de la columna SOC
 */
function SOCColumn({ snapshot, label, badgeClass }: { snapshot: Snapshot; label: string; badgeClass: string }) {
  return (
    <div className="comparison-panel__column">
      <div className="comparison-panel__header">
        <span className={`comparison-panel__badge ${badgeClass}`}>
          {label}
        </span>
        <h3 className="comparison-panel__title">{snapshot.title}</h3>
        <span className={`comparison-panel__severity comparison-panel__severity--${snapshot.severity}`}>
          {snapshot.severity.toUpperCase()}
        </span>
      </div>

      <div className="comparison-panel__facts">
        <h4>Hechos Confirmados ({snapshot.facts.length})</h4>
        <ul>
          {snapshot.facts.map((fact) => (
            <li key={fact.id} className="comparison-panel__fact">
              <span className={`comparison-panel__confidence comparison-panel__confidence--${fact.confidence}`}>
                {fact.confidence}
              </span>
              {fact.description}
            </li>
          ))}
        </ul>
      </div>

      <div className="comparison-panel__facts">
        <h4>Nueva Evidencia ({snapshot.newEvidence.length})</h4>
        <ul>
          {snapshot.newEvidence.map((item, idx) => (
            <li key={idx} className="comparison-panel__fact">
              <span className="comparison-panel__confidence comparison-panel__confidence--confirmed">
                evidencia
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="comparison-panel__facts">
        <h4>Activos Afectados ({snapshot.impactedAssets.length})</h4>
        <ul>
          {snapshot.impactedAssets.map((asset, idx) => (
            <li key={idx} className="comparison-panel__fact">
              <span className="comparison-panel__confidence comparison-panel__confidence--probable">
                activo
              </span>
              {asset}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Renderiza una columna de snapshot para la vista CISO (ejecutiva).
 * Muestra resumen, impacto de negocio y decisiones pendientes.
 * @param snapshot - Snapshot a renderizar
 * @param label - Etiqueta de la columna (Anterior/Actual)
 * @param badgeClass - Clase CSS del badge
 * @returns Elemento JSX de la columna CISO
 */
function CISOColumn({ snapshot, label, badgeClass }: { snapshot: Snapshot; label: string; badgeClass: string }) {
  return (
    <div className="comparison-panel__column">
      <div className="comparison-panel__header">
        <span className={`comparison-panel__badge ${badgeClass}`}>
          {label}
        </span>
        <h3 className="comparison-panel__title">{snapshot.title}</h3>
        <span className={`comparison-panel__severity comparison-panel__severity--${snapshot.severity}`}>
          {snapshot.severity.toUpperCase()}
        </span>
      </div>

      <p className="comparison-panel__summary">{snapshot.summary}</p>

      <div className="comparison-panel__facts">
        <h4>Impacto de Negocio ({snapshot.businessImpact.length})</h4>
        <ul>
          {snapshot.businessImpact.map((impact, idx) => (
            <li key={idx} className="comparison-panel__fact">
              <span className="comparison-panel__confidence comparison-panel__confidence--probable">
                impacto
              </span>
              {impact}
            </li>
          ))}
        </ul>
      </div>

      <div className="comparison-panel__facts">
        <h4>Decisiones Pendientes ({snapshot.openDecisions.length})</h4>
        <ul>
          {snapshot.openDecisions.map((decision, idx) => (
            <li key={idx} className="comparison-panel__fact">
              <span className="comparison-panel__confidence comparison-panel__confidence--unconfirmed">
                decisión
              </span>
              {decision}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Panel de comparación side-by-side entre el snapshot anterior y el actual.
 * Muestra campos diferentes según el rol activo:
 * - SOC: Hechos confirmados, nueva evidencia, activos afectados
 * - CISO: Resumen, impacto de negocio, decisiones pendientes
 * @param props - Props del componente
 * @returns Elemento JSX del panel de comparación
 */
export function ComparisonPanel({ fromSnapshot, toSnapshot, activeRole }: ComparisonPanelProps) {
  return (
    <div className="comparison-panel" key={activeRole}>
      {activeRole === 'soc' ? (
        <SOCColumn
          snapshot={fromSnapshot}
          label="Anterior"
          badgeClass="comparison-panel__badge--previous"
        />
      ) : (
        <CISOColumn
          snapshot={fromSnapshot}
          label="Anterior"
          badgeClass="comparison-panel__badge--previous"
        />
      )}

      <div className="comparison-panel__divider">
        <span className="comparison-panel__arrow">→</span>
      </div>

      {activeRole === 'soc' ? (
        <SOCColumn
          snapshot={toSnapshot}
          label="Actual"
          badgeClass="comparison-panel__badge--current"
        />
      ) : (
        <CISOColumn
          snapshot={toSnapshot}
          label="Actual"
          badgeClass="comparison-panel__badge--current"
        />
      )}
    </div>
  );
}
