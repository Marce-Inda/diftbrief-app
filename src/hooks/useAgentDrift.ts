/**
 * @fileoverview Custom hook que encapsula la lógica de invocación del agente IA
 * con la cadena de fallback: Gemini → Groq → Motor Determinista Local.
 */

import { useState, useEffect, useMemo } from 'react';
import type { Snapshot, Drift, TelemetryData } from '../types';
import { calculateDrift } from '../services/driftComparator';
import { getAgentDrift } from '../services/agentService';
import type { DriftSource } from '../services/agentService';

/** Resultado del hook useAgentDrift */
export interface UseAgentDriftResult {
  /** Objeto Drift (local inmediato o enriquecido por IA) */
  drift: Drift;
  /** Fuente que generó el drift actual */
  source: DriftSource;
  /** Razón del fallback si aplica */
  fallbackReason: string | undefined;
  /** Si el agente está consultando APIs de IA */
  isEnriching: boolean;
  /** Datos de telemetría de la última llamada al agente (undefined antes de la primera respuesta o cuando se usa fallback local) */
  telemetry?: TelemetryData;
}

/** Internal enrichment result from the agent */
interface EnrichmentResult {
  drift: Drift;
  source: DriftSource;
  fallbackReason: string | undefined;
  telemetry: TelemetryData | undefined;
  /** Identifier to correlate this result with the snapshots that triggered it */
  key: string;
}

/**
 * Hook que calcula el drift entre dos snapshots usando la cadena de fallback.
 * Renderiza inmediatamente con el motor local y enriquece de forma async con IA.
 * @param from - Snapshot de origen
 * @param to - Snapshot de destino
 * @returns Estado del drift con metadatos de fuente y loading
 */
export function useAgentDrift(from: Snapshot, to: Snapshot): UseAgentDriftResult {
  const localDrift = useMemo(() => calculateDrift(from, to), [from, to]);

  // Unique key derived from snapshot identities to detect when inputs change
  const snapshotKey = `${from.id}-${to.id}`;

  const [enrichment, setEnrichment] = useState<EnrichmentResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAgentDrift(from, to).then((result) => {
      if (!cancelled) {
        setEnrichment({
          drift: result.drift,
          source: result.source,
          fallbackReason: result.fallbackReason,
          telemetry: result.telemetry,
          key: snapshotKey,
        });
      }
    });

    return () => { cancelled = true; };
  }, [from, to, snapshotKey]);

  // Derive output: if enrichment matches current snapshots, use it; otherwise use local
  const isEnriched = enrichment !== null && enrichment.key === snapshotKey;

  return {
    drift: isEnriched ? enrichment.drift : localDrift,
    source: isEnriched ? enrichment.source : 'local',
    fallbackReason: isEnriched ? enrichment.fallbackReason : undefined,
    isEnriching: !isEnriched,
    telemetry: isEnriched ? enrichment.telemetry : undefined,
  };
}
