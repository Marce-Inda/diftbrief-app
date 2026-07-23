/**
 * @fileoverview Componente TelemetryPanel para mostrar métricas de rendimiento del agente IA.
 * Panel de depuración posicionado como overlay fijo en la esquina inferior derecha.
 */

import type { TelemetryData } from '../types';

/** Props para el componente TelemetryPanel */
export interface TelemetryPanelProps {
  /** Datos de telemetría a mostrar */
  data: TelemetryData;
}

/**
 * Formatea el valor de tokens consumidos como entero o muestra placeholder.
 * @param value - Número de tokens o null
 * @returns Cadena formateada
 */
function formatTokens(value: number | null): string {
  if (value === null) return '—';
  return Math.round(value).toLocaleString();
}

/**
 * Formatea la latencia en milisegundos o muestra placeholder.
 * @param value - Latencia en ms o null
 * @returns Cadena formateada
 */
function formatLatency(value: number | null): string {
  if (value === null) return '—';
  return `${Math.round(value)} ms`;
}

/**
 * Formatea el costo estimado con hasta 4 decimales o muestra placeholder.
 * @param value - Costo en USD o null
 * @returns Cadena formateada
 */
function formatCost(value: number | null): string {
  if (value === null) return '—';
  return `$${value.toFixed(4)}`;
}

/**
 * Panel de depuración que renderiza métricas de rendimiento del agente IA.
 * Solo se monta cuando el environment gate y el toggle de visibilidad están activos.
 *
 * @param props - Props del componente con datos de telemetría
 * @returns Elemento JSX del panel de telemetría
 */
export function TelemetryPanel({ data }: TelemetryPanelProps) {
  return (
    <div
      className="telemetry-panel"
      style={{
        position: 'fixed',
        bottom: 'var(--spacing-md)',
        right: 'var(--spacing-md)',
        backgroundColor: 'var(--color-surface-elevated)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--spacing-md)',
        fontFamily: 'var(--font-family)',
        fontSize: 'var(--font-size-sm)',
        color: 'var(--color-text-primary)',
        zIndex: 9999,
        minWidth: '220px',
        boxShadow: 'var(--shadow-lg)',
      }}
      role="complementary"
      aria-label="Telemetry Panel"
    >
      <h4
        style={{
          margin: '0 0 var(--spacing-sm) 0',
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-drift)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        Telemetry
      </h4>
      <dl
        style={{
          margin: 0,
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: 'var(--spacing-xs) var(--spacing-sm)',
          alignItems: 'baseline',
        }}
      >
        <dt style={{ color: 'var(--color-text-secondary)' }}>Tokens</dt>
        <dd style={{ margin: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {formatTokens(data.tokensConsumed)}
        </dd>

        <dt style={{ color: 'var(--color-text-secondary)' }}>Latency</dt>
        <dd style={{ margin: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {formatLatency(data.latencyMs)}
        </dd>

        <dt style={{ color: 'var(--color-text-secondary)' }}>Cost</dt>
        <dd style={{ margin: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {formatCost(data.estimatedCost)}
        </dd>
      </dl>
    </div>
  );
}
