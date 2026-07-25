/**
 * @fileoverview Componente DecisionCard para mostrar la decisión urgente requerida.
 * En vista CISO, incluye un panel interactivo de acciones ejecutivas.
 */

import { useState, useCallback } from 'react';
import type { UrgentDecision, UserRole } from '../types';

/** Estado de una acción ejecutiva del CISO */
type ActionState = 'idle' | 'executing' | 'confirmed';

/** Acción ejecutiva disponible para el CISO */
interface CisoAction {
  /** Identificador único de la acción */
  id: string;
  /** Texto del botón */
  label: string;
  /** Etiqueta aria para accesibilidad */
  ariaLabel: string;
}

/** Props del componente DecisionCard */
interface DecisionCardProps {
  /** Decisión urgente a mostrar */
  decision: UrgentDecision;
  /** Rol activo del usuario */
  activeRole: UserRole;
}

/**
 * Genera las acciones CISO basándose en el contexto de la decisión urgente.
 * @param decision - La decisión urgente actual
 * @returns Array de acciones ejecutivas contextuales
 */
function generateCisoActions(decision: UrgentDecision): CisoAction[] {
  const baseActions: CisoAction[] = [
    {
      id: 'approve-isolation',
      label: 'Aprobar Aislamiento Preventivo',
      ariaLabel: `Aprobar aislamiento preventivo para: ${decision.title}`,
    },
    {
      id: 'regulatory-report',
      label: 'Emitir Reporte Regulatorio NIS2',
      ariaLabel: `Emitir reporte regulatorio NIS2 relacionado con: ${decision.title}`,
    },
    {
      id: 'postpone',
      label: 'Postponer Decisión 1h',
      ariaLabel: `Postponer la decisión "${decision.title}" por una hora`,
    },
  ];

  return baseActions;
}

/**
 * Tarjeta destacada que muestra la decisión urgente que requiere intervención.
 * En vista CISO, incluye botones de acción ejecutiva con feedback interactivo.
 * @param props - Props del componente
 * @returns Elemento JSX de la tarjeta de decisión
 */
export function DecisionCard({ decision, activeRole }: DecisionCardProps) {
  const [actionState, setActionState] = useState<ActionState>('idle');
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [confirmedTime, setConfirmedTime] = useState<string | null>(null);

  const cisoActions = generateCisoActions(decision);

  const handleActionClick = useCallback((actionId: string) => {
    if (actionState !== 'idle') return;

    setSelectedActionId(actionId);
    setActionState('executing');

    setTimeout(() => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
      });
      setConfirmedTime(timeStr);
      setActionState('confirmed');
    }, 600);
  }, [actionState]);

  return (
    <div className="decision-card" role="alert" aria-live="assertive">
      <div className="decision-card__header">
        <span className="decision-card__icon">⚡</span>
        <h3 className="decision-card__title">Decisión Urgente Requerida</h3>
        <span className="decision-card__deadline">{decision.deadline}</span>
      </div>
      <div className="decision-card__body">
        <h4 className="decision-card__decision-title">{decision.title}</h4>
        <p className="decision-card__description">{decision.description}</p>
      </div>
      <div className="decision-card__footer">
        <div className="decision-card__impact">
          <span className="decision-card__impact-label">Impacto si no se actúa:</span>
          <p className="decision-card__impact-text">{decision.impact}</p>
        </div>
        <span className="decision-card__responsible">
          Responsable: {decision.responsibleRole.toUpperCase()}
        </span>
      </div>

      {activeRole === 'ciso' && (
        <div className="decision-card__actions" role="group" aria-label="Acciones ejecutivas CISO">
          {actionState === 'confirmed' && confirmedTime && (
            <div className="decision-card__confirmation" aria-live="polite">
              <span className="decision-card__confirmation-badge">
                ✅ Acción Aprobada por CISO a las {confirmedTime}
              </span>
            </div>
          )}

          <div className="decision-card__actions-list">
            {cisoActions.map((action) => {
              const isSelected = selectedActionId === action.id;
              const isExecuting = isSelected && actionState === 'executing';
              const isConfirmed = isSelected && actionState === 'confirmed';
              const isDisabled = actionState !== 'idle' && !isSelected;

              let buttonClass = 'decision-card__action-btn';
              if (isExecuting) buttonClass += ' decision-card__action-btn--executing';
              if (isConfirmed) buttonClass += ' decision-card__action-btn--confirmed';
              if (isDisabled) buttonClass += ' decision-card__action-btn--disabled';

              let buttonText = action.label;
              if (isExecuting) buttonText = 'Ejecutando...';
              if (isConfirmed) buttonText = `✅ ${action.label}`;

              return (
                <button
                  key={action.id}
                  className={buttonClass}
                  onClick={() => handleActionClick(action.id)}
                  disabled={isDisabled || isConfirmed || isExecuting}
                  aria-disabled={isDisabled || isConfirmed || isExecuting}
                  aria-label={action.ariaLabel}
                >
                  {buttonText}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
