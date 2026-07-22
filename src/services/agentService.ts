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

/** Campos esperados del LLM */
interface LLMDriftResponse {
  headline?: string;
  socBriefing?: string;
  cisoBriefing?: string;
}

/**
 * Valida que la respuesta parseada del LLM contenga campos string válidos.
 * Retorna solo los campos que son strings no vacíos.
 * @param parsed - Objeto parseado del JSON del LLM
 * @returns Campos validados o null si ninguno es usable
 */
function validateLLMResponse(parsed: unknown): LLMDriftResponse | null {
  if (!parsed || typeof parsed !== 'object') return null;

  const obj = parsed as Record<string, unknown>;
  const result: LLMDriftResponse = {};
  let hasValidField = false;

  if (typeof obj.headline === 'string' && obj.headline.trim().length > 0) {
    result.headline = obj.headline.trim();
    hasValidField = true;
  }
  if (typeof obj.socBriefing === 'string' && obj.socBriefing.trim().length > 0) {
    result.socBriefing = obj.socBriefing.trim();
    hasValidField = true;
  }
  if (typeof obj.cisoBriefing === 'string' && obj.cisoBriefing.trim().length > 0) {
    result.cisoBriefing = obj.cisoBriefing.trim();
    hasValidField = true;
  }

  return hasValidField ? result : null;
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

    const baseDrift = calculateDrift(from, to);
    const prompt = buildPrompt(baseDrift, from.id, to.id);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }],
          },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.0,
            topP: 0.1,
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

    const parsed = JSON.parse(text);
    const validated = validateLLMResponse(parsed);
    if (!validated) throw new Error('Gemini: respuesta JSON no contiene campos válidos');

    return {
      ...baseDrift,
      headline: validated.headline || baseDrift.headline,
      socBriefing: validated.socBriefing || baseDrift.socBriefing,
      cisoBriefing: validated.cisoBriefing || baseDrift.cisoBriefing,
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

    const baseDrift = calculateDrift(from, to);
    const prompt = buildPrompt(baseDrift, from.id, to.id);
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.0,
        top_p: 0.1,
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

    const parsed = JSON.parse(text);
    const validated = validateLLMResponse(parsed);
    if (!validated) throw new Error('Groq: respuesta JSON no contiene campos válidos');

    return {
      ...baseDrift,
      headline: validated.headline || baseDrift.headline,
      socBriefing: validated.socBriefing || baseDrift.socBriefing,
      cisoBriefing: validated.cisoBriefing || baseDrift.cisoBriefing,
    };
  } catch (error) {
    console.warn('[AgentService] Groq falló:', (error as Error).message);
    return null;
  }
}

/** System prompt compartido para ambos proveedores de IA */
const SYSTEM_PROMPT = `Eres un analista senior de ciberseguridad especializado en respuesta a incidentes.
Tu tarea es generar briefings concisos y accionables basados en datos de drift entre snapshots de un incidente.

REGLAS ESTRICTAS:
- Responde ÚNICAMENTE con un objeto JSON válido.
- NO incluyas markdown, comentarios, ni texto fuera del JSON.
- NO inventes datos que no estén en el drift proporcionado.
- Sé factual, preciso y conciso. Cero especulación.
- Los briefings deben ser accionables para el rol correspondiente.

SCHEMA DE RESPUESTA (exactamente estos 3 campos, todos string):
{
  "headline": "Una línea describiendo el cambio más crítico del drift",
  "socBriefing": "Briefing técnico para SOC: IOCs, acciones de contención, evidencia nueva",
  "cisoBriefing": "Briefing ejecutivo para CISO: riesgo de negocio, impacto reputacional, decisiones urgentes"
}`;

/**
 * Construye el prompt enviando el drift pre-calculado (no los snapshots crudos).
 * Optimiza tokens enviando solo la información relevante.
 * @param drift - Drift calculado localmente
 * @param fromId - ID del snapshot de origen
 * @param toId - ID del snapshot de destino
 * @returns Prompt formateado con contexto mínimo necesario
 */
function buildPrompt(drift: Drift, fromId: string, toId: string): string {
  return `TRANSICIÓN: Snapshot ${fromId} → ${toId}

DRIFT DETECTADO:
- Headline local: ${drift.headline}
- Severidad: ${drift.severityChange.from} → ${drift.severityChange.to} (${drift.severityChange.justification})
- Nuevos hechos confirmados (${drift.newFacts.length}): ${drift.newFacts.map(f => f.description).join('; ')}
- Nuevos IOCs (${drift.newIOCs.length}): ${drift.newIOCs.map(i => `[${i.type}] ${i.value}`).join('; ')}
- Giros de confianza (${drift.confidenceShifts.length}): ${drift.confidenceShifts.map(s => `${s.description}: ${s.from}→${s.to}`).join('; ')}
- Decisión urgente: ${drift.urgentDecision.title} (deadline: ${drift.urgentDecision.deadline})

Genera el JSON con headline, socBriefing y cisoBriefing basándote EXCLUSIVAMENTE en estos datos.`;
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
