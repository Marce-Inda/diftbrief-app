# Requirements Document

## Introduction

This document specifies the requirements for refactoring DriftBrief's Multi-Agent RAG architecture from a dual parallel LLM call pattern to a single-pass orchestration model. The current `getAgentDrift()` function makes two simultaneous API calls (SOC + CISO briefings) via `Promise.all`, causing HTTP 429 rate limit errors when Gemini and Groq are hit concurrently. The refactoring consolidates both briefings into a single structured API call per drift calculation, adds in-memory caching by transition key, and simplifies the fallback chain to Gemini → Groq → Deterministic Local (removing OpenRouter and retry logic).

## Glossary

- **Orchestrator**: The refactored `getAgentDrift()` function in `src/services/agentService.ts` responsible for coordinating a single LLM call and caching.
- **Unified_Prompt**: A single system prompt that combines SOC and CISO directives with anti-hallucination guardrails, requesting a structured JSON response containing both briefings.
- **Transition_Key**: A string in the format `${fromSnapshotId}-${toSnapshotId}` used as the cache map index.
- **Drift_Cache**: An in-memory `Map<string, AgentDriftResult>` at module level in `agentService.ts` that stores results indexed by Transition_Key.
- **Fallback_Chain**: The sequential provider attempt order: Gemini → Groq → Deterministic Local Engine.
- **Deterministic_Local_Engine**: The `calculateDrift()` function in `driftComparator.ts` that computes drift without any external API call.
- **Structured_Response**: A JSON object with the schema `{ "socBriefing": string, "cisoBriefing": string, "urgentDecision": string }` returned by the LLM in a single call.
- **AgentDriftResult**: The existing interface containing `drift`, `source`, `fallbackReason`, and `telemetry` fields, consumed by the `useAgentDrift` hook.

## Requirements

### Requirement 1: Single-Pass Prompting

**User Story:** As a developer, I want the Orchestrator to make a single LLM API call per drift calculation, so that we avoid rate limiting and reduce token consumption.

#### Acceptance Criteria

1. WHEN `getAgentDrift(from, to)` is called and no cached result exists, THE Orchestrator SHALL make at most one API call to a single LLM provider.
2. THE Unified_Prompt SHALL request a Structured_Response containing `socBriefing`, `cisoBriefing`, and `urgentDecision` fields in a single prompt.
3. THE Unified_Prompt SHALL combine SOC technical directives, CISO executive directives, and anti-hallucination guardrails into one system prompt.
4. WHEN the LLM returns a Structured_Response, THE Orchestrator SHALL validate that the response contains non-empty `socBriefing` and `cisoBriefing` string fields before using them.
5. IF the Structured_Response validation fails, THEN THE Orchestrator SHALL fall through to the next provider in the Fallback_Chain.

### Requirement 2: In-Memory Cache

**User Story:** As a developer, I want drift results to be cached by Transition_Key, so that repeated requests for the same snapshot transition do not consume API quota.

#### Acceptance Criteria

1. THE Drift_Cache SHALL be a module-level `Map<string, AgentDriftResult>` in `agentService.ts` indexed by Transition_Key.
2. WHEN the Drift_Cache contains a result for the requested Transition_Key, THE Orchestrator SHALL return the cached AgentDriftResult immediately without making any API call.
3. WHEN the Drift_Cache does not contain a result for the requested Transition_Key, THE Orchestrator SHALL call the LLM, store the resulting AgentDriftResult in the Drift_Cache, and then return the result.
4. THE cached AgentDriftResult SHALL include the complete `drift`, `source`, `fallbackReason`, and `telemetry` fields.

### Requirement 3: Sequential Fallback Without Retry

**User Story:** As a developer, I want the Fallback_Chain to degrade gracefully without retries, so that 429 errors do not block the UI.

#### Acceptance Criteria

1. THE Orchestrator SHALL attempt providers in the following order: Gemini → Groq → Deterministic_Local_Engine.
2. WHEN a provider responds with HTTP 429 or any error, THE Orchestrator SHALL immediately fall through to the next provider in the Fallback_Chain without retrying the failed provider.
3. WHEN all remote providers (Gemini and Groq) fail, THE Orchestrator SHALL use the Deterministic_Local_Engine as the final fallback and return a valid AgentDriftResult with `source` set to `'local'`.
4. THE Orchestrator SHALL NOT make parallel API calls to multiple providers simultaneously.
5. THE Orchestrator SHALL NOT include OpenRouter in the Fallback_Chain.

### Requirement 4: Type Compatibility and Backward Compatibility

**User Story:** As a developer, I want the refactoring to maintain full type compatibility with existing consumers, so that the `useAgentDrift` hook continues working without modifications.

#### Acceptance Criteria

1. THE Orchestrator SHALL return the same `AgentDriftResult` interface from `getAgentDrift()` as defined in the current codebase.
2. THE refactored code SHALL compile without TypeScript errors when running `npm run build`.
3. THE refactored code SHALL pass all existing tests when running `npm run test`.
4. THE `useAgentDrift` hook SHALL continue calling `getAgentDrift(from, to)` without any signature or return type changes.

### Requirement 5: Structured Response Schema

**User Story:** As a developer, I want a well-defined JSON schema for the unified LLM response, so that both Gemini and Groq can enforce structured output.

#### Acceptance Criteria

1. THE Structured_Response schema SHALL define `socBriefing` as a required string field containing the SOC technical briefing.
2. THE Structured_Response schema SHALL define `cisoBriefing` as a required string field containing the CISO executive briefing.
3. THE Structured_Response schema SHALL define `urgentDecision` as a required string field containing the urgent decision summary.
4. WHEN calling Gemini, THE Orchestrator SHALL use the `responseSchema` parameter to enforce the Structured_Response schema.
5. WHEN calling Groq, THE Orchestrator SHALL use the `json_schema` response format to enforce the Structured_Response schema.
6. FOR ALL valid Drift objects, serializing the Structured_Response to JSON and parsing it back SHALL produce an equivalent object (round-trip property).
