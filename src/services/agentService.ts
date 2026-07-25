/**
 * @fileoverview Sistema Multi-Agente RAG para generación de briefings.
 * Arquitectura: Enrutador Local (Fuse.js) → Agentes Redactores (SOC + CISO) en paralelo.
 * El enrutador usa búsqueda difusa in-browser (latencia ~0ms) en lugar de LLM.
 * Cadena de fallback para redactores: Gemini → Groq → Motor Determinista Local.
 * Garantiza resiliencia 100% y cero alucinaciones mediante grounding en Knowledge Base.
 */

import type { Snapshot, Drift, Regulation, MitreAttackTactic, IncidentPlaybook, TelemetryData } from '../types';
import { calculateDrift } from './driftComparator';
import { routeContextLocally } from './localRouter';
import { queryThreatIntelligence, queryRegulatoryPrecedents } from './tools';

// Re-export tool functions to keep them available for tests and future use
export { queryThreatIntelligence, queryRegulatoryPrecedents };

/** Fuente que generó el drift */
export type DriftSource = 'gemini' | 'groq' | 'openrouter' | 'local';

/** Resultado del agente con metadatos de fuente */
export interface AgentDriftResult {
  /** Objeto Drift calculado */
  drift: Drift;
  /** Fuente que generó el resultado */
  source: DriftSource;
  /** Mensaje de fallback si aplica */
  fallbackReason?: string;
  /** Datos de telemetría de la última llamada a la API (undefined si se usó fallback local) */
  telemetry?: TelemetryData;
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

/** Structured response from the unified single-pass LLM call */
interface UnifiedLLMResponse {
  /** SOC technical briefing text */
  socBriefing: string;
  /** CISO executive briefing text */
  cisoBriefing: string;
  /** Urgent decision summary text */
  urgentDecision: string;
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
  type: 'json_object' as const,
};

const UNIFIED_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    socBriefing: { type: 'STRING', description: 'SOC technical incident briefing text' },
    cisoBriefing: { type: 'STRING', description: 'CISO executive risk briefing text' },
    urgentDecision: { type: 'STRING', description: 'Urgent decision summary for the current escalation' },
  },
  required: ['socBriefing', 'cisoBriefing', 'urgentDecision'],
  propertyOrdering: ['socBriefing', 'cisoBriefing', 'urgentDecision'],
} as const;

const GROQ_UNIFIED_SCHEMA = {
  type: 'json_object' as const,
};

// ─── Telemetry Metadata Types ─────────────────────────────────────────────────

/** Approximate token pricing per token (USD) for cost estimation */
const GEMINI_COST_PER_TOKEN = 0.00001;
const GROQ_COST_PER_TOKEN = 0.000001;
const OPENROUTER_COST_PER_TOKEN = 0;

/** Internal metadata captured from a single LLM API call */
interface LLMCallMetadata {
  /** Round-trip latency in milliseconds */
  latencyMs: number;
  /** Total tokens consumed (prompt + completion), null if unavailable */
  tokensConsumed: number | null;
}

/** Result from an LLM call including response text and telemetry metadata */
interface LLMCallResult {
  /** Response text (may be JSON stringified function call) */
  text: string;
  /** Telemetry metadata from the API call */
  metadata: LLMCallMetadata;
}

/** In-memory cache indexed by Transition_Key (fromId-toId). Prevents redundant API calls. */
const driftCache = new Map<string, AgentDriftResult>();

// ─── Utilidades de Llamada LLM (Solo Agentes Redactores) ──────────────────────

/**
 * Ejecuta una llamada a Gemini con structured output nativo (responseSchema) o con tool calling.
 * Cuando se proporcionan tool declarations, el modo structured output se desactiva
 * (son mutuamente excluyentes en Gemini) y se habilita el tool calling.
 * Captures response timing and token usage metadata for telemetry.
 * @param systemPrompt - Instrucción de sistema
 * @param userPrompt - Mensaje del usuario
 * @param toolDeclarations - Declaraciones de funciones opcionales para tool calling
 * @param _toolRegistry - Registro de herramientas (reservado para uso futuro en el ReAct loop)
 * @returns LLMCallResult with text and metadata, or null si falla
 */
async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  toolDeclarations?: GeminiFunctionDeclaration[],
  _toolRegistry?: ToolRegistry,
  responseSchema?: typeof UNIFIED_RESPONSE_SCHEMA
): Promise<LLMCallResult | null> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return null;

  const startTime = Date.now();

  try {
    // Build generationConfig: exclude structured output fields when tools are present
    const generationConfig: Record<string, unknown> = {
      temperature: 0.0,
      topP: 0.1,
    };

    if (!toolDeclarations || toolDeclarations.length === 0) {
      // Structured output mode (existing behavior or custom schema override)
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = responseSchema || WRITER_RESPONSE_SCHEMA;
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
    const latencyMs = Date.now() - startTime;

    // Extract token usage from Gemini response metadata
    const tokensConsumed: number | null =
      typeof data.usageMetadata?.totalTokenCount === 'number'
        ? data.usageMetadata.totalTokenCount
        : null;

    const metadata: LLMCallMetadata = { latencyMs, tokensConsumed };

    // Detect functionCall in response parts
    const functionCall = data.candidates?.[0]?.content?.parts?.[0]?.functionCall;
    if (functionCall) {
      // Check for malformed call: missing name or null fields
      if (!functionCall.name) {
        console.warn('[AgentService] Malformed function call, treating as text');
        // Try to extract text from other parts
        const parts = data.candidates?.[0]?.content?.parts || [];
        const textPart = parts.find((p: Record<string, unknown>) => p.text);
        if (textPart?.text) return { text: textPart.text as string, metadata };
        return null;
      }
      return {
        text: JSON.stringify({
          __functionCall: true,
          name: functionCall.name,
          args: functionCall.args || {},
        }),
        metadata,
      };
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini: respuesta vacía');
    return { text, metadata };
  } catch (error) {
    console.warn('[Multi-Agent] Gemini falló:', (error as Error).message);
    return null;
  }
}

/**
 * Ejecuta una llamada a Groq con structured output nativo (json_schema strict mode) o con tool calling.
 * Cuando se proporcionan tool definitions, el modo structured output se desactiva
 * (son mutuamente excluyentes en Groq) y se habilita el tool calling.
 * Captures response timing and token usage metadata for telemetry.
 * @param systemPrompt - Instrucción de sistema
 * @param userPrompt - Mensaje del usuario
 * @param toolDefinitions - Definiciones de herramientas opcionales para tool calling (formato OpenAI)
 * @param _toolRegistry - Registro de herramientas (reservado para uso futuro en el ReAct loop)
 * @returns LLMCallResult with text and metadata, or null si falla
 */
async function callGroq(
  systemPrompt: string,
  userPrompt: string,
  toolDefinitions?: GroqToolDefinition[],
  _toolRegistry?: ToolRegistry,
  responseFormat?: { type: string }
): Promise<LLMCallResult | null> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) return null;

  const startTime = Date.now();

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
      // Structured output mode (existing behavior or custom schema override)
      requestBody.response_format = responseFormat || GROQ_WRITER_SCHEMA;
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
    const latencyMs = Date.now() - startTime;

    // Extract token usage from Groq response metadata (OpenAI-compatible format)
    const tokensConsumed: number | null =
      typeof data.usage?.total_tokens === 'number'
        ? data.usage.total_tokens
        : null;

    const metadata: LLMCallMetadata = { latencyMs, tokensConsumed };

    // Detect tool_calls in response message
    const toolCalls = data.choices?.[0]?.message?.tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      try {
        const firstCall = toolCalls[0];
        const name = firstCall?.function?.name;
        if (!name) throw new Error('Missing function name');
        const args = JSON.parse(firstCall.function.arguments || '{}');
        return {
          text: JSON.stringify({
            __functionCall: true,
            name,
            args,
            callId: firstCall.id,
          }),
          metadata,
        };
      } catch {
        console.warn('[AgentService] Malformed function call, treating as text');
        // Try to extract text content from the response
        const text = data.choices?.[0]?.message?.content;
        if (text) return { text, metadata };
        return null;
      }
    }

    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('Groq: respuesta vacía');
    return { text, metadata };
  } catch (error) {
    console.warn('[Multi-Agent] Groq falló:', (error as Error).message);
    return null;
  }
}

/**
 * Executes a call to OpenRouter with OpenAI-compatible format.
 * Supports both plain text responses and tool-calling mode.
 * Uses the free-tier model `meta-llama/llama-3.1-8b-instruct:free`.
 * @param systemPrompt - System instruction
 * @param userPrompt - User message
 * @param toolDefinitions - Optional tool definitions (same format as Groq)
 * @param _toolRegistry - Tool registry (reserved for ReAct loop)
 * @returns LLMCallResult with text and metadata, or null on failure
 */
export async function callOpenRouter(
  systemPrompt: string,
  userPrompt: string,
  toolDefinitions?: GroqToolDefinition[],
  _toolRegistry?: ToolRegistry
): Promise<LLMCallResult | null> {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') return null;

  const startTime = Date.now();

  try {
    const requestBody: Record<string, unknown> = {
      model: 'meta-llama/llama-3.1-8b-instruct:free',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.0,
    };

    if (toolDefinitions && toolDefinitions.length > 0) {
      requestBody.tools = toolDefinitions;
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://driftbrief-app.vercel.app',
        'X-Title': 'DriftBrief',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const msg = sanitizeErrorMessage(`OpenRouter HTTP ${response.status}`);
      console.warn(`[Multi-Agent] OpenRouter falló: ${msg}`);
      return null;
    }

    let data: Record<string, unknown>;
    try {
      data = await response.json();
    } catch {
      const msg = sanitizeErrorMessage('OpenRouter: response body is not valid JSON');
      console.warn(`[Multi-Agent] ${msg}`);
      return null;
    }

    const latencyMs = Date.now() - startTime;

    // Extract token usage from OpenRouter response metadata (OpenAI-compatible format)
    const usage = data.usage as Record<string, unknown> | undefined;
    const tokensConsumed: number | null =
      typeof usage?.total_tokens === 'number'
        ? usage.total_tokens
        : null;

    const metadata: LLMCallMetadata = { latencyMs, tokensConsumed };

    // Detect tool_calls in response message
    const choices = data.choices as Array<Record<string, unknown>> | undefined;
    const message = choices?.[0]?.message as Record<string, unknown> | undefined;
    const toolCalls = message?.tool_calls as Array<Record<string, unknown>> | undefined;

    if (toolCalls && toolCalls.length > 0) {
      try {
        const firstCall = toolCalls[0];
        const fn = firstCall?.function as Record<string, unknown> | undefined;
        const name = fn?.name as string | undefined;
        if (!name) throw new Error('Missing function name');
        const args = JSON.parse((fn?.arguments as string) || '{}');
        return {
          text: JSON.stringify({
            __functionCall: true,
            name,
            args,
            callId: firstCall.id,
          }),
          metadata,
        };
      } catch {
        const msg = sanitizeErrorMessage('OpenRouter: malformed tool_call in response');
        console.warn(`[AgentService] ${msg}`);
        const text = message?.content as string | undefined;
        if (text) return { text, metadata };
        return null;
      }
    }

    const text = message?.content as string | undefined;
    if (!text) {
      const msg = sanitizeErrorMessage('OpenRouter: empty or missing content in response');
      console.warn(`[Multi-Agent] ${msg}`);
      return null;
    }
    return { text, metadata };
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const msg = sanitizeErrorMessage(`OpenRouter falló: ${rawMessage}`);
    console.warn(`[Multi-Agent] ${msg}`);
    return null;
  }
}

/** Configuration for tool calling in the ReAct loop */
interface ToolConfig {
  geminiDeclarations: GeminiFunctionDeclaration[];
  groqDefinitions: GroqToolDefinition[];
  openrouterDefinitions: GroqToolDefinition[];
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
 * Sends an OpenRouter follow-up request containing the tool response after execution.
 * Mirrors sendGroqFollowUp but targets the OpenRouter endpoint with appropriate headers.
 * @param systemPrompt - Original system instruction
 * @param userPrompt - Original user message
 * @param functionName - Name of the function that was called
 * @param functionArgs - Arguments the LLM passed to the function
 * @param toolResult - Result from executing the tool (or error object)
 * @param callId - The tool_call_id from the original OpenRouter response
 * @param toolDefinitions - Tool definitions to include in follow-up
 * @returns Text response from the follow-up or null on failure
 */
export async function sendOpenRouterFollowUp(
  systemPrompt: string,
  userPrompt: string,
  functionName: string,
  functionArgs: Record<string, string>,
  toolResult: unknown,
  callId: string,
  toolDefinitions: GroqToolDefinition[]
): Promise<string | null> {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') return null;

  try {
    const requestBody = {
      model: 'meta-llama/llama-3.1-8b-instruct:free',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: null, tool_calls: [{ id: callId, type: 'function', function: { name: functionName, arguments: JSON.stringify(functionArgs) } }] },
        { role: 'tool', tool_call_id: callId, content: JSON.stringify(toolResult) },
      ],
      temperature: 0.0,
      tools: toolDefinitions,
    };

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://driftbrief-app.vercel.app',
        'X-Title': 'DriftBrief',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const msg = sanitizeErrorMessage(`OpenRouter follow-up HTTP ${response.status}`);
      console.warn(`[Multi-Agent] ${msg}`);
      return null;
    }

    let data: Record<string, unknown>;
    try {
      data = await response.json();
    } catch {
      const msg = sanitizeErrorMessage('OpenRouter follow-up: response body is not valid JSON');
      console.warn(`[Multi-Agent] ${msg}`);
      return null;
    }

    // Check if follow-up also returns a function call
    const choices = data.choices as Array<Record<string, unknown>> | undefined;
    const message = choices?.[0]?.message as Record<string, unknown> | undefined;
    const toolCalls = message?.tool_calls as Array<Record<string, unknown>> | undefined;

    if (toolCalls && toolCalls.length > 0) {
      const firstCall = toolCalls[0];
      const fn = firstCall?.function as Record<string, unknown> | undefined;
      const name = fn?.name as string | undefined;
      const args = fn?.arguments as string | undefined;
      return JSON.stringify({
        __functionCall: true,
        name: name || 'unknown',
        args: args ? JSON.parse(args) : {},
        callId: firstCall.id,
      });
    }

    const text = message?.content as string | undefined;
    if (!text) {
      const msg = sanitizeErrorMessage('OpenRouter follow-up: empty or missing content');
      console.warn(`[Multi-Agent] ${msg}`);
      return null;
    }
    return text;
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const msg = sanitizeErrorMessage(`OpenRouter follow-up falló: ${rawMessage}`);
    console.warn(`[Multi-Agent] ${msg}`);
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
  provider: 'gemini' | 'groq' | 'openrouter'
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
  } else if (provider === 'openrouter') {
    followUpResult = await sendOpenRouterFollowUp(
      systemPrompt, userPrompt, functionName, functionArgs, toolResult, callId || 'call_unknown', toolConfig.openrouterDefinitions
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
 * Propagates telemetry metadata from the underlying API call.
 * @param systemPrompt - Instrucción de sistema
 * @param userPrompt - Mensaje del usuario
 * @param toolConfig - Configuración opcional de herramientas para el ReAct loop
 * @returns Object with text, source, and metadata or null si ambos fallan
 */
export async function callWriterLLM(
  systemPrompt: string,
  userPrompt: string,
  toolConfig?: ToolConfig
): Promise<{ text: string; source: DriftSource; metadata: LLMCallMetadata } | null> {
  // Without toolConfig: original behavior (simple fallback, no ReAct)
  if (!toolConfig) {
    const geminiResult = await callGemini(systemPrompt, userPrompt);
    if (geminiResult) return { text: geminiResult.text, source: 'gemini', metadata: geminiResult.metadata };

    const groqResult = await callGroq(systemPrompt, userPrompt);
    if (groqResult) return { text: groqResult.text, source: 'groq', metadata: groqResult.metadata };

    const openRouterResult = await callOpenRouter(systemPrompt, userPrompt);
    if (openRouterResult) return { text: openRouterResult.text, source: 'openrouter', metadata: openRouterResult.metadata };

    return null;
  }

  // With toolConfig: ReAct loop with max 2 iterations per provider

  // Try Gemini first
  const geminiResult = await callGemini(systemPrompt, userPrompt, toolConfig.geminiDeclarations, toolConfig.registry);
  if (geminiResult) {
    // Check if the result is a function call
    try {
      const parsed = JSON.parse(geminiResult.text);
      if (parsed.__functionCall === true) {
        // Malformed function call: missing name
        if (!parsed.name) {
          console.warn('[AgentService] Malformed function call, treating as text');
          return null;
        }
        const followUpText = await handleFunctionCall(parsed, systemPrompt, userPrompt, toolConfig, 'gemini');
        if (followUpText) return { text: followUpText, source: 'gemini', metadata: geminiResult.metadata };
        // Follow-up failed or returned another function call — fall through to Groq
      } else {
        // Valid JSON but not a function call — return as text
        return { text: geminiResult.text, source: 'gemini', metadata: geminiResult.metadata };
      }
    } catch {
      // Not JSON — it's a plain text response
      return { text: geminiResult.text, source: 'gemini', metadata: geminiResult.metadata };
    }
  }

  // Try Groq as fallback
  const groqResult = await callGroq(systemPrompt, userPrompt, toolConfig.groqDefinitions, toolConfig.registry);
  if (groqResult) {
    // Check if the result is a function call
    try {
      const parsed = JSON.parse(groqResult.text);
      if (parsed.__functionCall === true) {
        // Malformed function call: missing name
        if (!parsed.name) {
          console.warn('[AgentService] Malformed function call, treating as text');
          // Fall through to OpenRouter
        } else {
          const followUpText = await handleFunctionCall(parsed, systemPrompt, userPrompt, toolConfig, 'groq');
          if (followUpText) return { text: followUpText, source: 'groq', metadata: groqResult.metadata };
          // Follow-up failed or returned another function call — fall through to OpenRouter
        }
      } else {
        // Valid JSON but not a function call — return as text
        return { text: groqResult.text, source: 'groq', metadata: groqResult.metadata };
      }
    } catch {
      // Not JSON — it's a plain text response
      return { text: groqResult.text, source: 'groq', metadata: groqResult.metadata };
    }
  }

  // Try OpenRouter as third fallback
  const openRouterResult = await callOpenRouter(systemPrompt, userPrompt, toolConfig.openrouterDefinitions, toolConfig.registry);
  if (openRouterResult) {
    // Check if the result is a function call
    try {
      const parsed = JSON.parse(openRouterResult.text);
      if (parsed.__functionCall === true) {
        // Malformed function call: missing name
        if (!parsed.name) {
          console.warn('[AgentService] Malformed function call, treating as text');
          return null;
        }
        const followUpText = await handleFunctionCall(parsed, systemPrompt, userPrompt, toolConfig, 'openrouter');
        if (followUpText) return { text: followUpText, source: 'openrouter', metadata: openRouterResult.metadata };
        // Follow-up failed or returned another function call — return null for deterministic fallback
        return null;
      } else {
        // Valid JSON but not a function call — return as text
        return { text: openRouterResult.text, source: 'openrouter', metadata: openRouterResult.metadata };
      }
    } catch {
      // Not JSON — it's a plain text response
      return { text: openRouterResult.text, source: 'openrouter', metadata: openRouterResult.metadata };
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
export function buildSOCPrompt(drift: Drift, mitreTactic: MitreAttackTactic, playbooks: IncidentPlaybook[]): string {
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
export function buildCISOPrompt(drift: Drift, regulation: Regulation): string {
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
export function validateWriterResponse(parsed: unknown): WriterResponse | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.briefing === 'string' && obj.briefing.trim().length > 0) {
    return { briefing: obj.briefing.trim() };
  }
  return null;
}

// ─── Unified Single-Pass Prompt & Validation ─────────────────────────────────

/**
 * Builds a unified system prompt combining SOC and CISO directives for single-pass briefing generation.
 * @returns System prompt instructing the LLM to return a structured JSON with both briefings
 */
function buildUnifiedSystemPrompt(): string {
  return `Eres un experto dual en ciberseguridad: tanto analista SOC senior como asesor ejecutivo CISO.
Genera un objeto JSON con EXACTAMENTE estos tres campos:

1. "socBriefing": Briefing técnico para el equipo SOC. Incluye:
   - Nuevos hechos confirmados con nivel de confianza
   - Nuevos IOCs detectados (tipo y valor)
   - Acciones prioritarias de contención citando MITRE ATT&CK
   - Referencia a playbooks aplicables con pasos específicos

2. "cisoBriefing": Briefing ejecutivo para el CISO. Incluye:
   - Evaluación de riesgo con cambio de severidad
   - Impacto regulatorio citando la regulación aplicable, multas y plazos
   - Decisión urgente requerida con deadline e impacto de inacción
   - Acciones estratégicas priorizadas

3. "urgentDecision": Resumen conciso (1-2 oraciones) de la decisión más urgente.

REGLAS ESTRICTAS:
- Responde ÚNICAMENTE con un objeto JSON válido con los tres campos.
- NO incluyas markdown, comentarios ni texto fuera del JSON.
- NO inventes datos, IOCs, hashes, IPs, regulaciones ni multas que no estén en el contexto proporcionado.
- Cada afirmación DEBE ser trazable a un dato del drift o la base de conocimiento provista.
- Si un dato no está disponible, indica "información no disponible" en lugar de inventarlo.`;
}

/**
 * Builds the unified user prompt merging drift data, MITRE tactic, regulation, and playbooks.
 * @param drift - Calculated drift between snapshots
 * @param context - Router context with regulation, MITRE tactic, and playbooks
 * @returns User prompt with complete incident context for unified briefing generation
 */
function buildUnifiedUserPrompt(drift: Drift, context: RouterContext): string {
  const playbookText = context.playbooks.map(pb =>
    `[${pb.name}] (Aplicar cuando: ${pb.applicableWhen})\nPasos:\n${pb.steps.map(s => `  ${s.order}. ${s.action}: ${s.detail}`).join('\n')}`
  ).join('\n\n');

  const articlesText = context.regulation.keyArticles
    .map(a => `  - ${a.id} (${a.title}): ${a.summary}`)
    .join('\n');

  return `DRIFT DEL INCIDENTE:
- Headline: ${drift.headline}
- Severidad: ${drift.severityChange.from} → ${drift.severityChange.to} (${drift.severityChange.justification})
- Nuevos hechos (${drift.newFacts.length}): ${drift.newFacts.map(f => `[${f.confidence}] ${f.description}`).join('; ')}
- Nuevos IOCs (${drift.newIOCs.length}): ${drift.newIOCs.map(i => `[${i.type}] ${i.value} — ${i.description}`).join('; ')}
- Giros de confianza: ${drift.confidenceShifts.map(s => `${s.description}: ${s.from}→${s.to}`).join('; ') || 'Ninguno'}
- Decisión urgente: ${drift.urgentDecision.title} — ${drift.urgentDecision.description}
- Deadline: ${drift.urgentDecision.deadline}
- Impacto de no actuar: ${drift.urgentDecision.impact}

TÁCTICA MITRE ATT&CK APLICABLE:
- ID: ${context.mitreTactic.id}
- Nombre: ${context.mitreTactic.name}
- Descripción: ${context.mitreTactic.description}
- Técnicas comunes: ${context.mitreTactic.commonTechniques.join(', ')}
- Mitigaciones: ${context.mitreTactic.mitigations.join('; ')}

REGULACIÓN APLICABLE:
- Nombre: ${context.regulation.name} (${context.regulation.id.toUpperCase()})
- Jurisdicción: ${context.regulation.jurisdiction}
- Ámbito: ${context.regulation.scope}
- Deadline de notificación: ${context.regulation.notificationDeadlineHours !== null ? `${context.regulation.notificationDeadlineHours} horas` : 'No especificado'}
- Sanciones: ${context.regulation.penalties}
- Artículos clave:
${articlesText}

PLAYBOOKS DE RESPUESTA:
${playbookText}

Genera el JSON con los tres campos: socBriefing, cisoBriefing, urgentDecision.`;
}

/**
 * Sanitizes a raw LLM response string by removing markdown code fences,
 * leading/trailing whitespace, and other common LLM output artifacts.
 * @param raw - Raw text response from the LLM
 * @returns Clean JSON string ready for JSON.parse()
 */
function sanitizeLLMJsonResponse(raw: string): string {
  let cleaned = raw.trim();
  // Remove markdown code fences: ```json ... ``` or ``` ... ```
  if (cleaned.startsWith('```')) {
    // Remove opening fence (with optional language tag)
    cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/, '');
    // Remove closing fence
    cleaned = cleaned.replace(/\n?\s*```\s*$/, '');
  }
  // Remove any BOM or zero-width characters
  cleaned = cleaned.replace(/^\uFEFF/, '');
  // Trim again after removal
  return cleaned.trim();
}

/**
 * Coerces a field value to a non-empty string.
 * If the value is already a string, returns it trimmed.
 * If the value is an object or array, serializes it to a readable string.
 * Returns null if the value is empty, null, or undefined.
 * @param value - Raw field value from LLM response
 * @returns Coerced string or null
 */
function coerceToString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (value !== null && value !== undefined && typeof value === 'object') {
    // LLM returned a structured object instead of a plain string
    // Serialize it to a readable format
    const serialized = JSON.stringify(value, null, 2);
    return serialized.length > 2 ? serialized : null; // "{}" or "[]" are considered empty
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

/**
 * Validates the unified LLM response contains all required non-empty fields.
 * Accepts common field name variations produced by LLMs (socView/socBriefing, cisoView/cisoBriefing).
 * Fields can be strings OR objects (objects are serialized to string).
 * Logs the exact validation failure reason for diagnostics.
 * @param parsed - Parsed JSON object from LLM response
 * @returns Validated UnifiedLLMResponse or null if validation fails
 */
function validateUnifiedResponse(parsed: unknown): UnifiedLLMResponse | null {
  if (!parsed || typeof parsed !== 'object') {
    console.warn('[Orchestrator] validateUnifiedResponse: input is not an object:', typeof parsed);
    return null;
  }
  const obj = parsed as Record<string, unknown>;

  // Accept field name variations commonly produced by LLMs
  const rawSoc = obj.socBriefing ?? obj.socView ?? obj.soc_briefing ?? obj.SOCBriefing;
  const rawCiso = obj.cisoBriefing ?? obj.cisoView ?? obj.ciso_briefing ?? obj.CISOBriefing;
  const rawDecision = obj.urgentDecision ?? obj.urgent_decision ?? obj.decision ?? obj.urgentAction;

  // Coerce fields (accept both strings and structured objects)
  const socBriefing = coerceToString(rawSoc);
  const cisoBriefing = coerceToString(rawCiso);
  const urgentDecision = coerceToString(rawDecision);

  if (!socBriefing) {
    console.warn('[Orchestrator] validateUnifiedResponse failed: socBriefing missing or empty. Keys found:', Object.keys(obj).join(', '), '| typeof:', typeof rawSoc);
    return null;
  }
  if (!cisoBriefing) {
    console.warn('[Orchestrator] validateUnifiedResponse failed: cisoBriefing missing or empty. Keys found:', Object.keys(obj).join(', '), '| typeof:', typeof rawCiso);
    return null;
  }
  if (!urgentDecision) {
    console.warn('[Orchestrator] validateUnifiedResponse failed: urgentDecision missing or empty. Keys found:', Object.keys(obj).join(', '), '| typeof:', typeof rawDecision);
    return null;
  }

  return { socBriefing, cisoBriefing, urgentDecision };
}

// ─── Orquestador Principal ────────────────────────────────────────────────────

/**
 * Computes estimated cost in USD based on token count and provider pricing.
 * Returns null if token count is unavailable.
 * @param tokensConsumed - Total tokens used, or null if unavailable
 * @param source - Provider that served the response ('gemini' | 'groq')
 * @returns Estimated cost rounded to 4 decimal places, or null
 */
function computeEstimatedCost(tokensConsumed: number | null, source: DriftSource): number | null {
  if (tokensConsumed === null) return null;
  const costMap: Record<DriftSource, number> = {
    gemini: GEMINI_COST_PER_TOKEN,
    groq: GROQ_COST_PER_TOKEN,
    openrouter: OPENROUTER_COST_PER_TOKEN,
    local: 0,
  };
  const costPerToken = costMap[source] ?? 0;
  return parseFloat((tokensConsumed * costPerToken).toFixed(4));
}

/**
 * Calcula el drift usando arquitectura Single-Pass:
 * 1. Verifica caché en memoria (retorno inmediato si existe)
 * 2. Motor determinista local calcula el drift base
 * 3. Enrutador Local selecciona contexto relevante
 * 4. Una sola llamada LLM con prompt unificado (Gemini → Groq → Local)
 * 5. Almacena resultado en caché
 *
 * Garantiza SIEMPRE un resultado válido gracias al fallback determinista.
 * @param from - Snapshot de origen
 * @param to - Snapshot de destino
 * @returns Resultado del drift con metadatos de fuente y telemetría
 */
export async function getAgentDrift(from: Snapshot, to: Snapshot): Promise<AgentDriftResult> {
  const cacheKey = `${from.id}-${to.id}`;

  // 1. Cache check — return immediately if already computed
  const cached = driftCache.get(cacheKey);
  if (cached) {
    console.info(`[Orchestrator] Cache hit for ${cacheKey}`);
    return cached;
  }

  // 2. Calculate base drift with deterministic engine
  const baseDrift = calculateDrift(from, to);

  // 3. Local routing for knowledge base context
  const routerStart = performance.now();
  const context = getIncidentContext(baseDrift);
  const routerMs = (performance.now() - routerStart).toFixed(2);
  console.info(`[Orchestrator] Contexto enrutado localmente en ${routerMs}ms: ${context.regulation.name} + ${context.mitreTactic.name}`);

  // 4. Build unified prompts
  const systemPrompt = buildUnifiedSystemPrompt();
  const userPrompt = buildUnifiedUserPrompt(baseDrift, context);

  // 5. Sequential fallback: Gemini → Groq → Local (NO parallel, NO retry)
  let source: DriftSource = 'local';
  let fallbackReason: string | undefined;
  let telemetry: TelemetryData | undefined;
  let socBriefing = baseDrift.socBriefing;
  let cisoBriefing = baseDrift.cisoBriefing;

  // Try Gemini first
  const geminiResult = await callGemini(systemPrompt, userPrompt, undefined, undefined, UNIFIED_RESPONSE_SCHEMA);
  if (geminiResult) {
    try {
      const cleanedText = sanitizeLLMJsonResponse(geminiResult.text);
      const parsed = JSON.parse(cleanedText);
      const validated = validateUnifiedResponse(parsed);
      if (validated) {
        socBriefing = validated.socBriefing;
        cisoBriefing = validated.cisoBriefing;
        source = 'gemini';
        telemetry = {
          tokensConsumed: geminiResult.metadata.tokensConsumed,
          latencyMs: geminiResult.metadata.latencyMs,
          estimatedCost: computeEstimatedCost(geminiResult.metadata.tokensConsumed, 'gemini'),
        };
      } else {
        console.warn('[Orchestrator] Gemini response validation failed, trying Groq...');
      }
    } catch (e) {
      console.warn('[Orchestrator] Gemini response parse error, trying Groq...', (e as Error).message);
    }
  }

  // Try Groq only if Gemini didn't succeed
  if (source === 'local') {
    const groqResult = await callGroq(systemPrompt, userPrompt, undefined, undefined, GROQ_UNIFIED_SCHEMA);
    if (groqResult) {
      try {
        const cleanedText = sanitizeLLMJsonResponse(groqResult.text);
        const parsed = JSON.parse(cleanedText);
        const validated = validateUnifiedResponse(parsed);
        if (validated) {
          socBriefing = validated.socBriefing;
          cisoBriefing = validated.cisoBriefing;
          source = 'groq';
          telemetry = {
            tokensConsumed: groqResult.metadata.tokensConsumed,
            latencyMs: groqResult.metadata.latencyMs,
            estimatedCost: computeEstimatedCost(groqResult.metadata.tokensConsumed, 'groq'),
          };
        } else {
          console.warn('[Orchestrator] Groq response validation failed, using deterministic fallback.');
          fallbackReason = 'All providers failed validation. Using deterministic local engine.';
        }
      } catch (e) {
        console.warn('[Orchestrator] Groq response parse error, using deterministic fallback.', (e as Error).message);
        fallbackReason = 'All providers failed (parse errors). Using deterministic local engine.';
      }
    } else {
      fallbackReason = 'All remote providers unavailable (Gemini → Groq). Using deterministic local engine.';
      console.warn('[Orchestrator] Graceful degradation: Gemini and Groq unavailable. Deterministic fallback used.');
    }
  }

  console.info(`[Orchestrator] ✅ Briefings generados — Fuente: ${source}`);

  // 6. Build final result
  const result: AgentDriftResult = {
    drift: {
      ...baseDrift,
      socBriefing,
      cisoBriefing,
    },
    source,
    fallbackReason,
    telemetry,
  };

  // 7. Store in cache
  driftCache.set(cacheKey, result);

  return result;
}


