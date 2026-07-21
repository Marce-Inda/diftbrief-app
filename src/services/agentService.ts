/**
 * @fileoverview Servicio de enriquecimiento IA con cascading fallback (Gemini → Groq → Determinista).
 * Enriquece los campos de texto del Drift con contenido analítico generado por IA en español.
 * Garantiza cero errores visibles al usuario mediante degradación graceful.
 */

import { GoogleGenAI } from '@google/genai';
import type { Snapshot, Drift } from '../types';

// ─── Internal Types ────────────────────────────────────────────────────────────

/** Fields that AI providers enrich */
export interface EnrichmentPayload {
  socBriefing: string;
  cisoBriefing: string;
  urgentDecisionDescription: string;
}

/** Result from a provider call attempt */
export type ProviderResult =
  | { success: true; payload: EnrichmentPayload }
  | { success: false; reason: string };

// ─── System Prompt (shared across providers) ───────────────────────────────────

const SYSTEM_PROMPT = `Eres un analista senior de ciberseguridad especializado en respuesta a incidentes.
Tu tarea es generar briefings analíticos en ESPAÑOL para un equipo de respuesta.

INSTRUCCIONES:
- Genera contenido en Markdown estructurado con headers (##) y bullet points (-)
- El tono debe ser profesional, conciso y accionable
- socBriefing: perspectiva técnica para analistas SOC (IOCs, evidencia, contención)
- cisoBriefing: perspectiva ejecutiva para CISO (riesgo, impacto negocio, decisiones)
- urgentDecisionDescription: descripción detallada de la decisión urgente pendiente

FORMATO DE RESPUESTA (JSON estricto):
{
  "socBriefing": "string con markdown",
  "cisoBriefing": "string con markdown",
  "urgentDecisionDescription": "string con markdown"
}

Responde ÚNICAMENTE con el JSON. Sin explicaciones adicionales.`;

// ─── buildPrompt ───────────────────────────────────────────────────────────────

/**
 * Constructs system + user prompts from snapshot and drift data.
 * The user prompt is dynamically built with incident context in Spanish.
 * @param fromSnapshot - Snapshot de origen
 * @param toSnapshot - Snapshot de destino
 * @param baseDrift - Drift calculado por el motor determinista
 * @returns Objeto con systemPrompt y userPrompt listos para enviar al proveedor IA
 */
export function buildPrompt(
  fromSnapshot: Snapshot,
  toSnapshot: Snapshot,
  baseDrift: Drift
): { systemPrompt: string; userPrompt: string } {
  const newFactsBullets = baseDrift.newFacts.length > 0
    ? baseDrift.newFacts.map((f) => `- [${f.confidence.toUpperCase()}] ${f.description}`).join('\n')
    : '- Ninguno';

  const newIOCsBullets = baseDrift.newIOCs.length > 0
    ? baseDrift.newIOCs.map((i) => `- [${i.type.toUpperCase()}] ${i.value} — ${i.description}`).join('\n')
    : '- Ninguno';

  const recommendedActionsList = baseDrift.recommendedActions.length > 0
    ? baseDrift.recommendedActions.map((a, idx) => `${idx + 1}. ${a.description}`).join('\n')
    : '1. Sin acciones recomendadas';

  const userPrompt = `CONTEXTO DEL INCIDENTE:
- Transición: Snapshot ${fromSnapshot.id} → Snapshot ${toSnapshot.id}
- Severidad: ${fromSnapshot.severity} → ${toSnapshot.severity}
- Headline: ${baseDrift.headline}

NUEVOS HECHOS CONFIRMADOS:
${newFactsBullets}

NUEVOS IOCs:
${newIOCsBullets}

DECISIÓN URGENTE ACTUAL:
- Título: ${baseDrift.urgentDecision.title}
- Deadline: ${baseDrift.urgentDecision.deadline}
- Impacto: ${baseDrift.urgentDecision.impact}

ACCIONES RECOMENDADAS:
${recommendedActionsList}

Genera los tres campos de briefing basándote en este contexto.`;

  return { systemPrompt: SYSTEM_PROMPT, userPrompt };
}

// ─── validateEnrichment ────────────────────────────────────────────────────────

/**
 * Validates that a parsed JSON object has the expected EnrichmentPayload shape.
 * Returns a typed EnrichmentPayload or null if validation fails.
 * Performs structural checks: verifies input is a non-null object and that
 * socBriefing, cisoBriefing, and urgentDecisionDescription are non-empty strings.
 * @param raw - Valor parseado del JSON de respuesta del proveedor
 * @returns EnrichmentPayload válido o null si la estructura es inválida
 */
export function validateEnrichment(raw: unknown): EnrichmentPayload | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.socBriefing !== 'string' || obj.socBriefing.trim() === '') {
    return null;
  }

  if (typeof obj.cisoBriefing !== 'string' || obj.cisoBriefing.trim() === '') {
    return null;
  }

  if (typeof obj.urgentDecisionDescription !== 'string' || obj.urgentDecisionDescription.trim() === '') {
    return null;
  }

  return {
    socBriefing: obj.socBriefing,
    cisoBriefing: obj.cisoBriefing,
    urgentDecisionDescription: obj.urgentDecisionDescription,
  };
}

// ─── mergeEnrichment ───────────────────────────────────────────────────────────

/**
 * Merges AI enrichment payload into baseDrift, returning a new Drift object.
 * Only replaces socBriefing, cisoBriefing, and urgentDecision.description.
 * @param baseDrift - Drift original del motor determinista
 * @param payload - Payload validado del proveedor IA
 * @returns Nuevo objeto Drift con campos enriquecidos
 */
export function mergeEnrichment(baseDrift: Drift, payload: EnrichmentPayload): Drift {
  return {
    ...baseDrift,
    socBriefing: payload.socBriefing,
    cisoBriefing: payload.cisoBriefing,
    urgentDecision: {
      ...baseDrift.urgentDecision,
      description: payload.urgentDecisionDescription,
    },
  };
}

// ─── callGemini ────────────────────────────────────────────────────────────────

/**
 * Calls Gemini via @google/genai SDK with 6s timeout.
 * Never throws — returns ProviderResult with success or failure reason.
 * @param systemPrompt - Prompt de sistema compartido
 * @param userPrompt - Prompt de usuario dinámico
 * @returns ProviderResult indicando éxito con payload o fallo con razón
 */
export async function callGemini(
  systemPrompt: string,
  userPrompt: string
): Promise<ProviderResult> {
  try {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      return { success: false, reason: 'Missing or empty VITE_GEMINI_API_KEY' };
    }

    const ai = new GoogleGenAI({ apiKey });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          abortSignal: controller.signal,
        },
      });

      clearTimeout(timeoutId);

      const text = response.text;
      if (!text) {
        console.warn('[AgentService] Gemini provider failed: empty response');
        return { success: false, reason: 'Empty response from Gemini' };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        console.warn('[AgentService] Gemini provider failed: invalid JSON');
        return { success: false, reason: 'Invalid JSON in Gemini response' };
      }

      const payload = validateEnrichment(parsed);
      if (!payload) {
        console.warn('[AgentService] Gemini provider failed: invalid response structure');
        return { success: false, reason: 'Gemini response failed validation' };
      }

      return { success: true, payload };
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('[AgentService] Gemini provider failed: timeout');
        return { success: false, reason: 'Gemini request timed out (6s)' };
      }

      console.warn('[AgentService] Gemini provider failed: request error');
      return { success: false, reason: 'Gemini request failed' };
    }
  } catch {
    console.warn('[AgentService] Gemini provider failed: unexpected error');
    return { success: false, reason: 'Gemini unexpected error' };
  }
}

// ─── callGroq ──────────────────────────────────────────────────────────────────

/**
 * Calls Groq via fetch to OpenAI-compatible REST API with 5s timeout.
 * Never throws — returns ProviderResult with success or failure reason.
 * @param systemPrompt - Prompt de sistema compartido
 * @param userPrompt - Prompt de usuario dinámico
 * @returns ProviderResult indicando éxito con payload o fallo con razón
 */
export async function callGroq(
  systemPrompt: string,
  userPrompt: string
): Promise<ProviderResult> {
  try {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY;
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      return { success: false, reason: 'Missing or empty VITE_GROQ_API_KEY' };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
            response_format: { type: 'json_object' },
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn('[AgentService] Groq provider failed: HTTP error');
        return { success: false, reason: `Groq HTTP error ${response.status}` };
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };

      const content = data?.choices?.[0]?.message?.content;
      if (!content) {
        console.warn('[AgentService] Groq provider failed: empty content');
        return { success: false, reason: 'Empty content in Groq response' };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        console.warn('[AgentService] Groq provider failed: invalid JSON');
        return { success: false, reason: 'Invalid JSON in Groq response' };
      }

      const payload = validateEnrichment(parsed);
      if (!payload) {
        console.warn('[AgentService] Groq provider failed: invalid response structure');
        return { success: false, reason: 'Groq response failed validation' };
      }

      return { success: true, payload };
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('[AgentService] Groq provider failed: timeout');
        return { success: false, reason: 'Groq request timed out (5s)' };
      }

      console.warn('[AgentService] Groq provider failed: request error');
      return { success: false, reason: 'Groq request failed' };
    }
  } catch {
    console.warn('[AgentService] Groq provider failed: unexpected error');
    return { success: false, reason: 'Groq unexpected error' };
  }
}

// ─── enrichDriftWithAI (Exported Orchestrator) ─────────────────────────────────

/**
 * Attempts AI enrichment of a base drift object via cascading providers.
 * Never throws — always returns a valid Drift object.
 * Cascade order: Gemini → Groq → baseDrift (deterministic fallback).
 * @param fromSnapshot - Snapshot de origen
 * @param toSnapshot - Snapshot de destino
 * @param baseDrift - Drift base calculado por el motor determinista
 * @returns Drift enriquecido por IA o baseDrift original si todos los proveedores fallan
 */
export async function enrichDriftWithAI(
  fromSnapshot: Snapshot,
  toSnapshot: Snapshot,
  baseDrift: Drift
): Promise<Drift> {
  try {
    const { systemPrompt, userPrompt } = buildPrompt(fromSnapshot, toSnapshot, baseDrift);

    // Level 1: Attempt Gemini
    const geminiResult = await callGemini(systemPrompt, userPrompt);
    if (geminiResult.success) {
      return mergeEnrichment(baseDrift, geminiResult.payload);
    }
    console.warn(`[AgentService] Gemini failed, trying Groq... Reason: ${geminiResult.reason}`);

    // Level 2: Attempt Groq
    const groqResult = await callGroq(systemPrompt, userPrompt);
    if (groqResult.success) {
      return mergeEnrichment(baseDrift, groqResult.payload);
    }
    console.warn(`[AgentService] Groq failed, using deterministic fallback. Reason: ${groqResult.reason}`);

    // Level 3: Deterministic fallback
    return baseDrift;
  } catch (error: unknown) {
    console.warn('[AgentService] Unexpected error, using deterministic fallback');
    void error;
    return baseDrift;
  }
}
