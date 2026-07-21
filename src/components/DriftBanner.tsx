/**
 * @fileoverview Componente DriftBanner que muestra el headline principal del drift.
 */

import type { UserRole } from '../types';

interface DriftBannerProps {
  /** Headline del drift detectado */
  headline: string;
  /** Rol activo del usuario. Cuando se proporciona, muestra un subheading contextual sobre el headline. */
  role?: UserRole;
}

/** Mapa de etiquetas de encuadre por rol */
const ROLE_LABELS: Record<UserRole, string> = {
  soc: 'RESUMEN TÉCNICO',
  ciso: 'RESUMEN EJECUTIVO',
};

/**
 * Banner destacado que muestra el cambio más importante entre snapshots.
 * Opcionalmente muestra un subheading con encuadre según el rol del usuario.
 * @param props - Props del componente
 * @returns Elemento JSX del banner de drift
 */
export function DriftBanner({ headline, role }: DriftBannerProps) {
  return (
    <div className="drift-banner" role="alert" aria-live="polite">
      <div className="drift-banner__icon">🔀</div>
      <div className="drift-banner__content">
        {role && (
          <span className={`drift-banner__role-label drift-banner__role-label--${role}`}>
            {ROLE_LABELS[role]}
          </span>
        )}
        <p className="drift-banner__headline">{headline}</p>
      </div>
    </div>
  );
}
