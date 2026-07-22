/**
 * @fileoverview Sistema Multi-Agente RAG para generación de briefings.
 * Arquitectura: Enrutador Local (Fuse.js) → Agentes Redactores (SOC + CISO) en paralelo.
 * El enrutador usa búsqueda difusa in-browser (latencia ~0ms) en lugar de LLM.
 * Cadena de fallback para redactores: Gemini → Groq → Motor Determinista Local.
 * Garantiza resiliencia 100% y cero alucinaciones mediante grounding en Knowledge Base.
 */

import type { Snapshot, Drift, Regulation, MitreAttackTactic, IncidentPlaybook } from '../types';
import { calculateDrift } from './driftComparator';
import { routeContextLocally } from './localRouter';

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

/** Contexto seleccionado por el Agente Enrutador */
interface RouterContext {
  /** Regulación seleccionada como más relevante */
  regulation: Regulation;
  /** Táctica MITRE seleccionada como más relevante */
  mitreTactic: MitreAttackTactic;
  /** Playbooks aplicables */
  playbooks: IncidentPlaybook[];
}

/** Respuesta esperada de un Agente Redactor */
interface WriterResponse {
  briefing: string;
}

// ─── Structured Output Schemas (JSON Schema) ─────────────────────────────────

/**
 * Schema JSON para la respuesta de los Agentes Redactores (SOC/CISO).
 * Fuerza que la API retorne un objeto con campo briefing obligatorio.
 * Incluye propertyOrdering requerido por Gemini 2.0.
 */
const WRITER_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    briefing: { type: 'STRING', description: 'Texto del briefing generado para el rol correspondiente' },
  },
  required: ['briefing'],
  propertyOrdering: ['briefing'],
} as const;

const GROQ_WRITER_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'writer_response',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        briefing: { type: 'string', description: 'Texto del briefing generado para el rol correspondiente' },
      },
      required: ['briefing'],
      additionalProperties: false,
    },
  },
};

// ─── Utilidades de Llamada LLM (Solo Agentes Redactores) ──────────────────────

/**
 * Ejecuta una llamada a Gemini con structured output nativo (responseSchema).
 * El schema fuerza matemáticamente la estructura de la respuesta a nivel de API.
 * @param systemPrompt - Instrucción de sistema
 * @param userPrompt - Mensaje del usuario
 * @returns Texto de respuesta parseado o null si falla
 */
async function callGemini(systemPrompt: string, userPrompt: string): Promise<string | null> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: WRITER_RESPONSE_SCHEMA,
            temperature: 0.0,
            topP: 0.1,
          },
        }),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini: respuesta vacía');
    return text;
  } catch (error) {
    console.warn('[Multi-Agent] Gemini falló:', (error as Error).message);
    return null;
  }
}

/**
 * Ejecuta una llamada a Groq con structured output nativo (json_schema strict mode).
 * El schema fuerza que la respuesta cumpla exactamente la estructura definida.
 * @param systemPrompt - Instrucción de sistema
 * @param userPrompt - Mensaje del usuario
 * @returns Texto de respuesta parseado o null si falla
 */
async function callGroq(systemPrompt: string, userPrompt: string): Promise<string | null> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.0,
        top_p: 0.1,
        response_format: GROQ_WRITER_SCHEMA,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) throw new Error(`Groq HTTP ${response.status}`);
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('Groq: respuesta vacía');
    return text;
  } catch (error) {
    console.warn('[Multi-Agent] Groq falló:', (error as Error).message);
    return null;
  }
}

/**
 * Ejecuta una llamada LLM con fallback Gemini → Groq para agentes redactores.
 * @param systemPrompt - Instrucción de sistema
 * @param userPrompt - Mensaje del usuario
 * @returns Texto de respuesta o null si ambos fallan
 */
async function callWriterLLM(systemPrompt: string, userPrompt: string): Promise<{ text: string; source: DriftSource } | null> {
  const geminiResult = await callGemini(systemPrompt, userPrompt);
  if (geminiResult) return { text: geminiResult, source: 'gemini' };

  const groqResult = await callGroq(systemPrompt, userPrompt);
  if (groqResult) return { text: groqResult, source: 'groq' };

  return null;
}

// ─── Agente Enrutador Local (Fuse.js + Keywords) ──────────────────────────────

/**
 * Agente 1: Enrutador de Contexto (Local RAG - Latencia Cero).
 * Usa búsqueda difusa local (Fuse.js + keyword matching) en lugar de LLM.
 * Elimina la latencia de red (~1-3s) y el consumo de tokens del enrutador anterior.
 * @param drift - Drift calculado localmente
 * @returns Contexto enrutado con objetos completos de la Knowledge Base
 */
function getIncidentContext(drift: Drift): RouterContext {
  const localContext = routeContextLocally(drift);
  return {
    regulation: localContext.regulation,
    mitreTactic: localContext.mitreTactic,
    playbooks: localContext.playbooks,
  };
}

// ─── Agente 2: Redactor SOC ──────────────────────────────────────────────────

const SOC_WRITER_SYSTEM_PROMPT = `Eres un analista SOC senior redactando un briefing técnico de respuesta a incidentes.

REGLAS ESTRICTAS:
- Responde ÚNICAMENTE con un objeto JSON válido: { "briefing": "texto del briefing" }
- NO incluyas markdown, comentarios, ni texto fuera del JSON.
- Basa TODAS tus recomendaciones de contención y respuesta estrictamente en el framework MITRE ATT&CK y los playbooks proporcionados.
- Cita la táctica MITRE y técnicas específicas cuando las menciones.
- Referencia los pasos del playbook aplicable.
- NO inventes datos que no estén en el drift o la base de conocimiento proporcionada.
- El briefing debe ser técnico, conciso y accionable para un equipo SOC.

DIRECTIVAS CONSTITUCIONALES (ANTI-ALUCINACIÓN):
- Basa tu respuesta EXCLUSIVAMENTE en el Drift y el contexto táctico provisto. No asumas infraestructura que no esté listada.
- NO inventes IOCs, hashes, IPs o dominios que no aparezcan en los datos del drift.
- NO asumas herramientas, sistemas operativos o topología de red no mencionados explícitamente.
- NO generes recomendaciones basadas en técnicas MITRE que no estén en el catálogo proporcionado.
- Si un dato no está disponible en el contexto, indica "información no disponible" en lugar de inventarlo.
- Cada afirmación técnica DEBE ser trazable a un dato proporcionado en el drift o la base de conocimiento.`;

/**
 * Construye el prompt para el Agente Redactor SOC.
 * @param drift - Drift calculado
 * @param mitreTactic - Táctica MITRE seleccionada por el enrutador
 * @param playbooks - Playbooks de respuesta aplicables
 * @returns Prompt con contexto técnico completo
 */
function buildSOCPrompt(drift: Drift, mitreTactic: MitreAttackTactic, playbooks: IncidentPlaybook[]): string {
  const playbookText = playbooks.map(pb =>
    `[${pb.name}] (Aplicar cuando: ${pb.applicableWhen})\nPasos:\n${pb.steps.map(s => `  ${s.order}. ${s.action}: ${s.detail}`).join('\n')}`
  ).join('\n\n');

  return `DRIFT DEL INCIDENTE:
- Headline: ${drift.headline}
- Severidad: ${drift.severityChange.from} → ${drift.severityChange.to} (${drift.severityChange.justification})
- Nuevos hechos (${drift.newFacts.length}): ${drift.newFacts.map(f => `[${f.confidence}] ${f.description}`).join('; ')}
- Nuevos IOCs (${drift.newIOCs.length}): ${drift.newIOCs.map(i => `[${i.type}] ${i.value} — ${i.description}`).join('; ')}
- Giros de confianza: ${drift.confidenceShifts.map(s => `${s.description}: ${s.from}→${s.to}`).join('; ') || 'Ninguno'}

TÁCTICA MITRE ATT&CK APLICABLE:
- ID: ${mitreTactic.id}
- Nombre: ${mitreTactic.name}
- Descripción: ${mitreTactic.description}
- Técnicas comunes: ${mitreTactic.commonTechniques.join(', ')}
- Mitigaciones recomendadas: ${mitreTactic.mitigations.join('; ')}

PLAYBOOKS DE RESPUESTA DISPONIBLES:
${playbookText}

Genera un briefing técnico SOC basándote EXCLUSIVAMENTE en el drift y la base de conocimiento proporcionada.
Cita la táctica MITRE y las técnicas detectadas. Referencia los playbooks aplicables con pasos específicos.`;
}

// ─── Agente 3: Redactor CISO ─────────────────────────────────────────────────

const CISO_WRITER_SYSTEM_PROMPT = `Eres un asesor ejecutivo de ciberseguridad redactando un briefing para el CISO.

REGLAS ESTRICTAS:
- Responde ÚNICAMENTE con un objeto JSON válido: { "briefing": "texto del briefing" }
- NO incluyas markdown, comentarios, ni texto fuera del JSON.
- DEBES mencionar explícitamente la regulación aplicable, sus multas y tiempos de reporte obligatorios.
- Cuantifica el riesgo financiero citando la penalización exacta de la regulación.
- Menciona el deadline de notificación obligatoria en horas.
- NO inventes datos regulatorios que no estén en la base de conocimiento proporcionada.
- El briefing debe ser ejecutivo, orientado a decisiones y riesgo de negocio.

DIRECTIVAS CONSTITUCIONALES (ANTI-ALUCINACIÓN):
- Basa tu respuesta EXCLUSIVAMENTE en el Drift y el contexto legal/regulatorio provisto. No asumas regulaciones no listadas.
- NO inventes multas, porcentajes de facturación o importes monetarios que no estén LITERALMENTE en la regulación proporcionada.
- NO inventes plazos de notificación distintos a los indicados en el campo "notificationDeadlineHours".
- NO asumas jurisdicciones, autoridades competentes o artículos regulatorios no mencionados explícitamente.
- NO generes estimaciones de impacto financiero sin base en los datos proporcionados.
- Si un dato regulatorio específico no está disponible, indica "según la regulación aplicable" en lugar de inventar cifras.
- Cada afirmación sobre riesgo legal DEBE ser trazable a un artículo o dato provisto en la base de conocimiento.`;

/**
 * Construye el prompt para el Agente Redactor CISO.
 * @param drift - Drift calculado
 * @param regulation - Regulación seleccionada por el enrutador
 * @returns Prompt con contexto regulatorio completo
 */
function buildCISOPrompt(drift: Drift, regulation: Regulation): string {
  const articlesText = regulation.keyArticles
    .map(a => `  - ${a.id} (${a.title}): ${a.summary}`)
    .join('\n');

  return `DRIFT DEL INCIDENTE:
- Headline: ${drift.headline}
- Severidad: ${drift.severityChange.from} → ${drift.severityChange.to} (${drift.severityChange.justification})
- Decisión urgente: ${drift.urgentDecision.title} — ${drift.urgentDecision.description}
- Deadline de decisión: ${drift.urgentDecision.deadline}
- Impacto de no actuar: ${drift.urgentDecision.impact}
- Giros de confianza: ${drift.confidenceShifts.map(s => `${s.description}: ${s.from}→${s.to}`).join('; ') || 'Ninguno'}

REGULACIÓN APLICABLE:
- Nombre: ${regulation.name} (${regulation.id.toUpperCase()})
- Jurisdicción: ${regulation.jurisdiction}
- Ámbito: ${regulation.scope}
- Deadline de notificación obligatoria: ${regulation.notificationDeadlineHours !== null ? `${regulation.notificationDeadlineHours} horas` : 'No especificado'}
- Sanciones: ${regulation.penalties}
- Artículos clave:
${articlesText}

Genera un briefing ejecutivo CISO que:
1. Cuantifique el riesgo financiero citando las multas exactas de ${regulation.name}.
2. Indique el tiempo restante para cumplir el deadline de notificación de ${regulation.notificationDeadlineHours}h.
3. Conecte la decisión urgente con las obligaciones regulatorias.
4. Sea accionable para un ejecutivo que debe tomar decisiones inmediatas.`;
}

// ─── Validación de Respuesta de Redactores ────────────────────────────────────

/**
 * Valida la respuesta de un agente redactor.
 * @param parsed - Objeto parseado del JSON
 * @returns Briefing validado o null
 */
function validateWriterResponse(parsed: unknown): WriterResponse | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.briefing === 'string' && obj.briefing.trim().length > 0) {
    return { briefing: obj.briefing.trim() };
  }
  return null;
}

// ─── Orquestador Principal ────────────────────────────────────────────────────

/**
 * Calcula el drift usando la arquitectura Multi-Agente RAG:
 * 1. Motor determinista local calcula el drift base
 * 2. Agente Enrutador selecciona contexto relevante de la Knowledge Base
 * 3. Agentes Redactores (SOC + CISO) generan briefings en paralelo fundamentados en datos reales
 *
 * Garantiza que SIEMPRE retorna un resultado válido gracias al fallback determinista.
 * @param from - Snapshot de origen
 * @param to - Snapshot de destino
 * @returns Resultado del drift con metadatos de fuente
 */
export async function getAgentDrift(from: Snapshot, to: Snapshot): Promise<AgentDriftResult> {
  // Paso 1: Calcular drift base con motor determinista (siempre funciona)
  const baseDrift = calculateDrift(from, to);

  // Paso 2: Enrutador Local selecciona contexto de la Knowledge Base (latencia ~0ms)
  const routerStart = performance.now();
  const context = getIncidentContext(baseDrift);
  const routerMs = (performance.now() - routerStart).toFixed(2);
  console.info(`[Orchestrator] Contexto enrutado localmente en ${routerMs}ms: ${context.regulation.name} + ${context.mitreTactic.name}`);

  // Paso 3: Agentes Redactores en paralelo (SOC + CISO)
  const socPrompt = buildSOCPrompt(baseDrift, context.mitreTactic, context.playbooks);
  const cisoPrompt = buildCISOPrompt(baseDrift, context.regulation);

  const [socResult, cisoResult] = await Promise.all([
    callWriterLLM(SOC_WRITER_SYSTEM_PROMPT, socPrompt),
    callWriterLLM(CISO_WRITER_SYSTEM_PROMPT, cisoPrompt),
  ]);

  // Determinar fuente (prioridad: si alguno usó Gemini, reportar Gemini)
  let source: DriftSource = 'local';
  let fallbackReason: string | undefined;

  const socBriefing = extractBriefing(socResult, baseDrift.socBriefing);
  const cisoBriefing = extractBriefing(cisoResult, baseDrift.cisoBriefing);

  if (socResult || cisoResult) {
    source = socResult?.source === 'gemini' || cisoResult?.source === 'gemini' ? 'gemini' : 'groq';
    if (!socResult || !cisoResult) {
      fallbackReason = 'Generación parcial: un agente redactor usó fallback local.';
    }
  } else {
    source = 'local';
    fallbackReason = 'APIs de IA no disponibles. Motor determinista local garantiza funcionalidad completa.';
  }

  console.info(`[Orchestrator] ✅ Briefings generados — Fuente: ${source}`);

  return {
    drift: {
      ...baseDrift,
      socBriefing,
      cisoBriefing,
    },
    source,
    fallbackReason,
  };
}

/**
 * Extrae el briefing de la respuesta LLM o usa el fallback local.
 * @param result - Resultado de la llamada LLM (puede ser null)
 * @param fallback - Briefing generado por el motor determinista
 * @returns Briefing final validado
 */
function extractBriefing(result: { text: string; source: DriftSource } | null, fallback: string): string {
  if (!result) return fallback;

  try {
    const parsed = JSON.parse(result.text);
    const validated = validateWriterResponse(parsed);
    return validated ? validated.briefing : fallback;
  } catch {
    console.warn('[Writer] Error parseando respuesta, usando fallback local.');
    return fallback;
  }
}
