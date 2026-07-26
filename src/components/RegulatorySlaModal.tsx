/**
 * @fileoverview Modal de SLA Regulatorio para DriftBrief.
 * Muestra información detallada de una regulación específica incluyendo
 * plazo legal, autoridad destinataria, consecuencias por incumplimiento
 * y artículos clave relevantes para respuesta a incidentes.
 */

import { useEffect, useRef } from 'react';
import type { Regulation } from '../types/index';
import './RegulatorySlaModal.css';

/**
 * Props del componente RegulatorySlaModal.
 * Interfaz estrictamente tipada — no se permite el uso de `any`.
 */
export interface RegulatorySlaModalProps {
  /** Regulación seleccionada para mostrar en detalle */
  regulation: Regulation;
  /** Callback para cerrar el modal */
  onClose: () => void;
}

/**
 * Determina la autoridad destinataria oficial según la jurisdicción y el id de la regulación.
 * @param regulation - Regulación para la que se busca la autoridad
 * @returns Nombre oficial del organismo regulador correspondiente
 */
function getAuthorityName(regulation: Regulation): string {
  switch (regulation.id) {
    case 'gdpr':
      return 'Agencia Española de Protección de Datos';
    case 'nis2':
      return 'Centro Criptológico Nacional';
    case 'hipaa':
      return 'U.S. Department of Health & Human Services';
    default:
      return 'Autoridad competente de la jurisdicción';
  }
}

/**
 * Formatea el plazo de notificación en horas a una cadena legible.
 * Convierte horas a días si el plazo es >= 48 horas para mayor claridad.
 * @param hours - Plazo en horas
 * @returns Cadena formateada con la unidad adecuada
 */
function formatDeadline(hours: number): string {
  if (hours >= 48) {
    const days = Math.round(hours / 24);
    return `${days} días (${hours}h)`;
  }
  return `${hours} horas`;
}

/**
 * RegulatorySlaModal — Muestra información detallada de una regulación de ciberseguridad.
 * Renderiza un overlay con secciones informativas sobre el marco legal, plazo de notificación,
 * autoridad destinataria, sanciones y artículos clave. Soporta cierre mediante tecla Escape,
 * clic en backdrop o botón de cerrar. Implementa focus trap para accesibilidad.
 *
 * @param props - Configuración del modal incluyendo regulación y callback de cierre
 * @returns Overlay modal con detalle regulatorio completo
 */
export function RegulatorySlaModal({
  regulation,
  onClose,
}: RegulatorySlaModalProps) {
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

  const authority = getAuthorityName(regulation);

  return (
    <div
      className="regulatory-modal-overlay"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="regulatory-modal-title"
    >
      <div className="regulatory-modal" ref={modalRef}>
        <button
          className="regulatory-modal__close"
          onClick={onClose}
          aria-label="Cerrar modal de SLA regulatorio"
          type="button"
          ref={closeButtonRef}
        >
          ✕ Cerrar
        </button>

        {/* Header */}
        <header className="regulatory-modal__header">
          <h2 className="regulatory-modal__title" id="regulatory-modal-title">
            📜 {regulation.name}
          </h2>
          <span className="regulatory-modal__jurisdiction">
            {regulation.jurisdiction}
          </span>
        </header>

        {/* Content Sections */}
        <div className="regulatory-modal__content">
          {/* Plazo Legal y Estado */}
          <section className="regulatory-modal__section">
            <h3 className="regulatory-modal__section-title">
              ⏳ Plazo Legal y Estado
            </h3>
            {regulation.notificationDeadlineHours !== null ? (
              <>
                <div className="regulatory-modal__deadline-highlight">
                  {formatDeadline(regulation.notificationDeadlineHours)}
                </div>
                <p className="regulatory-modal__section-value">
                  Plazo máximo de notificación obligatoria desde el descubrimiento del incidente.
                  Ámbito: {regulation.scope}.
                </p>
              </>
            ) : (
              <p className="regulatory-modal__section-value">
                Sin plazo de notificación definido para esta regulación.
              </p>
            )}
          </section>

          {/* Autoridad Destinataria */}
          <section className="regulatory-modal__section">
            <h3 className="regulatory-modal__section-title">
              🏢 Autoridad Destinataria
            </h3>
            <p className="regulatory-modal__section-value">
              {authority}
            </p>
          </section>

          {/* Consecuencias por Incumplimiento */}
          <section className="regulatory-modal__section">
            <h3 className="regulatory-modal__section-title">
              ⚠️ Consecuencias por Incumplimiento
            </h3>
            <p className="regulatory-modal__penalties">
              {regulation.penalties}
            </p>
          </section>

          {/* Artículos Clave */}
          {regulation.keyArticles.length > 0 && (
            <section className="regulatory-modal__section">
              <h3 className="regulatory-modal__section-title">
                📋 Artículos Clave
              </h3>
              <ul className="regulatory-modal__articles">
                {regulation.keyArticles.map((article) => (
                  <li key={article.id} className="regulatory-modal__article">
                    <span className="regulatory-modal__article-id">{article.id}</span>
                    <p className="regulatory-modal__article-title">{article.title}</p>
                    <p className="regulatory-modal__article-summary">{article.summary}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export default RegulatorySlaModal;
