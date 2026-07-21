/**
 * @fileoverview Componente DriftBanner que muestra el headline principal del drift.
 */

interface DriftBannerProps {
  /** Headline del drift detectado */
  headline: string;
}

/**
 * Banner destacado que muestra el cambio más importante entre snapshots.
 * @param props - Props del componente
 * @returns Elemento JSX del banner de drift
 */
export function DriftBanner({ headline }: DriftBannerProps) {
  return (
    <div className="drift-banner" role="alert" aria-live="polite">
      <div className="drift-banner__icon">🔀</div>
      <p className="drift-banner__headline">{headline}</p>
    </div>
  );
}
