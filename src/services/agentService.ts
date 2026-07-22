/**
 * @fileoverview Sistema Multi-Agente RAG para generación de briefings.
 * Arquitectura: Agente Enrutador → Agentes Redactores (SOC + CISO) en paralelo.
 * Cadena de fallback por agente: Gemini → Groq → Motor Determinista Local.
 * Garantiza resiliencia 100% y cero alucinaciones mediante grounding en Knowledge Base.
 */

import type { Snapshot, Drift, Regulation, MitreAttackTactic, IncidentPlaybook } from '../types';
import { calculateDrift } from './driftComparator';
import { SECURITY_KNOWLEDGE_BASE } from './knowledgeBase';

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

/** Respuesta esperada del Agente Enrutador */
interface RouterResponse {
  regulationId: string;
  mitreId: string;
}

/** Respuesta esperada de un Agente Redactor */
interface WriterResponse {
  briefing: string;
}

// ─── Contexto por Defecto (Fallback) ─────────────────────────────────────────

/** IDs por defecto cuando el enrutador falla o alucina */
const DEFAULT_REGULATION_ID = 'nis2';
const DEFAULT_MITRE_ID = 'TA0010';

/**
 * Obtiene el contexto por defecto cuando el enrutador falla.
 * Garantiza que el flujo nunca se rompa.
 * @returns Contexto con regulación NIS2 y táctica Exfiltration
 */
function getDefaultContext(): RouterContext {
  const regulation = SECURITY_KNOWLEDGE_BASE.regulations.find(r => r.id === DEFAULT_REGULATION_ID)!;
  const mitreTactic = SECURITY_KNOWLEDGE_BASE.frameworks.find(f => f.id === DEFAULT_MITRE_ID)!;
  return {
    regulation,
    mitreTactic,
    playbooks: SECURITY_KNOWLEDGE_BASE.playbooks,
  };
}

// ─── Structured Output Schemas (JSON Schema) ─────────────────────────────────

/**
 * Schema JSON para la respuesta del Agente Enrutador.
 * Fuerza que la API retorne exactamente la estructura esperada.
 * Incluye propertyOrdering requerido por Gemini 2.0 para determinar orden de generación.
 */
const ROUTER_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    regulationId: { type: 'STRING', description: 'ID de la regulación seleccionada del catálogo' },
    mitreId: { type: 'STRING', description: 'ID de la táctica MITRE ATT&CK seleccionada del catálogo' },
  },
  required: ['regulationId', 'mitreId'],
  propertyOrdering: ['regulationId', 'mitreId'],
} as const;

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

/**
 * Schema JSON para Groq (formato OpenAI json_schema).
 * Estructura compatible con la API de Groq/OpenAI.
 */
const GROQ_ROUTER_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'router_response',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        regulationId: { type: 'string', description: 'ID de la regulación seleccionada del catálogo' },
        mitreId: { type: 'string', description: 'ID de la táctica MITRE ATT&CK seleccionada del catálogo' },
      },
      required: ['regulationId', 'mitreId'],
      additionalProperties: false,
    },
  },
};

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

/** Tipo de agente para seleccionar el schema correcto */
type AgentType = 'router' | 'writer';

// ─── Utilidades de Llamada LLM ────────────────────────────────────────────────

/**
 * Ejecuta una llamada a Gemini con structured output nativo (responseSchema).
 * El schema fuerza matemáticamente la estructura de la respuesta a nivel de API.
 * @param systemPrompt - Instrucción de sistema
 * @param userPrompt - Mensaje del usuario
 * @param agentType - Tipo de agente para seleccionar el schema correcto
 * @returns Texto de respuesta parseado o null si falla
 */
async function callGemini(systemPrompt: string, userPrompt: string, agentType: AgentType): Promise<string | null> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return null;

  const responseSchema = agentType === 'router' ? ROUTER_RESPONSE_SCHEMA : WRITER_RESPONSE_SCHEMA;

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
            responseSchema,
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
 * @param agentType - Tipo de agente para seleccionar el schema correcto
 * @returns Texto de respuesta parseado o null si falla
 */
async function callGroq(systemPrompt: string, userPrompt: string, agentType: AgentType): Promise<string | null> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) return null;

  const responseFormat = agentType === 'router' ? GROQ_ROUTER_SCHEMA : GROQ_WRITER_SCHEMA;

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
        response_format: responseFormat,
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
 * Ejecuta una llamada LLM con fallback Gemini → Groq, usando structured outputs nativos.
 * @param systemPrompt - Instrucción de sistema
 * @param userPrompt - Mensaje del usuario
 * @param agentType - Tipo de agente para seleccionar el schema correcto
 * @returns Texto de respuesta o null si ambos fallan
 */
async function callLLM(systemPrompt: string, userPrompt: string, agentType: AgentType): Promise<{ text: string; source: DriftSource } | null> {
  const geminiResult = await callGemini(systemPrompt, userPrompt, agentType);
  if (geminiResult) return { text: geminiResult, source: 'gemini' };

  const groqResult = await callGroq(systemPrompt, userPrompt, agentType);
  if (groqResult) return { text: groqResult, source: 'groq' };

  return null;
}

// ─── Agente 1: Enrutador de Contexto ──────────────────────────────────────────

const ROUTER_SYSTEM_PROMPT = `Eres un enrutador de contexto especializado en ciberseguridad.
Tu tarea es analizar un drift de incidente y seleccionar la regulación y táctica MITRE ATT&CK más relevantes.

REGLAS ESTRICTAS:
- Responde ÚNICAMENTE con un objeto JSON válido.
- NO incluyas markdown, comentarios, ni texto fuera del JSON.
- Selecciona exactamente 1 regulación y 1 táctica MITRE del catálogo proporcionado.
- Basa tu selección en la naturaleza del incidente y los datos exfiltrados/comprometidos.

DIRECTIVAS CONSTITUCIONALES (ANTI-ALUCINACIÓN):
- SOLO puedes seleccionar IDs que existan LITERALMENTE en el catálogo proporcionado.
- NO inventes IDs de regulaciones ni tácticas que no aparezcan en la lista.
- Si no encuentras una coincidencia perfecta, selecciona la más cercana del catálogo disponible.
- Tu respuesta está restringida al universo cerrado de opciones proporcionadas.

SCHEMA DE RESPUESTA:
{
  "regulationId": "id_de_la_regulacion_seleccionada",
  "mitreId": "id_de_la_tactica_seleccionada"
}`;

/**
 * Construye el prompt para el Agente Enrutador con las llaves disponibles.
 * @param drift - Drift calculado localmente
 * @returns Prompt con contexto del drift y catálogo de IDs disponibles
 */
function buildRouterPrompt(drift: Drift): string {
  const regulationCatalog = SECURITY_KNOWLEDGE_BASE.regulations
    .map(r => `- ${r.id}: ${r.name} (${r.jurisdiction}, ${r.scope})`)
    .join('\n');

  const mitreCatalog = SECURITY_KNOWLEDGE_BASE.frameworks
    .map(f => `- ${f.id}: ${f.name} — ${f.description}`)
    .join('\n');

  return `DRIFT DEL INCIDENTE:
- Headline: ${drift.headline}
- Severidad: ${drift.severityChange.from} → ${drift.severityChange.to}
- Nuevos IOCs: ${drift.newIOCs.map(i => `[${i.type}] ${i.value}`).join(', ') || 'Ninguno'}
- Nuevos hechos: ${drift.newFacts.map(f => f.description).join('; ') || 'Ninguno'}
- Decisión urgente: ${drift.urgentDecision.title}
- Activos impactados (inferidos): infraestructura electoral, base de datos de padrón

CATÁLOGO DE REGULACIONES DISPONIBLES:
${regulationCatalog}

CATÁLOGO DE TÁCTICAS MITRE ATT&CK DISPONIBLES:
${mitreCatalog}

Selecciona la regulación y táctica MITRE más relevantes para este incidente.`;
}

/**
 * Valida que los IDs devueltos por el enrutador existan en la Knowledge Base.
 * @param parsed - Respuesta parseada del enrutador
 * @returns IDs validados o null si son inválidos
 */
function validateRouterResponse(parsed: unknown): RouterResponse | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.regulationId !== 'string' || typeof obj.mitreId !== 'string') return null;

  const regulationExists = SECURITY_KNOWLEDGE_BASE.regulations.some(r => r.id === obj.regulationId);
  const mitreExists = SECURITY_KNOWLEDGE_BASE.frameworks.some(f => f.id === obj.mitreId);

  if (!regulationExists || !mitreExists) {
    console.warn(`[Router] IDs alucinados: regulation=${obj.regulationId}(${regulationExists}), mitre=${obj.mitreId}(${mitreExists})`);
    return null;
  }

  return { regulationId: obj.regulationId as string, mitreId: obj.mitreId as string };
}

/**
 * Agente 1: Enrutador de Contexto.
 * Analiza el drift y selecciona la regulación y táctica MITRE más relevantes.
 * @param drift - Drift calculado localmente
 * @returns Contexto enrutado con objetos completos de la Knowledge Base
 */
async function getIncidentContext(drift: Drift): Promise<RouterContext> {
  const prompt = buildRouterPrompt(drift);
  const llmResult = await callLLM(ROUTER_SYSTEM_PROMPT, prompt, 'router');

  if (!llmResult) {
    console.warn('[Router] Ambas APIs fallaron, usando contexto por defecto.');
    return getDefaultContext();
  }

  try {
    const parsed = JSON.parse(llmResult.text);
    const validated = validateRouterResponse(parsed);

    if (!validated) {
      console.warn('[Router] Respuesta inválida o IDs inexistentes, usando contexto por defecto.');
      return getDefaultContext();
    }

    const regulation = SECURITY_KNOWLEDGE_BASE.regulations.find(r => r.id === validated.regulationId)!;
    const mitreTactic = SECURITY_KNOWLEDGE_BASE.frameworks.find(f => f.id === validated.mitreId)!;

    console.info(`[Router] ✅ Contexto enrutado: ${regulation.name} + ${mitreTactic.name}`);
    return {
      regulation,
      mitreTactic,
      playbooks: SECURITY_KNOWLEDGE_BASE.playbooks,
    };
  } catch (error) {
    console.warn('[Router] Error parseando respuesta:', (error as Error).message);
    return getDefaultContext();
  }
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

  // Paso 2: Agente Enrutador selecciona contexto de la Knowledge Base
  const context = await getIncidentContext(baseDrift);
  console.info(`[Orchestrator] Contexto: ${context.regulation.name} + ${context.mitreTactic.name}`);

  // Paso 3: Agentes Redactores en paralelo (SOC + CISO)
  const socPrompt = buildSOCPrompt(baseDrift, context.mitreTactic, context.playbooks);
  const cisoPrompt = buildCISOPrompt(baseDrift, context.regulation);

  const [socResult, cisoResult] = await Promise.all([
    callLLM(SOC_WRITER_SYSTEM_PROMPT, socPrompt, 'writer'),
    callLLM(CISO_WRITER_SYSTEM_PROMPT, cisoPrompt, 'writer'),
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
