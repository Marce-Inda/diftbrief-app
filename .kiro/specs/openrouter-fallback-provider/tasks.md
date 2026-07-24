# Implementation Plan: OpenRouter Fallback Provider

## Overview

Extend the Agent Service fallback chain from Gemini → Groq → Local to Gemini → Groq → OpenRouter → Local. The implementation mirrors the existing `callGroq` function pattern since both use the OpenAI-compatible API format. Includes `callOpenRouter`, `sendOpenRouterFollowUp`, type extensions, telemetry integration, and comprehensive property-based tests.

## Tasks

- [x] 1. Extend types and constants for OpenRouter
  - [x] 1.1 Add 'openrouter' to DriftSource type and extend ToolConfig interface
    - In `src/types/index.ts`, no changes needed (TelemetryData already generic)
    - In `src/services/agentService.ts`, update `DriftSource` type to include `'openrouter'`
    - Add `openrouterDefinitions: GroqToolDefinition[]` field to the `ToolConfig` interface
    - Add `OPENROUTER_COST_PER_TOKEN = 0` constant alongside existing cost constants
    - _Requirements: 3.1, 4.3_

  - [x] 1.2 Update `computeEstimatedCost` to support OpenRouter source
    - Refactor `computeEstimatedCost` to use a `costMap` record keyed by `DriftSource`
    - Include `openrouter: OPENROUTER_COST_PER_TOKEN` (0) and `local: 0` entries
    - Ensure the function returns `0.0000` for any token count when source is `'openrouter'`
    - _Requirements: 4.3_

  - [x] 1.3 Update `.env.example` with OpenRouter API key variable
    - Add comment line: `# OpenRouter API (optional - third fallback before deterministic local engine)`
    - Add `VITE_OPENROUTER_API_KEY=` below the comment
    - _Requirements: 5.1_

- [x] 2. Implement `callOpenRouter` function
  - [x] 2.1 Create `callOpenRouter` function in `agentService.ts`
    - Read API key from `import.meta.env.VITE_OPENROUTER_API_KEY`
    - Return null immediately if key is undefined, null, empty, or whitespace-only
    - Build request body with model `meta-llama/llama-3.1-8b-instruct:free`, messages array (system + user), temperature 0.0
    - Include optional `tools` array when `toolDefinitions` parameter is provided
    - Send POST to `https://openrouter.ai/api/v1/chat/completions` with headers: Authorization (Bearer), Content-Type, HTTP-Referer (`https://driftbrief-app.vercel.app`), X-Title (`DriftBrief`)
    - Use `AbortSignal.timeout(10000)` for 10-second timeout
    - Parse response JSON defensively (catch non-JSON responses)
    - Extract `choices[0].message.content` — return null if missing/empty
    - Detect `tool_calls` in response and return `__functionCall` JSON (same pattern as Groq)
    - Extract `usage.total_tokens` into metadata (null if non-numeric)
    - Record `latencyMs` from `Date.now()` delta
    - All error paths: log via `sanitizeErrorMessage` + `console.warn`, return null
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 2.2 Write property test: Missing API key skips provider (Property 1)
    - **Property 1: Missing API key skips provider without side effects**
    - Generate arbitrary undefined/null/empty/whitespace keys via fast-check
    - Assert `callOpenRouter` returns null and fetch is never called
    - **Validates: Requirements 1.3, 5.3**

  - [x] 2.3 Write property test: Valid response content extraction (Property 2)
    - **Property 2: Valid response content extraction**
    - Generate arbitrary non-empty strings as `choices[0].message.content`
    - Mock fetch to return 200 with valid response shape
    - Assert the returned text matches exactly the generated content
    - **Validates: Requirements 1.5**

  - [x] 2.4 Write property test: Malformed response yields failure (Property 3)
    - **Property 3: Malformed response structure yields failure**
    - Generate responses with empty choices array, missing content, null content
    - Assert `callOpenRouter` returns null for all variants
    - **Validates: Requirements 1.6, 6.2**

  - [x] 2.5 Write property test: Error resilience (Property 4)
    - **Property 4: Error resilience returns null for all failure modes**
    - Generate arbitrary HTTP error codes (400-599), timeouts, network errors
    - Assert `callOpenRouter` returns null without throwing
    - **Validates: Requirements 1.4, 6.4, 6.5**

  - [x] 2.6 Write property test: Non-JSON response handling (Property 5)
    - **Property 5: Non-JSON response body yields null with sanitized warning**
    - Generate arbitrary non-JSON strings (HTML, truncated text, random bytes)
    - Assert function returns null and logs sanitized warning
    - **Validates: Requirements 6.1**

  - [x] 2.7 Write property test: Token usage extraction (Property 6)
    - **Property 6: Token usage extraction with graceful null handling**
    - Generate responses with numeric `usage.total_tokens` and responses without it
    - Assert metadata contains correct `tokensConsumed` value or null, and valid `latencyMs`
    - **Validates: Requirements 1.7, 4.6**

- [x] 3. Implement `sendOpenRouterFollowUp` function
  - [x] 3.1 Create `sendOpenRouterFollowUp` function in `agentService.ts`
    - Mirror `sendGroqFollowUp` structure but target OpenRouter endpoint
    - Include same headers as `callOpenRouter` (Authorization, Content-Type, HTTP-Referer, X-Title)
    - Build messages array: system, user, assistant (with tool_calls), tool (with tool_call_id and result)
    - Include `tools` array in request body
    - Use `AbortSignal.timeout(10000)` timeout
    - Check if follow-up response also returns tool_calls → return `__functionCall` JSON
    - Extract text from `choices[0].message.content`
    - All errors: sanitized warning + return null
    - _Requirements: 2.5, 6.3, 6.4, 6.5_

  - [x] 3.2 Write property test: ReAct loop bounded iteration (Property 9)
    - **Property 9: ReAct loop terminates within 2 iterations**
    - Mock OpenRouter to always return tool_calls in both initial and follow-up
    - Assert the system terminates and returns null (no infinite loop)
    - **Validates: Requirements 2.5**

- [x] 4. Extend fallback chain and orchestrator
  - [x] 4.1 Extend `handleFunctionCall` to support 'openrouter' provider
    - Update `provider` parameter type to `'gemini' | 'groq' | 'openrouter'`
    - Add `else if (provider === 'openrouter')` branch calling `sendOpenRouterFollowUp`
    - Pass `callId` and `toolConfig.openrouterDefinitions` to the follow-up function
    - _Requirements: 2.5_

  - [x] 4.2 Extend `callWriterLLM` to try OpenRouter after Groq fails
    - After Groq block (both with and without toolConfig), add OpenRouter attempt
    - Without toolConfig: call `callOpenRouter(systemPrompt, userPrompt)`, return with source `'openrouter'` on success
    - With toolConfig: call `callOpenRouter(systemPrompt, userPrompt, toolConfig.openrouterDefinitions, toolConfig.registry)`, handle function call via `handleFunctionCall` with provider `'openrouter'`
    - Return null only when all three remote providers fail
    - _Requirements: 1.8, 2.1, 2.2, 2.3, 2.4, 2.6_

  - [x] 4.3 Update `getAgentDrift` source priority and fallback messages
    - Update source priority logic to include `'openrouter'`: gemini > groq > openrouter > local
    - Update `fallbackReason` messages to include OpenRouter in the chain description
    - When all remote fail: `'All providers failed (Gemini → Groq → OpenRouter): provider_unavailable. Full deterministic fallback used for SOC and CISO agents.'`
    - When OpenRouter serves: include appropriate fallbackReason about Gemini and Groq failing
    - _Requirements: 3.2, 3.3, 3.4, 4.4_

  - [x] 4.4 Add `openrouterDefinitions` to tool configs in `getAgentDrift`
    - Add `openrouterDefinitions` field to `socToolConfig` (same value as `groqDefinitions`: `[THREAT_INTEL_GROQ_DEFINITION]`)
    - Add `openrouterDefinitions` field to `cisoToolConfig` (same value as `groqDefinitions`: `[REGULATORY_GROQ_DEFINITION]`)
    - _Requirements: 2.5_

  - [x] 4.5 Write property test: Source priority ordering (Property 7)
    - **Property 7: Source priority ordering**
    - Generate all combinations of DriftSource values for SOC and CISO agent results
    - Assert the selected source follows priority: gemini > groq > openrouter > local
    - **Validates: Requirements 3.3**

- [x] 5. Checkpoint - Verify build and existing tests
  - Ensure `npm run build` passes with zero TypeScript errors.
  - Ensure all existing tests pass (`npx vitest --run`).
  - Ask the user if questions arise.

- [x] 6. Error handling and sanitization
  - [x] 6.1 Verify `sanitizeErrorMessage` covers OpenRouter error patterns
    - Confirm existing `sanitizeErrorMessage` function handles Bearer tokens, VITE_* values, file paths
    - Add unit test verifying OpenRouter-specific error messages are properly sanitized
    - Verify truncation to 200 characters works for OpenRouter verbose errors
    - _Requirements: 6.3_

  - [x] 6.2 Write property test: Error message sanitization (Property 8)
    - **Property 8: Error messages are sanitized before logging**
    - Generate arbitrary strings containing VITE_* values, Bearer tokens, file paths
    - Assert `sanitizeErrorMessage` redacts all sensitive patterns and truncates to 200 chars
    - **Validates: Requirements 6.3**

- [x] 7. Integration and telemetry wiring
  - [x] 7.1 Update TelemetryPanel to display 'openrouter' source label
    - Ensure the TelemetryPanel component handles `'openrouter'` in source display
    - Verify the label renders correctly alongside existing 'gemini', 'groq', 'local' labels
    - _Requirements: 4.1, 4.2, 4.5, 4.6_

  - [x] 7.2 Write integration tests for the full fallback chain
    - Test Gemini → Groq → OpenRouter → Local fallback sequence with mocked fetch
    - Test OpenRouter skipped when key missing, chain continues to local
    - Test `getAgentDrift` returns correct source and telemetry when OpenRouter serves
    - Test `computeEstimatedCost` returns 0.0000 for openrouter source
    - _Requirements: 1.8, 2.1, 2.2, 2.3, 2.4, 2.6, 3.2, 3.4, 4.3_

- [x] 8. Final checkpoint - Verify complete implementation
  - Ensure all tests pass (`npx vitest --run`).
  - Ensure `npm run build` compiles without errors.
  - Verify no `any` types introduced and all exported functions have JSDoc.
  - Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The `callOpenRouter` function mirrors `callGroq` since both use OpenAI-compatible format
- `openrouterDefinitions` reuses `GroqToolDefinition[]` type (same OpenAI-compatible schema)
- All property tests use `fast-check` (already in project) with minimum 100 iterations

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "3.1"] },
    { "id": 3, "tasks": ["3.2", "4.1"] },
    { "id": 4, "tasks": ["4.2", "4.4"] },
    { "id": 5, "tasks": ["4.3", "4.5"] },
    { "id": 6, "tasks": ["6.1", "7.1"] },
    { "id": 7, "tasks": ["6.2", "7.2"] }
  ]
}
```
