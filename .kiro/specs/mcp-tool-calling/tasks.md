# Implementation Plan: MCP Tool Calling (Phase 4)

## Overview

Implement a ReAct-pattern agentic loop enabling DriftBrief's SOC and CISO writer agents to invoke simulated tools (threat intelligence and regulatory precedents) during briefing generation. The implementation adds a new `src/services/tools.ts` module, modifies `agentService.ts` to support tool definitions and a 2-iteration ReAct loop for both Gemini and Groq providers, and preserves the existing graceful degradation chain.

## Tasks

- [x] 1. Create tool service module with interfaces and simulated functions
  - [x] 1.1 Create `src/services/tools.ts` with `ThreatIntelligenceResult` and `RegulatoryPrecedentResult` interfaces and implement `queryThreatIntelligence` function
    - Export the `ThreatIntelligenceResult` interface with fields: `reputation`, `campaign`, `action_recommended` (all strings)
    - Export the `RegulatoryPrecedentResult` interface with fields: `max_penalty`, `recent_fine_example`, `notification_deadline` (all strings)
    - Implement `queryThreatIntelligence(ioc: string)` with ~500ms simulated delay (`400 + Math.random() * 200`)
    - IOC classification logic: IPv4 regex → firewall action, hex 32/40/64 → endpoint isolation, empty/whitespace → unknown/none/no action, other → unattributed/monitoring
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 1.2 Implement `queryRegulatoryPrecedents` function in `src/services/tools.ts`
    - Implement `queryRegulatoryPrecedents(regulation: string)` with ~500ms simulated delay
    - Recognized set: "GDPR" and "NIS2" (case-insensitive comparison)
    - Return regulation-specific penalty data, fine examples, and notification deadlines for recognized identifiers
    - Return "unavailable" / "no precedent" / "unspecified" responses for unrecognized non-empty strings
    - Return "no regulation specified" responses for empty strings
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x]* 1.3 Write property tests for `queryThreatIntelligence` IOC classification (Property 1)
    - **Property 1: IOC classification correctness**
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6**
    - Install `fast-check` and `vitest` as dev dependencies
    - Create `src/services/__tests__/tools.property.test.ts`
    - Generate arbitrary IPv4 strings, hex strings of 32/40/64 chars, whitespace strings, and other strings
    - Assert field values match IOC type classification rules

  - [x]* 1.4 Write property tests for `queryRegulatoryPrecedents` unrecognized regulation handling (Property 2)
    - **Property 2: Unrecognized regulation returns unavailable response**
    - **Validates: Requirements 2.3**
    - Generate arbitrary strings not in {"GDPR", "NIS2"} and non-empty
    - Assert `max_penalty` indicates unavailable, `recent_fine_example` indicates no precedent, `notification_deadline` indicates unspecified

- [x] 2. Add tool definition constants and interfaces to agent service
  - [x] 2.1 Add TypeScript interfaces for tool definitions in `src/services/agentService.ts`
    - Add `GeminiFunctionDeclaration` interface
    - Add `GroqToolDefinition` interface with `type: 'function'` and nested `function` descriptor
    - Add `ToolRegistry` type: `Record<string, (args: Record<string, string>) => Promise<unknown>>`
    - _Requirements: 3.1, 3.2, 4.1_

  - [x] 2.2 Add tool definition constants for both providers in `src/services/agentService.ts`
    - Define `THREAT_INTEL_GEMINI_DECLARATION` with name, description, and parameter schema (OBJECT type, ioc STRING required)
    - Define `THREAT_INTEL_GROQ_DEFINITION` with `type: "function"` wrapper and nested function descriptor
    - Define `REGULATORY_GEMINI_DECLARATION` with name, description, and parameter schema (OBJECT type, regulation STRING required)
    - Define `REGULATORY_GROQ_DEFINITION` with `type: "function"` wrapper and nested function descriptor
    - _Requirements: 3.3, 4.2_

  - [x]* 2.3 Write property tests for tool registration correctness (Properties 3, 5, 6)
    - **Property 3: SOC tool registration in correct API format**
    - **Property 5: CISO tool registration and prompt instruction**
    - **Property 6: SOC request excludes regulatory tool**
    - **Validates: Requirements 3.1, 3.2, 4.1, 4.3, 4.4**
    - Create `src/services/__tests__/agentService.tool-registration.test.ts`
    - For any valid Drift, verify SOC payload contains `queryThreatIntelligence` and NOT `queryRegulatoryPrecedents`
    - For any valid Drift, verify CISO payload contains `queryRegulatoryPrecedents`

- [x] 3. Modify system prompts and conditional tool instructions
  - [x] 3.1 Modify SOC system prompt to conditionally include tool invocation instruction
    - When `drift.newIOCs.length > 0`, append instruction directing LLM to invoke `queryThreatIntelligence` for IOC indicators
    - When `drift.newIOCs` is empty, do NOT include the tool instruction (but still register tool definition)
    - Create a helper function `buildSOCSystemPrompt(drift: Drift): string` that conditionally appends the tool instruction
    - _Requirements: 3.4, 3.5_

  - [x] 3.2 Modify CISO system prompt to include regulatory tool invocation instruction
    - Append instruction directing LLM to invoke `queryRegulatoryPrecedents` with the applicable regulation identifier
    - Create a helper function `buildCISOSystemPrompt(): string` that appends the tool instruction
    - _Requirements: 4.3_

  - [x]* 3.3 Write property tests for SOC prompt instruction conditionality (Property 4)
    - **Property 4: SOC prompt instruction presence is conditional on IOCs**
    - **Validates: Requirements 3.4, 3.5**
    - Create test cases in `src/services/__tests__/agentService.tool-registration.test.ts`
    - For any Drift with `newIOCs.length > 0`, verify SOC prompt contains tool invocation instruction
    - For any Drift with `newIOCs.length === 0`, verify SOC prompt does NOT contain tool invocation instruction

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement ReAct loop in `callWriterLLM` with provider-specific formats
  - [x] 5.1 Modify `callGemini` to accept optional tool declarations and tool registry
    - Add optional parameters: `toolDeclarations?: GeminiFunctionDeclaration[]`, `toolRegistry?: ToolRegistry`
    - When `toolDeclarations` provided, include `tools: [{ functionDeclarations: toolDeclarations }]` in request body
    - Remove `responseMimeType` and `responseSchema` from `generationConfig` when tools are present (tool calling and structured output are mutually exclusive in Gemini)
    - Detect `functionCall` in response parts and return structured indicator instead of just text
    - _Requirements: 3.1, 5.1, 5.5_

  - [x] 5.2 Modify `callGroq` to accept optional tool definitions and tool registry
    - Add optional parameters: `toolDefinitions?: GroqToolDefinition[]`, `toolRegistry?: ToolRegistry`
    - When `toolDefinitions` provided, include `tools` array in request body and remove `response_format`
    - Detect `tool_calls` in response message and return structured indicator instead of just text
    - _Requirements: 3.2, 5.1, 5.5_

  - [x] 5.3 Implement the ReAct loop logic within `callWriterLLM`
    - Accept optional `toolConfig` parameter with `geminiDeclarations`, `groqDefinitions`, and `registry`
    - Implement max 2 iterations (one initial call + one follow-up after tool execution)
    - On Function_Call response: extract function name and args, execute tool from registry, build Function_Response, send follow-up
    - On text response (no Function_Call): return text directly
    - On unregistered function: construct error Function_Response ("function not available") and send back to LLM
    - On follow-up still returning Function_Call: terminate loop and return null
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.1, 6.2_

  - [x] 5.4 Implement Gemini-specific Function_Response format
    - Build conversation history: user message → model functionCall → function functionResponse
    - Use `role: 'function'` with `parts: [{ functionResponse: { name, response: { result } } }]`
    - Send follow-up request with full `contents` array including `systemInstruction`
    - _Requirements: 5.5_

  - [x] 5.5 Implement Groq-specific Function_Response format
    - Build messages array: system → user → assistant (with tool_calls) → tool (with tool_call_id and content)
    - Use `role: 'tool'` with `tool_call_id` and `content` as JSON string
    - Send follow-up request with full messages array
    - _Requirements: 5.5_

  - [x]* 5.6 Write unit tests for ReAct loop behavior
    - Create `src/services/__tests__/agentService.react-loop.test.ts`
    - Test: loop returns text directly when no Function_Call present (Req 5.2)
    - Test: loop terminates when follow-up still has Function_Call (Req 5.4)
    - Test: max iteration warning logged (Req 6.3)
    - Test: full Gemini ReAct loop with mocked API (Req 5.1, 5.5)
    - Test: full Groq ReAct loop with mocked API (Req 5.5)
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 6.1, 6.3_

- [x] 6. Implement error handling and sanitization
  - [x] 6.1 Implement tool execution error handling within the agentic loop
    - Wrap tool execution in try/catch
    - On exception: construct error Function_Response with `{ error: true, message: "Tool execution failed: <sanitized>" }`
    - Implement sanitization: strip `VITE_*` values, Bearer tokens, Authorization headers, absolute file paths (`/home/`, `/src/`)
    - Truncate error messages to 200 characters
    - Log with `console.error('[AgentService] <toolName>: <sanitized message>')` (no stack traces)
    - Send error Function_Response back to LLM and continue loop
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 6.2 Implement malformed Function_Call handling
    - Detect missing function name, unparseable arguments JSON, or null function call fields
    - On malformed call: try to extract text content from the response parts
    - If no text content available: return null to trigger deterministic fallback
    - Never throw unhandled exceptions from malformed responses
    - Log with `console.warn('[AgentService] Malformed function call, treating as text')`
    - _Requirements: 8.2_

  - [x] 6.3 Handle double failure scenario (tool error + LLM failure on follow-up)
    - If tool throws AND subsequent LLM call fails or returns no text after error Function_Response
    - Return null from `callWriterLLM` so `extractBriefing` uses deterministic fallback
    - _Requirements: 7.4_

  - [x]* 6.4 Write property tests for error sanitization and malformed call handling (Properties 7, 8, 9)
    - **Property 7: Unregistered function produces error Function_Response**
    - **Property 8: Tool error sanitization**
    - **Property 9: Malformed function call graceful handling**
    - **Validates: Requirements 5.3, 7.1, 8.2**
    - Create `src/services/__tests__/agentService.error-handling.test.ts`
    - Generate arbitrary error messages with injected API keys, file paths, Bearer tokens
    - Assert sanitized output contains none of these sensitive patterns
    - Assert malformed function calls never throw unhandled exceptions

- [x] 7. Wire tool calling into orchestrator and add `fallbackReason` field
  - [x] 7.1 Update `getAgentDrift` to pass tool config to SOC and CISO writer agents
    - Build SOC tool config: `queryThreatIntelligence` Gemini/Groq definitions + registry mapping to `tools.ts` function
    - Build CISO tool config: `queryRegulatoryPrecedents` Gemini/Groq definitions + registry mapping to `tools.ts` function
    - Use `buildSOCSystemPrompt(drift)` for SOC calls and `buildCISOSystemPrompt()` for CISO calls
    - Pass tool config as third argument to `callWriterLLM` for both parallel agent calls
    - _Requirements: 3.1, 3.2, 4.1, 9.3_

  - [x] 7.2 Ensure `fallbackReason` is populated when graceful degradation activates
    - Log fallback reason including which provider failed and error category to console
    - Set `fallbackReason` string in `AgentDriftResult` when deterministic fallback is used
    - Verify existing fallback chain (Gemini → Groq → Deterministic) remains intact
    - _Requirements: 8.1, 8.3, 8.4, 8.5_

  - [x]* 7.3 Write property tests for deterministic fallback completeness (Property 10)
    - **Property 10: Deterministic fallback completeness**
    - **Validates: Requirements 8.4**
    - Create `src/services/__tests__/agentService.fallback.test.ts`
    - For any pair of valid Snapshot objects, assert `calculateDrift` returns Drift with `socBriefing.length > 0` and `cisoBriefing.length > 0`

  - [x]* 7.4 Write property tests for JSON-free briefing output (Property 11)
    - **Property 11: Final briefing contains no JSON syntax artifacts**
    - **Validates: Requirements 9.4**
    - Assert validated briefing text contains no `{`, `}`, `[`, `]` or `"key":` patterns

- [x] 8. Final checkpoint - Ensure all tests pass and build succeeds
  - Run `npm run build` to verify TypeScript compilation with zero errors
  - Run `npx vitest --run` to execute all unit and property tests
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses TypeScript with Vite; `fast-check` and `vitest` need to be installed as dev dependencies before running PBT tests
- Tool functions are stateless and purely simulated — no external MCP server dependencies
- The existing fallback chain (Gemini → Groq → Deterministic) must remain intact throughout all modifications

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1"] },
    { "id": 1, "tasks": ["1.3", "1.4", "2.2", "3.1", "3.2"] },
    { "id": 2, "tasks": ["2.3", "3.3"] },
    { "id": 3, "tasks": ["5.1", "5.2"] },
    { "id": 4, "tasks": ["5.3", "5.4", "5.5"] },
    { "id": 5, "tasks": ["5.6", "6.1", "6.2", "6.3"] },
    { "id": 6, "tasks": ["6.4", "7.1", "7.2"] },
    { "id": 7, "tasks": ["7.3", "7.4"] }
  ]
}
```
