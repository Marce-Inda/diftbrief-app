/**
 * @fileoverview Modal de Eficiencia de Triage (MTTR) para DriftBrief.
 * Muestra la comparación entre el tiempo de procesamiento agéntico automatizado
 * y el triage manual convencional, calculando el porcentaje de ahorro de MTTR.
 */

import { useEffect, useRef } from 'react';
import './TriageEfficiencyModal.css';

/**
 * Props del componente TriageEfficiencyModal.
 * Interfaz estrictamente tipada — no se permite el uso de `any`.
 */
export interface TriageEfficiencyModalProps {
  /** Tiempo de triage automatizado en segundos */
  automatedTimeSeconds: number;
  /** Tiempo de triage manual estimado en segundos */
  manualTimeSeconds: number;
  /** Callback para cerrar el modal */
  onClose: () => void;
}

/**
 * Formatea un valor en segundos a formato legible con unidad.
 * Valores < 60 → "{N} segundos", valores >= 60 → "{N} minutos"
 * @param seconds - Valor numérico en segundos
 * @returns Cadena formateada con unidad en español
 */
function formatTimeVerbose(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} segundos`;
  }
  const minutes = Math.round(seconds / 60);
  return `${minutes} minuto${minutes > 1 ? 's' : ''}`;
}

/**
 * Calcula el porcentaje de ahorro de MTTR entre el tiempo manual y el automatizado.
 * @param automated - Tiempo automatizado en segundos
 * @param manual - Tiempo manual en segundos
 * @returns Porcentaje de ahorro formateado con 1 decimal
 */
function calculateSavingsPercentage(automated: number, manual: number): string {
  return ((manual - automated) / manual * 100).toFixed(1);
}

/**
 * TriageEfficiencyModal — Muestra la comparación MTTR entre procesamiento agéntico y triage manual.
 * Renderiza un overlay con secciones informativas sobre el ahorro de tiempo, el procesamiento
 * automatizado de DriftBrief y el impacto en la contención de incidentes. Soporta cierre
 * mediante tecla Escape, clic en backdrop o botón de cerrar. Implementa focus trap para accesibilidad.
 *
 * @param props - Configuración del modal incluyendo tiempos y callback de cierre
 * @returns Overlay modal con comparación MTTR detallada
 */
export function TriageEfficiencyModal({
  automatedTimeSeconds,
  manualTimeSeconds,
  onClose,
}: TriageEfficiencyModalProps) {
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

  /**
   * Cierra el modal al hacer clic en el backdrop (overlay).
   * Solo cierra si el clic fue directamente en el overlay, no en el contenido.
   */
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const savingsPercentage = calculateSavingsPercentage(automatedTimeSeconds, manualTimeSeconds);

  return (
    <div
      className="triage-modal-overlay"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="triage-modal-title"
    >
      <div className="triage-modal" ref={modalRef}>
        <button
          className="triage-modal__close"
          onClick={onClose}
          aria-label="Cerrar modal de eficiencia de triage"
          type="button"
          ref={closeButtonRef}
        >
          ✕ Cerrar
        </button>

        {/* Header */}
        <header className="triage-modal__header">
          <h2 className="triage-modal__title" id="triage-modal-title">
            ⚡ Eficiencia de Triage: MTTR Comparison
          </h2>
        </header>

        {/* Content Sections */}
        <div className="triage-modal__content">
          {/* Savings Badge */}
          <div className="triage-modal__savings-badge">
            {savingsPercentage}% de Ahorro de MTTR
          </div>

          {/* Procesamiento Agéntico */}
          <section className="triage-modal__section">
            <h3 className="triage-modal__section-title">
              🤖 Procesamiento Agéntico
            </h3>
            <div className="triage-modal__time-highlight">
              {formatTimeVerbose(automatedTimeSeconds)}
            </div>
            <p className="triage-modal__section-value">
              En ~{formatTimeVerbose(automatedTimeSeconds)}, DriftBrief ejecuta de forma autónoma:
              ingesta de snapshots, extracción de deltas de IOCs, mapeo de hipótesis,
              y generación de briefings SOC/CISO adaptados por rol.
            </p>
          </section>

          {/* Triage Manual Convencional */}
          <section className="triage-modal__section">
            <h3 className="triage-modal__section-title">
              👤 Triage Manual Convencional
            </h3>
            <div className="triage-modal__time-highlight">
              {formatTimeVerbose(manualTimeSeconds)}
            </div>
            <p className="triage-modal__section-value">
              El proceso manual convencional requiere: lectura manual de logs de auditoría,
              reuniones de coordinación entre SOC y CISO, y redacción de informes
              en hoja de cálculo — con riesgo de errores y demoras críticas.
            </p>
          </section>

          {/* Impacto en la Contención */}
          <section className="triage-modal__section">
            <h3 className="triage-modal__section-title">
              📈 Impacto en la Contención
            </h3>
            <p className="triage-modal__section-value">
              Reducir el triage a {formatTimeVerbose(automatedTimeSeconds)} previene el movimiento
              lateral del atacante durante las primeras horas críticas de un incidente.
              Cada minuto de retraso en la detección incrementa exponencialmente el radio
              de impacto y el costo de remediación.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export default TriageEfficiencyModal;
