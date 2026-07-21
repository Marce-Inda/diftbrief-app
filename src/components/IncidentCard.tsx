/**
 * @fileoverview Componente IncidentCard que muestra el resumen del incidente activo.
 */

/**
 * Tarjeta con información general del incidente activo.
 * @returns Elemento JSX de la tarjeta de incidente
 */
export function IncidentCard() {
  return (
    <section className="incident-card">
      <div className="incident-card__header">
        <span className="incident-card__label">Incidente Activo</span>
        <span className="incident-card__severity incident-card__severity--critical">
          CRÍTICO
        </span>
      </div>
      <h2 className="incident-card__title">
        Compromiso de Infraestructura Electoral Nacional
      </h2>
      <p className="incident-card__description">
        Ataque APT dirigido a la integridad del padrón electoral con exfiltración
        confirmada y crisis institucional en evolución.
      </p>
      <div className="incident-card__meta">
        <span>📅 2024-11-05</span>
        <span>🔄 3 Snapshots</span>
        <span>⚡ 2 Transiciones</span>
      </div>
    </section>
  );
}
