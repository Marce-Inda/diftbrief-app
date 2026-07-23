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

/**
 * Hook que calcula el drift entre dos snapshots usando la cadena de fallback.
 * Renderiza inmediatamente con el motor local y enriquece de forma async con IA.
 * @param from - Snapshot de origen
 * @param to - Snapshot de destino
 * @returns Estado del drift con metadatos de fuente y loading
 */
export function useAgentDrift(from: Snapshot, to: Snapshot): UseAgentDriftResult {
  const localDrift = useMemo(() => calculateDrift(from, to), [from, to]);

  const [drift, setDrift] = useState<Drift>(localDrift);
  const [source, setSource] = useState<DriftSource>('local');
  const [fallbackReason, setFallbackReason] = useState<string | undefined>();
  const [isEnriching, setIsEnriching] = useState(false);
  const [telemetry, setTelemetry] = useState<TelemetryData | undefined>();

  useEffect(() => {
    setDrift(localDrift);
    setSource('local');
    setFallbackReason(undefined);
    setTelemetry(undefined);
    setIsEnriching(true);

    let cancelled = false;
    getAgentDrift(from, to).then((result) => {
      if (!cancelled) {
        setDrift(result.drift);
        setSource(result.source);
        setFallbackReason(result.fallbackReason);
        setTelemetry(result.telemetry);
        setIsEnriching(false);
      }
    });

    return () => { cancelled = true; };
  }, [from, to, localDrift]);

  return { drift, source, fallbackReason, isEnriching, telemetry };
}
