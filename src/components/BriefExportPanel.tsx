/**
 * @fileoverview Componente BriefExportPanel para copiar el briefing al portapapeles.
 * Soporta trigger externo de copia desde la simulación de tour guiado.
 */

import { useState, useEffect, useRef } from 'react';
import type { UserRole } from '../types';

interface BriefExportPanelProps {
  /** Briefing para el rol SOC */
  socBriefing: string;
  /** Briefing para el rol CISO */
  cisoBriefing: string;
  /** Rol activo actualmente */
  activeRole: UserRole;
  /** Trigger externo: incrementar para disparar copia desde simulación */
  simCopyTrigger?: number;
}

/**
 * Panel de exportación que permite copiar el briefing al portapapeles.
 * Acepta un trigger externo (simCopyTrigger) para disparar la copia
 * programáticamente durante la simulación de tour guiado.
 * @param props - Props del componente
 * @returns Elemento JSX del panel de exportación
 */
export function BriefExportPanel({ socBriefing, cisoBriefing, activeRole, simCopyTrigger = 0 }: BriefExportPanelProps) {
  const [copied, setCopied] = useState(false);
  const prevTriggerRef = useRef<number>(simCopyTrigger);

  const briefingText = activeRole === 'soc' ? socBriefing : cisoBriefing;

  /**
   * Copia el briefing al portapapeles y muestra feedback visual.
   */
  const handleCopy = () => {
    navigator.clipboard.writeText(briefingText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // React to external simulation trigger
  useEffect(() => {
    if (simCopyTrigger > 0 && simCopyTrigger !== prevTriggerRef.current) {
      prevTriggerRef.current = simCopyTrigger;
      handleCopy();
    }
  });

  return (
    <div className="brief-export" id="briefing-panel" role="tabpanel">
      <div className="brief-export__header">
        <h3 className="brief-export__title">
          Briefing {activeRole.toUpperCase()}
        </h3>
        <button
          className={`brief-export__btn ${copied ? 'brief-export__btn--copied' : ''}`}
          onClick={handleCopy}
          aria-label={copied ? 'Copiado al portapapeles' : 'Copiar briefing al portapapeles'}
        >
          {copied ? '✓ ¡Copiado!' : '📋 Copiar Briefing'}
        </button>
      </div>
      <pre className="brief-export__content">
        {briefingText}
      </pre>
    </div>
  );
}
