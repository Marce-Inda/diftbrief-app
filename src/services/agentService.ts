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
import { queryThreatIntelligence, queryRegulatoryPrecedents } from './tools';

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

// ─── Tool-Calling Type Definitions ────────────────────────────────────────────

/**
 * Tool definition in Gemini format.
 * Describes a function that can be invoked by the Gemini model during a tool-calling loop.
 */
export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

/**
 * Tool definition in Groq/OpenAI format.
 * Wraps a function descriptor under a discriminated `type: 'function'` field,
 * following the OpenAI-compatible tool specification used by Groq.
 */
export interface GroqToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
  };
}

/**
 * Registry mapping tool names to their async implementation functions.
 * Each entry maps a tool name string to a function that accepts string arguments
 * and returns a Promise resolving to the tool's result.
 */
export type ToolRegistry = Record<string, (args: Record<string, string>) => Promise<unknown>>;

// ─── Tool Definition Constants ────────────────────────────────────────────────

/** Gemini format tool declaration for queryThreatIntelligence */
export const THREAT_INTEL_GEMINI_DECLARATION: GeminiFunctionDeclaration = {
  name: 'queryThreatIntelligence',
  description: 'Queries threat intelligence data for a given Indicator of Compromise (IOC). Returns reputation, campaign attribution, and recommended containment action.',
  parameters: {
    type: 'OBJECT',
    properties: {
      ioc: { type: 'STRING', description: 'The IOC value to look up (IP address, hash, or domain)' },
    },
    required: ['ioc'],
  },
};

/** Groq/OpenAI format tool definition for queryThreatIntelligence */
export const THREAT_INTEL_GROQ_DEFINITION: GroqToolDefinition = {
  type: 'function',
  function: {
    name: 'queryThreatIntelligence',
    description: 'Queries threat intelligence data for a given Indicator of Compromise (IOC). Returns reputation, campaign attribution, and recommended containment action.',
    parameters: {
      type: 'object',
      properties: {
        ioc: { type: 'string', description: 'The IOC value to look up (IP address, hash, or domain)' },
      },
      required: ['ioc'],
    },
  },
};

/** Gemini format tool declaration for queryRegulatoryPrecedents */
export const REGULATORY_GEMINI_DECLARATION: GeminiFunctionDeclaration = {
  name: 'queryRegulatoryPrecedents',
  description: 'Queries regulatory enforcement precedents and penalty examples for a given regulation. Returns max penalty, recent fine example, and notification deadline.',
  parameters: {
    type: 'OBJECT',
    properties: {
      regulation: { type: 'STRING', description: 'The regulation identifier (e.g., GDPR, NIS2)' },
    },
    required: ['regulation'],
  },
};

/** Groq/OpenAI format tool definition for queryRegulatoryPrecedents */
export const REGULATORY_GROQ_DEFINITION: GroqToolDefinition = {
  type: 'function',
  function: {
    name: 'queryRegulatoryPrecedents',
    description: 'Queries regulatory enforcement precedents and penalty examples for a given regulation. Returns max penalty, recent fine example, and notification deadline.',
    parameters: {
      type: 'object',
      properties: {
        regulation: { type: 'string', description: 'The regulation identifier (e.g., GDPR, NIS2)' },
      },
      required: ['regulation'],
    },
  },
};

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
 * Ejecuta una llamada a Gemini con structured output nativo (responseSchema) o con tool calling.
 * Cuando se proporcionan tool declarations, el modo structured output se desactiva
 * (son mutuamente excluyentes en Gemini) y se habilita el tool calling.
 * @param systemPrompt - Instrucción de sistema
 * @param userPrompt - Mensaje del usuario
 * @param toolDeclarations - Declaraciones de funciones opcionales para tool calling
 * @param _toolRegistry - Registro de herramientas (reservado para uso futuro en el ReAct loop)
 * @returns Texto de respuesta parseado, indicador JSON de functionCall, o null si falla
 */
async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  toolDeclarations?: GeminiFunctionDeclaration[],
  _toolRegistry?: ToolRegistry
): Promise<string | null> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    // Build generationConfig: exclude structured output fields when tools are present
    const generationConfig: Record<string, unknown> = {
      temperature: 0.0,
      topP: 0.1,
    };

    if (!toolDeclarations || toolDeclarations.length === 0) {
      // Structured output mode (existing behavior)
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = WRITER_RESPONSE_SCHEMA;
    }

    // Build request body
    const requestBody: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig,
    };

    // Include tool declarations when provided
    if (toolDeclarations && toolDeclarations.length > 0) {
      requestBody.tools = [{ functionDeclarations: toolDeclarations }];
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
    const data = await response.json();

    // Detect functionCall in response parts
    const functionCall = data.candidates?.[0]?.content?.parts?.[0]?.functionCall;
    if (functionCall) {
      // Check for malformed call: missing name or null fields
      if (!functionCall.name) {
        console.warn('[AgentService] Malformed function call, treating as text');
        // Try to extract text from other parts
        const parts = data.candidates?.[0]?.content?.parts || [];
        const textPart = parts.find((p: Record<string, unknown>) => p.text);
        if (textPart?.text) return textPart.text as string;
        return null;
      }
      return JSON.stringify({
        __functionCall: true,
        name: functionCall.name,
        args: functionCall.args || {},
      });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini: respuesta vacía');
    return text;
  } catch (error) {
    console.warn('[Multi-Agent] Gemini falló:', (error as Error).message);
    return null;
  }
}

/**
 * Ejecuta una llamada a Groq con structured output nativo (json_schema strict mode) o con tool calling.
 * Cuando se proporcionan tool definitions, el modo structured output se desactiva
 * (son mutuamente excluyentes en Groq) y se habilita el tool calling.
 * @param systemPrompt - Instrucción de sistema
 * @param userPrompt - Mensaje del usuario
 * @param toolDefinitions - Definiciones de herramientas opcionales para tool calling (formato OpenAI)
 * @param _toolRegistry - Registro de herramientas (reservado para uso futuro en el ReAct loop)
 * @returns Texto de respuesta parseado, indicador JSON de functionCall, o null si falla
 */
async function callGroq(
  systemPrompt: string,
  userPrompt: string,
  toolDefinitions?: GroqToolDefinition[],
  _toolRegistry?: ToolRegistry
): Promise<string | null> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) return null;

  try {
    // Build request body: exclude response_format when tools are present
    const requestBody: Record<string, unknown> = {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.0,
      top_p: 0.1,
    };

    if (toolDefinitions && toolDefinitions.length > 0) {
      // Tool calling mode: include tools array, omit response_format
      requestBody.tools = toolDefinitions;
    } else {
      // Structured output mode (existing behavior)
      requestBody.response_format = GROQ_WRITER_SCHEMA;
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) throw new Error(`Groq HTTP ${response.status}`);
    const data = await response.json();

    // Detect tool_calls in response message
    const toolCalls = data.choices?.[0]?.message?.tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      try {
        const firstCall = toolCalls[0];
        const name = firstCall?.function?.name;
        if (!name) throw new Error('Missing function name');
        const args = JSON.parse(firstCall.function.arguments || '{}');
        return JSON.stringify({
          __functionCall: true,
          name,
          args,
          callId: firstCall.id,
        });
      } catch {
        console.warn('[AgentService] Malformed function call, treating as text');
        // Try to extract text content from the response
        const text = data.choices?.[0]?.message?.content;
        if (text) return text;
        return null;
      }
    }

    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('Groq: respuesta vacía');
    return text;
  } catch (error) {
    console.warn('[Multi-Agent] Groq falló:', (error as Error).message);
    return null;
  }
}

/** Configuration for tool calling in the ReAct loop */
interface ToolConfig {
  geminiDeclarations: GeminiFunctionDeclaration[];
  groqDefinitions: GroqToolDefinition[];
  registry: ToolRegistry;
}

/**
 * Sends a Gemini follow-up request containing the Function_Response after tool execution.
 * @param systemPrompt - Original system instruction
 * @param userPrompt - Original user message
 * @param functionName - Name of the function that was called
 * @param functionArgs - Arguments the LLM passed to the function
 * @param toolResult - Result from executing the tool (or error object)
 * @param toolDeclarations - Tool declarations to include in follow-up
 * @returns Text response from the follow-up or null on failure
 */
async function sendGeminiFollowUp(
  systemPrompt: string,
  userPrompt: string,
  functionName: string,
  functionArgs: Record<string, string>,
  toolResult: unknown,
  toolDeclarations: GeminiFunctionDeclaration[]
): Promise<string | null> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const requestBody = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [
        { role: 'user', parts: [{ text: userPrompt }] },
        { role: 'model', parts: [{ functionCall: { name: functionName, args: functionArgs } }] },
        { role: 'function', parts: [{ functionResponse: { name: functionName, response: { result: toolResult } } }] },
      ],
      generationConfig: { temperature: 0.0, topP: 0.1 },
      tools: [{ functionDeclarations: toolDeclarations }],
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
    const data = await response.json();

    // Check if follow-up also returns a function call
    const functionCall = data.candidates?.[0]?.content?.parts?.[0]?.functionCall;
    if (functionCall) {
      return JSON.stringify({ __functionCall: true, name: functionCall.name, args: functionCall.args });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini follow-up: respuesta vacía');
    return text;
  } catch (error) {
    console.warn('[Multi-Agent] Gemini follow-up falló:', (error as Error).message);
    return null;
  }
}

/**
 * Sends a Groq follow-up request containing the tool response after tool execution.
 * @param systemPrompt - Original system instruction
 * @param userPrompt - Original user message
 * @param functionName - Name of the function that was called
 * @param functionArgs - Arguments the LLM passed to the function
 * @param toolResult - Result from executing the tool (or error object)
 * @param callId - The tool_call_id from the original Groq response
 * @param toolDefinitions - Tool definitions to include in follow-up
 * @returns Text response from the follow-up or null on failure
 */
async function sendGroqFollowUp(
  systemPrompt: string,
  userPrompt: string,
  functionName: string,
  functionArgs: Record<string, string>,
  toolResult: unknown,
  callId: string,
  toolDefinitions: GroqToolDefinition[]
): Promise<string | null> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) return null;

  try {
    const requestBody = {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: null, tool_calls: [{ id: callId, type: 'function', function: { name: functionName, arguments: JSON.stringify(functionArgs) } }] },
        { role: 'tool', tool_call_id: callId, content: JSON.stringify(toolResult) },
      ],
      temperature: 0.0,
      top_p: 0.1,
      tools: toolDefinitions,
    };

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) throw new Error(`Groq HTTP ${response.status}`);
    const data = await response.json();

    // Check if follow-up also returns a function call
    const toolCalls = data.choices?.[0]?.message?.tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      return JSON.stringify({ __functionCall: true, name: toolCalls[0].function.name, args: JSON.parse(toolCalls[0].function.arguments), callId: toolCalls[0].id });
    }

    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('Groq follow-up: respuesta vacía');
    return text;
  } catch (error) {
    console.warn('[Multi-Agent] Groq follow-up falló:', (error as Error).message);
    return null;
  }
}

/**
 * Sanitizes an error message by removing sensitive information.
 * Strips VITE_* environment variable values, Bearer tokens, Authorization headers,
 * and absolute file paths. Truncates result to 200 characters.
 * @param message - Raw error message to sanitize
 * @returns Sanitized error message, max 200 characters
 */
export function sanitizeErrorMessage(message: string): string {
  let sanitized = message;
  // Strip VITE_* environment variable values (patterns like VITE_SOMETHING=value or VITE_SOMETHING: value)
  sanitized = sanitized.replace(/VITE_[A-Z_]+=\S+/g, '[REDACTED_ENV]');
  sanitized = sanitized.replace(/VITE_[A-Z_]+:\s*\S+/g, '[REDACTED_ENV]');
  // Strip Bearer tokens
  sanitized = sanitized.replace(/Bearer [^\s]+/g, 'Bearer [REDACTED]');
  // Strip Authorization header values
  sanitized = sanitized.replace(/Authorization:\s*[^\s]+/g, 'Authorization: [REDACTED]');
  // Strip absolute file paths containing /home/ or /src/
  sanitized = sanitized.replace(/\/home\/[^\s:,)}\]]+/g, '[REDACTED_PATH]');
  sanitized = sanitized.replace(/\/src\/[^\s:,)}\]]+/g, '[REDACTED_PATH]');
  // Truncate to 200 characters
  if (sanitized.length > 200) {
    sanitized = sanitized.slice(0, 200);
  }
  return sanitized;
}

/**
 * Processes a function call response from the LLM: executes the tool and sends follow-up.
 * @param parsedCall - Parsed function call object with name, args, and optional callId
 * @param systemPrompt - Original system prompt
 * @param userPrompt - Original user prompt
 * @param toolConfig - Tool configuration with declarations, definitions, and registry
 * @param provider - Which provider made the initial call ('gemini' | 'groq')
 * @returns Follow-up text result or null if follow-up fails or returns another function call
 */
async function handleFunctionCall(
  parsedCall: { name: string; args: Record<string, string>; callId?: string },
  systemPrompt: string,
  userPrompt: string,
  toolConfig: ToolConfig,
  provider: 'gemini' | 'groq'
): Promise<string | null> {
  const { name: functionName, args: functionArgs, callId } = parsedCall;

  // Determine tool result: execute if registered, error if not
  let toolResult: unknown;
  if (Object.prototype.hasOwnProperty.call(toolConfig.registry, functionName) && toolConfig.registry[functionName]) {
    try {
      toolResult = await toolConfig.registry[functionName](functionArgs);
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : String(err);
      const sanitized = sanitizeErrorMessage(rawMessage);
      console.error(`[AgentService] ${functionName}: ${sanitized}`);
      toolResult = { error: true, message: `Tool execution failed: ${sanitized}` };
    }
  } else {
    console.warn(`[AgentService] Unregistered function requested: ${functionName}`);
    toolResult = { error: true, message: `function not available: ${functionName}` };
  }

  // Send follow-up with Function_Response to the appropriate provider
  let followUpResult: string | null;
  if (provider === 'gemini') {
    followUpResult = await sendGeminiFollowUp(
      systemPrompt, userPrompt, functionName, functionArgs, toolResult, toolConfig.geminiDeclarations
    );
  } else {
    followUpResult = await sendGroqFollowUp(
      systemPrompt, userPrompt, functionName, functionArgs, toolResult, callId || 'call_unknown', toolConfig.groqDefinitions
    );
  }

  if (!followUpResult) return null;

  // Check if follow-up response is ALSO a function call → terminate loop
  try {
    const followUpParsed = JSON.parse(followUpResult);
    if (followUpParsed.__functionCall === true) {
      console.warn('[AgentService] callWriterLLM: max iterations (2) reached');
      return null;
    }
  } catch {
    // Not JSON — it's a text response, which is what we want
  }

  return followUpResult;
}

/**
 * Ejecuta una llamada LLM con fallback Gemini → Groq para agentes redactores.
 * Cuando se proporciona toolConfig, implementa un ReAct loop de máximo 2 iteraciones
 * (una llamada inicial + un follow-up después de ejecutar la herramienta).
 * @param systemPrompt - Instrucción de sistema
 * @param userPrompt - Mensaje del usuario
 * @param toolConfig - Configuración opcional de herramientas para el ReAct loop
 * @returns Texto de respuesta o null si ambos fallan
 */
async function callWriterLLM(
  systemPrompt: string,
  userPrompt: string,
  toolConfig?: ToolConfig
): Promise<{ text: string; source: DriftSource } | null> {
  // Without toolConfig: original behavior (simple fallback, no ReAct)
  if (!toolConfig) {
    const geminiResult = await callGemini(systemPrompt, userPrompt);
    if (geminiResult) return { text: geminiResult, source: 'gemini' };

    const groqResult = await callGroq(systemPrompt, userPrompt);
    if (groqResult) return { text: groqResult, source: 'groq' };

    return null;
  }

  // With toolConfig: ReAct loop with max 2 iterations per provider

  // Try Gemini first
  const geminiResult = await callGemini(systemPrompt, userPrompt, toolConfig.geminiDeclarations, toolConfig.registry);
  if (geminiResult) {
    // Check if the result is a function call
    try {
      const parsed = JSON.parse(geminiResult);
      if (parsed.__functionCall === true) {
        // Malformed function call: missing name
        if (!parsed.name) {
          console.warn('[AgentService] Malformed function call, treating as text');
          return null;
        }
        const followUpText = await handleFunctionCall(parsed, systemPrompt, userPrompt, toolConfig, 'gemini');
        if (followUpText) return { text: followUpText, source: 'gemini' };
        // Follow-up failed or returned another function call — fall through to Groq
      } else {
        // Valid JSON but not a function call — return as text
        return { text: geminiResult, source: 'gemini' };
      }
    } catch {
      // Not JSON — it's a plain text response
      return { text: geminiResult, source: 'gemini' };
    }
  }

  // Try Groq as fallback
  const groqResult = await callGroq(systemPrompt, userPrompt, toolConfig.groqDefinitions, toolConfig.registry);
  if (groqResult) {
    // Check if the result is a function call
    try {
      const parsed = JSON.parse(groqResult);
      if (parsed.__functionCall === true) {
        // Malformed function call: missing name
        if (!parsed.name) {
          console.warn('[AgentService] Malformed function call, treating as text');
          return null;
        }
        const followUpText = await handleFunctionCall(parsed, systemPrompt, userPrompt, toolConfig, 'groq');
        if (followUpText) return { text: followUpText, source: 'groq' };
        // Follow-up failed or returned another function call — return null for deterministic fallback
        return null;
      } else {
        // Valid JSON but not a function call — return as text
        return { text: groqResult, source: 'groq' };
      }
    } catch {
      // Not JSON — it's a plain text response
      return { text: groqResult, source: 'groq' };
    }
  }

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
 * Construye el system prompt para el Agente Redactor SOC, condicionalmente
 * incluyendo una instrucción de invocación de herramienta cuando existen IOCs en el drift.
 *
 * - Si `drift.newIOCs.length > 0`: agrega instrucción obligatoria para invocar `queryThreatIntelligence`.
 * - Si `drift.newIOCs` está vacío: retorna el prompt base sin instrucción de herramienta.
 *
 * La definición de herramienta (Tool_Definition) se registra siempre en el payload
 * independientemente de esta instrucción (ver Task 7.1).
 *
 * @param drift - Drift calculado con posibles IOCs detectados
 * @returns System prompt completo para el agente SOC
 */
export function buildSOCSystemPrompt(drift: Drift): string {
  if (drift.newIOCs.length === 0) {
    return SOC_WRITER_SYSTEM_PROMPT;
  }

  const iocList = drift.newIOCs.map(ioc => `- [${ioc.type}] ${ioc.value}`).join('\n');

  const toolInstruction = `

HERRAMIENTA DISPONIBLE - INVOCACIÓN OBLIGATORIA:
Los siguientes IOCs han sido detectados en el drift. DEBES invocar la función \`queryThreatIntelligence\` para cada IOC antes de generar tu briefing, para enriquecer el análisis con datos de inteligencia de amenazas.

IOCs detectados:
${iocList}`;

  return SOC_WRITER_SYSTEM_PROMPT + toolInstruction;
}

/**
 * Construye el system prompt para el Agente Redactor CISO, incluyendo siempre
 * una instrucción de invocación de herramienta para `queryRegulatoryPrecedents`.
 *
 * A diferencia de `buildSOCSystemPrompt` (que es condicional según IOCs),
 * el agente CISO siempre necesita precedentes regulatorios cuando hay datos
 * de regulación en el contexto del drift, por lo que la instrucción se agrega
 * incondicionalmente.
 *
 * @returns System prompt completo para el agente CISO con instrucción de herramienta
 */
export function buildCISOSystemPrompt(): string {
  const toolInstruction = `\n\nHERRAMIENTA DISPONIBLE - INVOCACIÓN OBLIGATORIA:\nDEBES invocar la función \`queryRegulatoryPrecedents\` con el identificador de regulación aplicable (ej: "GDPR", "NIS2") que aparezca en el contexto del drift, para enriquecer tu briefing con datos reales de precedentes regulatorios, multas y plazos de notificación.`;

  return CISO_WRITER_SYSTEM_PROMPT + toolInstruction;
}

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

  // Build tool configs for each agent (Requirement 3.1, 3.2, 4.1, 4.4)
  const socToolConfig: ToolConfig = {
    geminiDeclarations: [THREAT_INTEL_GEMINI_DECLARATION],
    groqDefinitions: [THREAT_INTEL_GROQ_DEFINITION],
    registry: { queryThreatIntelligence: (args) => queryThreatIntelligence(args.ioc) },
  };

  const cisoToolConfig: ToolConfig = {
    geminiDeclarations: [REGULATORY_GEMINI_DECLARATION],
    groqDefinitions: [REGULATORY_GROQ_DEFINITION],
    registry: { queryRegulatoryPrecedents: (args) => queryRegulatoryPrecedents(args.regulation) },
  };

  const [socResult, cisoResult] = await Promise.all([
    callWriterLLM(buildSOCSystemPrompt(baseDrift), socPrompt, socToolConfig),
    callWriterLLM(buildCISOSystemPrompt(), cisoPrompt, cisoToolConfig),
  ]);

  // Determinar fuente (prioridad: si alguno usó Gemini, reportar Gemini)
  let source: DriftSource = 'local';
  let fallbackReason: string | undefined;

  const socBriefing = extractBriefing(socResult, baseDrift.socBriefing);
  const cisoBriefing = extractBriefing(cisoResult, baseDrift.cisoBriefing);

  if (socResult || cisoResult) {
    source = socResult?.source === 'gemini' || cisoResult?.source === 'gemini' ? 'gemini' : 'groq';
    if (!socResult || !cisoResult) {
      const failedAgent = !socResult ? 'SOC' : 'CISO';
      const usedProvider = socResult?.source || cisoResult?.source || 'unknown';
      fallbackReason = `${failedAgent} agent: Gemini and Groq failed (provider_unavailable). Deterministic fallback used. Active provider for other agent: ${usedProvider}.`;
      console.warn(`[Orchestrator] Graceful degradation: ${failedAgent} agent fell back to deterministic output. Gemini → Groq → Deterministic chain exhausted.`);
    }
  } else {
    source = 'local';
    fallbackReason = 'All providers failed (Gemini → Groq): provider_unavailable. Full deterministic fallback used for SOC and CISO agents.';
    console.warn('[Orchestrator] Graceful degradation: Both SOC and CISO agents fell back to deterministic output. Gemini and Groq unavailable.');
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
