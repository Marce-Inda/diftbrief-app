/**
 * @fileoverview Componente SnapshotSelector para cambiar entre transiciones.
 * Incluye botón de simulación del tour guiado completo del producto.
 */

import type { TransitionId } from '../types';
import type { SimulationStatus } from '../hooks/useSimulation';

interface SnapshotSelectorProps {
  /** Transición actualmente seleccionada */
  activeTransition: TransitionId;
  /** Callback cuando el usuario cambia de transición */
  onTransitionChange: (transition: TransitionId) => void;
  /** Estado de la simulación (controlado desde App) */
  simulationStatus: SimulationStatus;
  /** Callback para iniciar/pausar la simulación */
  onSimulationToggle: () => void;
  /** Callback para cancelar la simulación */
  onSimulationCancel: () => void;
  /** Índice del paso actual del tour */
  currentStepIndex?: number;
  /** Total de pasos del tour */
  totalSteps?: number;
}

/**
 * Devuelve el texto del botón según el estado de la simulación.
 * @param status - Estado actual de la simulación
 * @returns Texto a mostrar en el botón
 */
function getButtonLabel(status: SimulationStatus): string {
  switch (status) {
    case 'running':
      return '⏸ Pausar Tour';
    case 'completed':
      return '✓ Simulación Completada';
    default:
      return '▶ Tour Guiado';
  }
}

/**
 * Control para alternar entre las transiciones de snapshots (A→B, B→C).
 * Incluye un botón que inicia el tour guiado automatizado del producto (~25s).
 * La simulación se puede pausar/reanudar o se cancela automáticamente
 * si el usuario interactúa manualmente con la interfaz.
 *
 * @param props - Props del componente
 * @returns Elemento JSX del selector de snapshots
 */
export function SnapshotSelector({
  activeTransition,
  onTransitionChange,
  simulationStatus,
  onSimulationToggle,
  onSimulationCancel,
  currentStepIndex = 0,
  totalSteps = 1,
}: SnapshotSelectorProps) {
  /**
   * Maneja el cambio manual de transición.
   * Si la simulación está en curso, la cancela antes de aplicar el cambio.
   */
  const handleManualTransitionChange = (transition: TransitionId): void => {
    if (simulationStatus === 'running') {
      onSimulationCancel();
    }
    onTransitionChange(transition);
  };

  const progressPercentage = totalSteps > 0
    ? Math.round(((currentStepIndex + 1) / totalSteps) * 100)
    : 0;

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
        className={`simulation-btn simulation-btn--${simulationStatus}`}
        onClick={onSimulationToggle}
        aria-label={getButtonLabel(simulationStatus)}
        disabled={simulationStatus === 'completed'}
        data-simulation-control="true"
      >
        <span className="simulation-btn__label">{getButtonLabel(simulationStatus)}</span>
        {simulationStatus === 'running' && (
          <span className="simulation-btn__badge" aria-live="polite">
            🔴 TOUR EN VIVO — {progressPercentage}%
          </span>
        )}
      </button>
    </div>
  );
}
