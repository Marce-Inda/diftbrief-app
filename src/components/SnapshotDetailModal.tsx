/**
 * @fileoverview Modal de detalle forense para un Snapshot individual.
 * Muestra información completa del snapshot seleccionado desde la línea de tiempo.
 */

import { useEffect } from 'react';
import type { Snapshot } from '../types/index';
import './SnapshotDetailModal.css';

interface SnapshotDetailModalProps {
  /** Snapshot a mostrar en detalle, o null si no hay selección */
  snapshot: Snapshot | null;
  /** Controla la visibilidad del modal */
  isOpen: boolean;
  /** Callback para cerrar el modal */
  onClose: () => void;
}

/**
 * SnapshotDetailModal — Displays full forensic details of a selected incident snapshot.
 * Renders a full-viewport overlay modal with sections for summary, confirmed facts,
 * IOCs, new evidence, and impacted assets. Supports closing via Escape key,
 * backdrop click, or the close button.
 *
 * @param props - Modal configuration including snapshot data and visibility state
 * @returns A modal overlay with detailed snapshot information, or null when closed
 */
export function SnapshotDetailModal({ snapshot, isOpen, onClose }: SnapshotDetailModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !snapshot) {
    return null;
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const formattedTimestamp = new Date(snapshot.timestamp).toLocaleString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return (
    <div
      className="snapshot-modal-overlay"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="snapshot-modal-title"
    >
      <div className="snapshot-modal">
        <button
          className="snapshot-modal__close"
          onClick={onClose}
          aria-label="Cerrar modal"
          type="button"
        >
          ✕
        </button>

        <div className="snapshot-modal__content">
          {/* Header */}
          <header className="snapshot-modal__header">
            <p className="snapshot-modal__timestamp">{formattedTimestamp}</p>
            <h2 className="snapshot-modal__title" id="snapshot-modal-title">
              {snapshot.title}
            </h2>
            <span className={`snapshot-modal__severity snapshot-modal__severity--${snapshot.severity}`}>
              {snapshot.severity.toUpperCase()}
            </span>
          </header>

          {/* Resumen Ejecutivo */}
          <section className="snapshot-modal__section">
            <h3 className="snapshot-modal__section-title">Resumen Ejecutivo</h3>
            <p className="snapshot-modal__summary">{snapshot.summary}</p>
          </section>

          {/* Hechos Confirmados */}
          {snapshot.facts.length > 0 && (
            <section className="snapshot-modal__section">
              <h3 className="snapshot-modal__section-title">Hechos Confirmados</h3>
              <ul className="snapshot-modal__facts">
                {snapshot.facts.map((fact) => (
                  <li key={fact.id} className="snapshot-modal__fact">
                    <span className="snapshot-modal__fact-description">{fact.description}</span>
                    <span className={`snapshot-modal__confidence-badge snapshot-modal__confidence-badge--${fact.confidence}`}>
                      {fact.confidence}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* IOCs e Indicadores Forenses */}
          {snapshot.iocs.length > 0 && (
            <section className="snapshot-modal__section">
              <h3 className="snapshot-modal__section-title">IOCs e Indicadores Forenses</h3>
              <ul className="snapshot-modal__iocs">
                {snapshot.iocs.map((ioc, index) => (
                  <li key={`${ioc.type}-${index}`} className="snapshot-modal__ioc">
                    <div className="snapshot-modal__ioc-header">
                      <span className="snapshot-modal__ioc-type">{ioc.type}</span>
                      <span className="snapshot-modal__ioc-value">{ioc.value}</span>
                    </div>
                    <p className="snapshot-modal__ioc-description">{ioc.description}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Evidencias Nuevas */}
          {snapshot.newEvidence.length > 0 && (
            <section className="snapshot-modal__section">
              <h3 className="snapshot-modal__section-title">Evidencias Nuevas</h3>
              <ul className="snapshot-modal__list">
                {snapshot.newEvidence.map((evidence, index) => (
                  <li key={index} className="snapshot-modal__list-item">
                    {evidence}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Activos Impactados */}
          {snapshot.impactedAssets.length > 0 && (
            <section className="snapshot-modal__section">
              <h3 className="snapshot-modal__section-title">Activos Impactados</h3>
              <ul className="snapshot-modal__list">
                {snapshot.impactedAssets.map((asset, index) => (
                  <li key={index} className="snapshot-modal__list-item">
                    {asset}
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

export default SnapshotDetailModal;
