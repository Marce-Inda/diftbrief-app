/**
 * @fileoverview Modal de desglose de riesgo financiero para DriftBrief.
 * Muestra el desglose detallado de la exposición financiera en tres categorías
 * de costos con porcentajes fijos (50%, 30%, 20%).
 */

import { useEffect, useRef } from 'react';
import type { SeverityLevel } from '../types/index';
import './FinancialRiskModal.css';

/** Categoría individual del desglose de costos */
interface CostBreakdown {
  /** Emoji representativo de la categoría */
  icon: string;
  /** Nombre descriptivo de la categoría */
  label: string;
  /** Porcentaje del total (0–1) */
  percentage: number;
  /** Monto calculado en USD */
  amount: number;
}

/**
 * Props del componente FinancialRiskModal.
 * Interfaz estrictamente tipada — no se permite el uso de `any`.
 */
export interface FinancialRiskModalProps {
  /** Nivel de severidad actual del incidente */
  severity: SeverityLevel;
  /** Exposición financiera total estimada en USD por hora */
  financialExposureUsd: number;
  /** Callback para cerrar el modal */
  onClose: () => void;
}

/**
 * Calcula el desglose de costos en tres categorías con porcentajes fijos.
 * - 50% → Parada Operativa e Indisponibilidad
 * - 30% → Exposición a Multas Regulatorias
 * - 20% → Remediación y Respuesta Forense
 *
 * @param totalUsd - Monto total de exposición financiera en USD
 * @returns Array de tres categorías con label, porcentaje y monto calculado
 */
export function calculateBreakdown(totalUsd: number): CostBreakdown[] {
  return [
    {
      icon: '🛑',
      label: 'Parada Operativa e Indisponibilidad',
      percentage: 0.5,
      amount: totalUsd * 0.5,
    },
    {
      icon: '⚖️',
      label: 'Exposición a Multas Regulatorias',
      percentage: 0.3,
      amount: totalUsd * 0.3,
    },
    {
      icon: '🛠️',
      label: 'Remediación y Respuesta Forense',
      percentage: 0.2,
      amount: totalUsd * 0.2,
    },
  ];
}

/**
 * Formatea un valor en USD a formato legible compacto.
 * Valores >= 1000 se muestran como $Nk/hr, valores < 1000 como $N/hr.
 *
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
 * FinancialRiskModal — Muestra el desglose detallado de la exposición financiera.
 * Renderiza un overlay con tres categorías de costos calculadas a partir del
 * total de exposición financiera. Soporta cierre mediante tecla Escape,
 * clic en backdrop o botón de cerrar. Implementa focus trap para accesibilidad.
 *
 * @param props - Configuración del modal incluyendo severidad, monto y callback de cierre
 * @returns Overlay modal con desglose financiero detallado
 */
export function FinancialRiskModal({
  severity,
  financialExposureUsd,
  onClose,
}: FinancialRiskModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus the close button on mount
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Escape key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Focus trap: constrain Tab/Shift+Tab within modal
  useEffect(() => {
    const handleFocusTrap = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return;

      const modal = modalRef.current;
      if (!modal) return;

      const focusableElements = modal.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleFocusTrap);
    return () => document.removeEventListener('keydown', handleFocusTrap);
  }, []);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const breakdown = calculateBreakdown(financialExposureUsd);

  return (
    <div
      className="financial-modal-overlay"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="financial-modal-title"
    >
      <div className="financial-modal" ref={modalRef}>
        <button
          className="financial-modal__close"
          onClick={onClose}
          aria-label="Cerrar modal de riesgo financiero"
          type="button"
          ref={closeButtonRef}
        >
          ✕
        </button>

        <div className="financial-modal__content">
          {/* Header */}
          <header className="financial-modal__header">
            <h2 className="financial-modal__title" id="financial-modal-title">
              Desglose de Riesgo Financiero
            </h2>
            <span className={`financial-modal__severity financial-modal__severity--${severity}`}>
              {severity.toUpperCase()}
            </span>
          </header>

          {/* Total Exposure */}
          <div className="financial-modal__total">
            <span className="financial-modal__total-label">Exposición Total</span>
            <span className="financial-modal__total-value">
              {formatFinancialValue(financialExposureUsd)}
            </span>
          </div>

          {/* Cost Breakdown */}
          <section className="financial-modal__breakdown">
            <h3 className="financial-modal__section-title">Desglose por Categoría</h3>
            {breakdown.map((category) => (
              <div key={category.label} className="financial-modal__breakdown-row">
                <span className="financial-modal__breakdown-icon">{category.icon}</span>
                <span className="financial-modal__breakdown-label">{category.label}</span>
                <span className="financial-modal__breakdown-percentage">
                  {Math.round(category.percentage * 100)}%
                </span>
                <span className="financial-modal__breakdown-amount">
                  {formatFinancialValue(category.amount)}
                </span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

export default FinancialRiskModal;
