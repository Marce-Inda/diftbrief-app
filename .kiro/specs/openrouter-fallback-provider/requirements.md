# Requirements Document

## Introduction

Integrar OpenRouter como tercer escalón en la cadena de resiliencia de los Agentes Redactores de DriftBrief. La cadena completa será: Gemini → Groq → OpenRouter → Motor Determinista Local. OpenRouter utiliza un modelo gratuito (meta-llama/llama-3.1-8b-instruct:free) con formato de API compatible con OpenAI, proporcionando una capa adicional de redundancia antes de recurrir al motor determinista local.

## Glossary

- **Agent_Service**: Servicio principal en `src/services/agentService.ts` que orquesta la cadena de fallback de proveedores LLM para generar briefings.
- **OpenRouter_Provider**: Proveedor de API LLM accesible en `https://openrouter.ai/api/v1/chat/completions` con formato compatible con OpenAI.
- **Fallback_Chain**: Secuencia ordenada de proveedores LLM que se intenta en cascada cuando el proveedor anterior falla: Gemini → Groq → OpenRouter → Motor Determinista Local.
- **DriftSource**: Tipo discriminado que identifica qué proveedor generó la respuesta final del agente.
- **Telemetry_System**: Sistema de captura de metadatos (latencia, tokens consumidos, costo estimado) de las llamadas a proveedores LLM.
- **Motor_Determinista_Local**: Último recurso de fallback que genera briefings usando lógica determinista sin depender de APIs externas.

## Requirements

### Requirement 1: OpenRouter API Call Implementation

**User Story:** As a developer, I want the Agent_Service to have a dedicated function for calling OpenRouter, so that the system can leverage an additional free LLM provider before falling back to the deterministic engine.

#### Acceptance Criteria

1. WHEN the Agent_Service invokes the OpenRouter_Provider, THE Agent_Service SHALL send a POST request to `https://openrouter.ai/api/v1/chat/completions` with the model `meta-llama/llama-3.1-8b-instruct:free`, a messages array containing system and user roles, and a temperature of 0.0.
2. WHEN the Agent_Service invokes the OpenRouter_Provider, THE Agent_Service SHALL include the following HTTP headers: `Authorization: Bearer ${apiKey}`, `Content-Type: application/json`, `HTTP-Referer: https://driftbrief-app.vercel.app`, and `X-Title: DriftBrief`.
3. IF the environment variable `VITE_OPENROUTER_API_KEY` is undefined, null, or an empty string, THEN THE Agent_Service SHALL skip the OpenRouter_Provider without sending a network request and proceed to the next fallback in the chain.
4. IF the OpenRouter_Provider returns an HTTP status code outside the 200-299 range, or the request does not complete within 10 seconds, THEN THE Agent_Service SHALL log a warning message to the console identifying the failure reason and return null to trigger the next fallback.
5. WHEN the OpenRouter_Provider returns an HTTP 2xx response with a non-empty `choices[0].message.content` field, THE Agent_Service SHALL extract and return the text content from that field as the provider result.
6. IF the OpenRouter_Provider returns an HTTP 2xx response but `choices[0].message.content` is missing, null, or empty, THEN THE Agent_Service SHALL treat the response as a failure, log a warning, and return null to trigger the next fallback.
7. WHEN the OpenRouter_Provider response contains a numeric value in `usage.total_tokens`, THE Agent_Service SHALL store the value in the telemetry metadata object associated with the current LLM call result.
8. THE Agent_Service SHALL position the OpenRouter_Provider in the fallback chain after Groq and before the deterministic local engine, resulting in the order: Gemini → Groq → OpenRouter → Local.

### Requirement 2: Fallback Chain Extension

**User Story:** As a system operator, I want the fallback chain to include OpenRouter between Groq and the local engine, so that the system has maximum resilience before resorting to deterministic output.

#### Acceptance Criteria

1. WHEN Gemini fails or is unavailable (HTTP non-2xx response, request timeout exceeding 10 seconds, or missing API key), THE Agent_Service SHALL attempt Groq as the second provider.
2. WHEN Groq fails or is unavailable (HTTP non-2xx response, request timeout exceeding 10 seconds, or missing API key), THE Agent_Service SHALL attempt OpenRouter_Provider as the third provider.
3. WHEN OpenRouter_Provider fails or is unavailable (HTTP non-2xx response, request timeout exceeding 10 seconds, or missing API key), THE Agent_Service SHALL fall back to the Motor_Determinista_Local.
4. THE Agent_Service SHALL preserve the existing behavior where the callWriterLLM function returns null only when all remote providers (Gemini, Groq, OpenRouter) have failed.
5. WHEN OpenRouter_Provider succeeds in the tool-calling flow, THE Agent_Service SHALL handle function call responses following the same ReAct loop pattern used for Groq (OpenAI-compatible format) with a maximum of 2 iterations (one initial call plus one follow-up after tool execution).
6. IF the OpenRouter API key environment variable is not configured, THEN THE Agent_Service SHALL skip OpenRouter_Provider without error and proceed directly to Motor_Determinista_Local as the next fallback.

### Requirement 3: DriftSource Type Extension

**User Story:** As a developer, I want the DriftSource type to include 'openrouter' as a valid value, so that telemetry and UI can correctly identify when OpenRouter served the response.

#### Acceptance Criteria

1. THE DriftSource type SHALL include 'openrouter' as a valid literal value alongside 'gemini', 'groq', and 'local'.
2. WHEN at least one writer agent (SOC or CISO) receives a successful response from the OpenRouter provider, THE Agent_Service SHALL report `source: 'openrouter'` in the AgentDriftResult and populate the `telemetry` field with the corresponding latency, token count, and estimated cost.
3. WHEN the orchestrator determines the active source from multiple successful writer responses, THE Agent_Service SHALL select the highest-priority source in order: 'gemini' > 'groq' > 'openrouter' > 'local'.
4. IF Gemini, Groq, and OpenRouter all fail or are unavailable, THEN THE Agent_Service SHALL fall back to the local deterministic engine, report `source: 'local'`, and set `fallbackReason` to a message indicating that all remote providers were unavailable.

### Requirement 4: Telemetry Integration

**User Story:** As a system operator, I want the Telemetry_System to recognize and display 'openrouter' as a valid source, so that I can monitor which provider served each response.

#### Acceptance Criteria

1. WHEN OpenRouter_Provider serves a response, THE Telemetry_System SHALL record the latency as an integer in milliseconds measured from request start to response completion and display it in the telemetry panel.
2. WHEN OpenRouter_Provider reports token usage in the response metadata, THE Telemetry_System SHALL sum the reported token count (integer, 0 to 999,999) into the aggregate tokensConsumed field displayed in the telemetry panel.
3. THE Telemetry_System SHALL compute estimated cost for OpenRouter responses using a cost-per-token constant of 0 USD, resulting in an estimatedCost of 0.0000 USD.
4. WHEN the fallback chain degrades to OpenRouter, THE Agent_Service SHALL include a fallbackReason (max 300 characters) stating that Gemini and Groq failed and OpenRouter was used as the serving provider.
5. WHEN OpenRouter_Provider serves a response, THE Telemetry_System SHALL display 'openrouter' as the source label in the telemetry panel so the operator can identify which provider generated the response.
6. IF OpenRouter_Provider does not include token usage in the response metadata, THEN THE Telemetry_System SHALL display a null placeholder for tokensConsumed and estimatedCost while still recording and displaying the latency.

### Requirement 5: Environment Configuration

**User Story:** As a developer setting up the project, I want clear documentation of the OpenRouter API key variable, so that I can configure the provider without confusion.

#### Acceptance Criteria

1. THE `.env.example` file SHALL declare `VITE_OPENROUTER_API_KEY=` with a preceding comment line that states the variable's purpose (OpenRouter provider key) and that it is optional with fallback to the local deterministic engine.
2. THE Agent_Service SHALL read the OpenRouter API key exclusively from `import.meta.env.VITE_OPENROUTER_API_KEY` and SHALL NOT read it from any other source such as `process.env`, hardcoded strings, or alternative variable names.
3. IF the `VITE_OPENROUTER_API_KEY` variable is absent, empty, or contains only whitespace, THEN THE Agent_Service SHALL skip OpenRouter provider initialization without throwing errors, without logging the variable's value or any portion of the key, and SHALL continue operating using the remaining providers in the fallback chain (Gemini → Groq → local deterministic engine).
4. IF the `VITE_OPENROUTER_API_KEY` variable is present and non-empty, THEN THE Agent_Service SHALL include OpenRouter as an available provider in the LLM fallback chain and SHALL use the key value to authenticate requests to the OpenRouter API.

### Requirement 6: Error Handling and Defensive Parsing

**User Story:** As a system operator, I want OpenRouter errors to be handled defensively, so that malformed responses or network failures never crash the application.

#### Acceptance Criteria

1. IF the OpenRouter_Provider returns a response body that cannot be parsed as valid JSON (e.g., HTML error page, truncated payload, or syntax error), THEN THE Agent_Service SHALL log a sanitized warning via the `sanitizeErrorMessage` function and return null.
2. IF the OpenRouter_Provider returns a JSON response where the `choices` array is empty, the `choices` array is absent, or `choices[0].message.content` is null or undefined, THEN THE Agent_Service SHALL treat the response as a failure and return null.
3. THE Agent_Service SHALL apply the existing `sanitizeErrorMessage` function to all error messages originating from OpenRouter_Provider interactions (including HTTP error descriptions, JSON parse errors, and network failure messages) before logging them via `console.warn`.
4. WHEN the OpenRouter_Provider request exceeds the 10-second timeout, THE Agent_Service SHALL abort the request using AbortSignal.timeout(10000) and return null to trigger the next fallback in the Fallback_Chain.
5. IF the OpenRouter_Provider request fails due to a network-level error (DNS resolution failure, connection refused, or connection reset), THEN THE Agent_Service SHALL log a sanitized warning and return null without throwing an unhandled exception.
