/**
 * @fileoverview Componente SnapshotSelector para cambiar entre transiciones.
 * Incluye botón de simulación automática de evolución del incidente.
 */

import type { TransitionId, UserRole } from '../types';
import { useSimulation } from '../hooks/useSimulation';
import type { SimulationStatus } from '../hooks/useSimulation';

interface SnapshotSelectorProps {
  /** Transición actualmente seleccionada */
  activeTransition: TransitionId;
  /** Callback cuando el usuario cambia de transición */
  onTransitionChange: (transition: TransitionId) => void;
  /** Callback opcional para cambiar el rol durante la simulación (SOC → CISO) */
  onRoleChange?: (role: UserRole) => void;
}

/**
 * Devuelve el texto del botón según el estado de la simulación.
 * @param status - Estado actual de la simulación
 * @returns Texto a mostrar en el botón
 */
function getButtonLabel(status: SimulationStatus): string {
  switch (status) {
    case 'running':
      return '⏸ Pausar Simulación';
    case 'completed':
      return '✓ Simulación Completada';
    default:
      return '▶ Simular Evolución';
  }
}

/**
 * Control para alternar entre las transiciones de snapshots (A→B, B→C).
 * Incluye un botón de simulación que reproduce automáticamente la evolución
 * del incidente alternando entre transiciones cada 7 segundos.
 * Durante A→B muestra la vista SOC; al avanzar a B→C cambia a vista CISO.
 *
 * @param props - Props del componente
 * @returns Elemento JSX del selector de snapshots
 */
export function SnapshotSelector({ activeTransition, onTransitionChange, onRoleChange }: SnapshotSelectorProps) {
  const { status, toggle, cancel } = useSimulation({
    activeTransition,
    onTransitionChange,
    onRoleChange,
  });

  /**
   * Maneja el cambio manual de transición.
   * Si la simulación está en curso, la cancela antes de aplicar el cambio.
   */
  const handleManualTransitionChange = (transition: TransitionId): void => {
    if (status === 'running') {
      cancel();
    }
    onTransitionChange(transition);
  };

  return (
    <div className="snapshot-selector">
      <span className="snapshot-selector__label">Transición:</span>
      <div className="snapshot-selector__buttons">
        <button
          className={`snapshot-selector__btn ${activeTransition === 'A-B' ? 'snapshot-selector__btn--active' : ''}`}
          onClick={() => handleManualTransitionChange('A-B')}
          aria-pressed={activeTransition === 'A-B'}
        >
          <span className="snapshot-selector__from">A</span>
          <span className="snapshot-selector__arrow">→</span>
          <span className="snapshot-selector__to">B</span>
        </button>
        <button
          className={`snapshot-selector__btn ${activeTransition === 'B-C' ? 'snapshot-selector__btn--active' : ''}`}
          onClick={() => handleManualTransitionChange('B-C')}
          aria-pressed={activeTransition === 'B-C'}
        >
          <span className="snapshot-selector__from">B</span>
          <span className="snapshot-selector__arrow">→</span>
          <span className="snapshot-selector__to">C</span>
        </button>
      </div>

      <button
        className={`simulation-btn simulation-btn--${status}`}
        onClick={toggle}
        aria-label={getButtonLabel(status)}
        disabled={status === 'completed'}
      >
        <span className="simulation-btn__label">{getButtonLabel(status)}</span>
        {status === 'running' && (
          <span className="simulation-btn__badge" aria-live="polite">
            🔴 SIMULACIÓN EN VIVO
          </span>
        )}
      </button>
    </div>
  );
}
