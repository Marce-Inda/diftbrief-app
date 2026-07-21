/**
 * @fileoverview Componente SnapshotSelector para cambiar entre transiciones.
 */

import type { TransitionId } from '../types';

interface SnapshotSelectorProps {
  /** Transición actualmente seleccionada */
  activeTransition: TransitionId;
  /** Callback cuando el usuario cambia de transición */
  onTransitionChange: (transition: TransitionId) => void;
}

/**
 * Control para alternar entre las transiciones de snapshots (A→B, B→C).
 * @param props - Props del componente
 * @returns Elemento JSX del selector de snapshots
 */
export function SnapshotSelector({ activeTransition, onTransitionChange }: SnapshotSelectorProps) {
  return (
    <div className="snapshot-selector">
      <span className="snapshot-selector__label">Transición:</span>
      <div className="snapshot-selector__buttons">
        <button
          className={`snapshot-selector__btn ${activeTransition === 'A-B' ? 'snapshot-selector__btn--active' : ''}`}
          onClick={() => onTransitionChange('A-B')}
          aria-pressed={activeTransition === 'A-B'}
        >
          <span className="snapshot-selector__from">A</span>
          <span className="snapshot-selector__arrow">→</span>
          <span className="snapshot-selector__to">B</span>
        </button>
        <button
          className={`snapshot-selector__btn ${activeTransition === 'B-C' ? 'snapshot-selector__btn--active' : ''}`}
          onClick={() => onTransitionChange('B-C')}
          aria-pressed={activeTransition === 'B-C'}
        >
          <span className="snapshot-selector__from">B</span>
          <span className="snapshot-selector__arrow">→</span>
          <span className="snapshot-selector__to">C</span>
        </button>
      </div>
    </div>
  );
}
