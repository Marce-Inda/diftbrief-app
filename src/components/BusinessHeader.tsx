import type { ReactElement } from 'react';
import type { SeverityLevel, Regulation } from '../types/index';
import './BusinessHeader.css';

/**
 * Props del componente BusinessHeader.
 * Interfaz estrictamente tipada — no se permite el uso de `any`.
 */
export interface BusinessHeaderProps {
  /** Tiempo de triage automatizado en segundos */
  automatedTimeSeconds: number | null | undefined;
  /** Tiempo de análisis manual estimado en segundos */
  manualTimeSeconds: number | null | undefined;
  /** Nivel de severidad actual del incidente */
  severity: SeverityLevel;
  /** Exposición financiera estimada en USD por hora */
  financialExposureUsd: number | null | undefined;
  /** Lista de regulaciones aplicables al incidente */
  regulations: Regulation[];
}

/**
 * Mapea un SeverityLevel a su clase CSS de estilo de alerta.
 * critical → "financial-risk--critical"
 * high → "financial-risk--high"
 * medium | low → "" (sin clase de énfasis)
 * @param severity - Nivel de severidad
 * @returns Nombre de clase CSS o cadena vacía
 */
function severityToClassName(severity: SeverityLevel): string {
  switch (severity) {
    case 'critical': return 'financial-risk--critical';
    case 'high': return 'financial-risk--high';
    default: return '';
  }
}

/**
 * Formatea un valor en USD a formato legible compacto.
 * Valores >= 1000 se muestran como $Nk/hr, valores < 1000 como $N/hr.
 * @param amount - Cantidad en USD
 * @returns Cadena formateada (ej. "$150k/hr")
 */
function formatFinancialValue(amount: number): string {
  if (amount >= 1000) {
    return `$${amount / 1000}k/hr`;
  }
  return `$${amount}/hr`;
}

/**
 * Convierte un valor en segundos a formato legible.
 * Valores < 60 → "{N}s", valores >= 60 → "{Math.round(N/60)}m"
 * @param seconds - Valor numérico en segundos
 * @returns Cadena formateada con unidad
 */
function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.round(seconds / 60)}m`;
}

/**
 * Filtra regulaciones con notificationDeadlineHours válido (no null)
 * y las ordena por urgencia ascendente (menor deadline primero).
 * @param regulations - Lista de regulaciones
 * @returns Lista filtrada y ordenada
 */
function getApplicableRegulations(regulations: Regulation[]): Regulation[] {
  return regulations
    .filter((r) => r.notificationDeadlineHours !== null)
    .sort((a, b) => (a.notificationDeadlineHours as number) - (b.notificationDeadlineHours as number));
}

/**
 * Banner de métricas de impacto de negocio para el dashboard de DriftBrief.
 * Componente puramente presentacional sin estado interno ni efectos secundarios.
 * @param props - Datos de métricas tipados según BusinessHeaderProps
 * @returns Elemento JSX del banner con tres secciones de métricas
 */
export function BusinessHeader({
  automatedTimeSeconds,
  manualTimeSeconds,
  severity,
  financialExposureUsd,
  regulations,
}: BusinessHeaderProps): ReactElement {
  const triageTimeBadge =
    automatedTimeSeconds == null ||
    automatedTimeSeconds <= 0 ||
    manualTimeSeconds == null ||
    manualTimeSeconds <= 0
      ? null
      : (
          <div className="business-header__metric business-header__triage">
            <span className="business-header__label">TIEMPO DE TRIAGE</span>
            <span className="business-header__value">
              ⏱️ <span className="business-header__automated">{formatTime(automatedTimeSeconds)}</span> vs {formatTime(manualTimeSeconds)} triage manual
            </span>
          </div>
        );

  const applicable = getApplicableRegulations(regulations);
  const regulatorySLABadge = applicable.length > 0 ? (
    <div className="business-header__metric business-header__regulatory">
      <span className="business-header__label">SLA REGULATORIO</span>
      <div className="business-header__badges">
        {applicable.map((reg) => (
          <span key={reg.id} className="business-header__badge">
            ⚠️ {reg.name} • SLA de {reg.notificationDeadlineHours}h
          </span>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <section className="business-header" role="banner">
      <div className="business-header__live-badge">
        <span className="business-header__live-dot"></span>
        MÉTRICAS DE DRIFT EN VIVO
      </div>
      {triageTimeBadge}
      {/* Financial Risk Indicator */}
      <div
        className={`business-header__metric business-header__financial${severityToClassName(severity) ? ` ${severityToClassName(severity)}` : ''}`}
        {...((severity === 'critical' || severity === 'high') ? { 'aria-label': `Riesgo financiero: severidad ${severity}` } : {})}
      >
        <span className="business-header__label">RIESGO FINANCIERO</span>
        <span className="business-header__value">
          {financialExposureUsd == null ? '—' : formatFinancialValue(financialExposureUsd)}
        </span>
      </div>
      {regulatorySLABadge}
    </section>
  );
}
