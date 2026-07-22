/**
 * @fileoverview Servicio de Agente IA con arquitectura de triple fallback.
 * Cadena: Gemini API → Groq API → Motor Determinista Local.
 * Garantiza resiliencia 100% incluso sin conectividad o claves de API.
 */

import type { Snapshot, Drift } from '../types';
import { calculateDrift } from './driftComparator';

/** Fuente que generó el drift */
export type DriftSource = 'gemini' | 'groq' | 'local';

/** Resultado del agente con metadatos de fuente */
export interface AgentDriftResult {
  /** Objeto Drift calculado */
  drift: Drift;
  /** Fuente que generó el resultado */
  source: DriftSource;
  /** Mensaje de fallback si aplica */
  fallbackReason?: string;
}

/**
 * Intenta generar un drift enriquecido usando la API de Google Gemini.
 * @param from - Snapshot de origen
 * @param to - Snapshot de destino
 * @returns Drift enriquecido por IA o null si falla
 */
async function tryGemini(from: Snapshot, to: Snapshot): Promise<Drift | null> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[AgentService] No VITE_GEMINI_API_KEY configurada, saltando Gemini.');
    return null;
  }

  try {
    // SIMULACIÓN CHAOS TEST: Descomentar la siguiente línea para simular fallo de Gemini
    // throw new Error("SIMULACIÓN: API de Gemini no responde");

    const prompt = buildPrompt(from, to);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.3,
          },
        }),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini: respuesta vacía');

    const enriched = JSON.parse(text) as Partial<Drift>;
    const baseDrift = calculateDrift(from, to);

    return {
      ...baseDrift,
      headline: enriched.headline || baseDrift.headline,
      socBriefing: enriched.socBriefing || baseDrift.socBriefing,
      cisoBriefing: enriched.cisoBriefing || baseDrift.cisoBriefing,
    };
  } catch (error) {
    console.warn('[AgentService] Gemini falló:', (error as Error).message);
    return null;
  }
}

/**
 * Intenta generar un drift enriquecido usando la API de Groq.
 * @param from - Snapshot de origen
 * @param to - Snapshot de destino
 * @returns Drift enriquecido por IA o null si falla
 */
async function tryGroq(from: Snapshot, to: Snapshot): Promise<Drift | null> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) {
    console.warn('[AgentService] No VITE_GROQ_API_KEY configurada, saltando Groq.');
    return null;
  }

  try {
    // SIMULACIÓN CHAOS TEST: Descomentar la siguiente línea para simular fallo de Groq
    // throw new Error("SIMULACIÓN: API de Groq tampoco responde");

    const prompt = buildPrompt(from, to);
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'Eres un analista de ciberseguridad experto en respuesta a incidentes. Responde SOLO en JSON válido.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Groq HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('Groq: respuesta vacía');

    const enriched = JSON.parse(text) as Partial<Drift>;
    const baseDrift = calculateDrift(from, to);

    return {
      ...baseDrift,
      headline: enriched.headline || baseDrift.headline,
      socBriefing: enriched.socBriefing || baseDrift.socBriefing,
      cisoBriefing: enriched.cisoBriefing || baseDrift.cisoBriefing,
    };
  } catch (error) {
    console.warn('[AgentService] Groq falló:', (error as Error).message);
    return null;
  }
}

/**
 * Construye el prompt para las APIs de IA.
 * @param from - Snapshot de origen
 * @param to - Snapshot de destino
 * @returns Prompt formateado
 */
function buildPrompt(from: Snapshot, to: Snapshot): string {
  return `Analiza el drift entre estos dos snapshots de un incidente de ciberseguridad y genera un JSON con los campos "headline", "socBriefing" y "cisoBriefing".

SNAPSHOT ORIGEN (${from.id}):
${JSON.stringify(from, null, 2)}

SNAPSHOT DESTINO (${to.id}):
${JSON.stringify(to, null, 2)}

Responde ÚNICAMENTE con un objeto JSON válido con estos campos:
- "headline": string (una línea impactante describiendo el cambio más crítico)
- "socBriefing": string (briefing técnico para SOC con IOCs, acciones de contención)
- "cisoBriefing": string (briefing ejecutivo para CISO con riesgo de negocio y decisiones)`;
}

/**
 * Calcula el drift usando la cadena de fallback: Gemini → Groq → Local.
 * Garantiza que SIEMPRE retorna un resultado válido.
 * @param from - Snapshot de origen
 * @param to - Snapshot de destino
 * @returns Resultado del drift con metadatos de fuente
 */
export async function getAgentDrift(from: Snapshot, to: Snapshot): Promise<AgentDriftResult> {
  // Intento 1: Gemini
  const geminiResult = await tryGemini(from, to);
  if (geminiResult) {
    console.info('[AgentService] ✅ Drift generado por Gemini');
    return { drift: geminiResult, source: 'gemini' };
  }

  // Intento 2: Groq
  const groqResult = await tryGroq(from, to);
  if (groqResult) {
    console.info('[AgentService] ✅ Drift generado por Groq (fallback desde Gemini)');
    return {
      drift: groqResult,
      source: 'groq',
      fallbackReason: 'Gemini no disponible, se usó Groq como alternativa.',
    };
  }

  // Intento 3: Motor determinista local (SIEMPRE funciona)
  console.info('[AgentService] ✅ Drift generado por motor local (fallback desde Gemini + Groq)');
  const localDrift = calculateDrift(from, to);
  return {
    drift: localDrift,
    source: 'local',
    fallbackReason: 'APIs de IA no disponibles. Motor determinista local garantiza funcionalidad completa.',
  };
}
