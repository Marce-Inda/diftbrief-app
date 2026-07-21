/**
 * @fileoverview Componente RoleSwitcher para alternar entre vistas SOC y CISO.
 */

import type { UserRole } from '../types';

interface RoleSwitcherProps {
  /** Rol actualmente activo */
  activeRole: UserRole;
  /** Callback cuando el usuario cambia de rol */
  onRoleChange: (role: UserRole) => void;
}

/**
 * Conmutador para alternar entre las perspectivas SOC (técnica) y CISO (ejecutiva).
 * @param props - Props del componente
 * @returns Elemento JSX del conmutador de roles
 */
export function RoleSwitcher({ activeRole, onRoleChange }: RoleSwitcherProps) {
  return (
    <div className="role-switcher" role="tablist" aria-label="Selección de rol">
      <button
        className={`role-switcher__btn ${activeRole === 'soc' ? 'role-switcher__btn--active' : ''}`}
        onClick={() => onRoleChange('soc')}
        role="tab"
        aria-selected={activeRole === 'soc'}
        aria-controls="briefing-panel"
      >
        <span className="role-switcher__icon">🛡️</span>
        <span className="role-switcher__label">Vista SOC</span>
        <span className="role-switcher__desc">Técnica / Operativa</span>
      </button>
      <button
        className={`role-switcher__btn ${activeRole === 'ciso' ? 'role-switcher__btn--active' : ''}`}
        onClick={() => onRoleChange('ciso')}
        role="tab"
        aria-selected={activeRole === 'ciso'}
        aria-controls="briefing-panel"
      >
        <span className="role-switcher__icon">📊</span>
        <span className="role-switcher__label">Vista CISO</span>
        <span className="role-switcher__desc">Estratégica / Ejecutiva</span>
      </button>
    </div>
  );
}
