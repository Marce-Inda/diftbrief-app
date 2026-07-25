# Requirements Document

## Introduction

This specification defines the refactoring of DriftBrief's AI orchestration layer (`src/services/agentService.ts`). The current Multi-Agent RAG architecture executes two parallel LLM calls (SOC + CISO agents), each with its own fallback chain (Gemini → Groq → OpenRouter → Local), resulting in 4-6 concurrent API calls, frequent HTTP 429 rate-limit errors, and duplicate context transmission. The refactored architecture consolidates the orchestration into a single-pass LLM call per drift calculation, adds in-memory caching by transition key, and simplifies the fallback chain to eliminate retry storms — reducing API consumption by at least 50% while maintaining full type compatibility with existing consumers.

## Glossary

- **Orchestrator**: The refactored `agentService.ts` module responsible for coordinating drift calculation, LLM invocation, caching, and fallback logic.
- **Single_Pass_Call**: A single LLM API request that produces both SOC and CISO briefings in one unified JSON response, replacing the current parallel dual-agent pattern.
- **Transition_Key**: A string identifier formed as `"${fromSnapshotId}-${toSnapshotId}"` that uniquely identifies a drift calculation between two snapshots.
- **Drift_Cache**: An in-memory `Map<string, AgentDriftResult>` that stores successful drift results keyed by Transition_Key for the duration of the browser session.
- **Fallback_Chain**: The ordered sequence of providers attempted for a drift calculation: Gemini → Groq → Deterministic_Local_Engine, with zero retries per provider.
- **Deterministic_Local_Engine**: The `calculateDrift` function in `src/services/driftComparator.ts` that always produces a valid deterministic result without external API calls.
- **Unified_Response_Schema**: The JSON structure `{ socBriefing: string, cisoBriefing: string }` that the Single_Pass_Call must produce.
- **AgentDriftResult**: The existing TypeScript interface `{ drift: Drift, source: DriftSource, fallbackReason?: string, telemetry?: TelemetryData }` consumed by `useAgentDrift.ts`.
- **Rate_Limit_Error**: An HTTP 429 response from an LLM provider indicating the request quota has been exceeded.
- **Provider**: An external LLM API service (Gemini or Groq) used in the Fallback_Chain.

## Requirements

### Requirement 1: Single-Pass Unified Prompting

**User Story:** As a developer, I want the Orchestrator to make a single LLM call per drift calculation instead of parallel calls per role, so that API consumption is reduced by at least 50% and rate-limit errors are minimized.

#### Acceptance Criteria

1. WHEN a drift calculation is requested, THE Orchestrator SHALL make exactly one LLM API call that produces a Unified_Response_Schema containing both `socBriefing` and `cisoBriefing` fields.
2. THE Single_Pass_Call SHALL include both SOC context (MITRE tactics, playbook steps, IOC data) and CISO context (regulation name, penalties, notification deadlines) within a single system instruction.
3. THE Unified_Response_Schema SHALL enforce a structured JSON output with required fields `socBriefing` (string) and `cisoBriefing` (string), rejecting responses that lack either field.
4. WHEN the LLM response fails JSON validation against the Unified_Response_Schema, THE Orchestrator SHALL discard the response and proceed to the next provider in the Fallback_Chain.
5. THE Orchestrator SHALL NOT make separate parallel LLM calls for SOC and CISO agents.

### Requirement 2: In-Memory Transition Cache

**User Story:** As a developer, I want drift results to be cached by Transition_Key, so that repeated queries for the same snapshot pair return instantly without consuming API quota.

#### Acceptance Criteria

1. THE Orchestrator SHALL maintain a Drift_Cache implemented as a `Map<string, AgentDriftResult>` keyed by Transition_Key.
2. WHEN `getAgentDrift` is called with a Transition_Key that exists in the Drift_Cache, THE Orchestrator SHALL return the cached AgentDriftResult immediately without making any LLM API calls.
3. WHEN `getAgentDrift` is called with a Transition_Key that does not exist in the Drift_Cache, THE Orchestrator SHALL proceed with the Fallback_Chain and store the successful AgentDriftResult in the Drift_Cache before returning.
4. THE Drift_Cache SHALL persist for the lifetime of the browser session (a full page reload clears the cache).
5. THE Drift_Cache SHALL store only successful results (responses that passed validation); failed or fallback-only results from the Deterministic_Local_Engine SHALL NOT be cached when source is `'local'` due to all providers failing.

### Requirement 3: Simplified Fallback Chain Without Retries

**User Story:** As a developer, I want the fallback chain to degrade gracefully on errors without retry storms, so that the UI never blocks waiting on failing providers and the deterministic engine always guarantees a result.

#### Acceptance Criteria

1. THE Orchestrator SHALL attempt the Single_Pass_Call in the following order: Gemini, then Groq, then the Deterministic_Local_Engine.
2. WHEN Gemini responds with a Rate_Limit_Error or any non-2xx HTTP status, THE Orchestrator SHALL immediately attempt Groq without retrying Gemini.
3. WHEN Groq responds with a Rate_Limit_Error or any non-2xx HTTP status, THE Orchestrator SHALL immediately fall back to the Deterministic_Local_Engine without retrying Groq.
4. THE Orchestrator SHALL NOT perform more than one attempt per Provider (zero retries per provider).
5. THE Deterministic_Local_Engine SHALL always produce a valid AgentDriftResult (100% availability guarantee).
6. WHEN the Deterministic_Local_Engine is used as fallback, THE Orchestrator SHALL set `source` to `'local'` and populate `fallbackReason` with a description of which providers failed.
7. THE Fallback_Chain SHALL NOT include OpenRouter as a provider (simplification from the current 4-provider chain to 3 providers including local).

### Requirement 4: Type Compatibility and Build Verification

**User Story:** As a developer, I want the refactored Orchestrator to maintain full type compatibility with the existing `useAgentDrift` hook and all consumers, so that no breaking changes are introduced to the application.

#### Acceptance Criteria

1. THE refactored `getAgentDrift` function SHALL maintain the same function signature: `(from: Snapshot, to: Snapshot) => Promise<AgentDriftResult>`.
2. THE `AgentDriftResult` interface SHALL remain unchanged: `{ drift: Drift, source: DriftSource, fallbackReason?: string, telemetry?: TelemetryData }`.
3. THE `DriftSource` type SHALL be updated to remove `'openrouter'` and retain only `'gemini' | 'groq' | 'local'`.
4. THE refactored code SHALL compile with `npm run build` producing zero TypeScript errors.
5. THE existing test suite SHALL pass after refactoring when executed with `npm run test`.

### Requirement 5: Telemetry Preservation

**User Story:** As a developer, I want the refactored Orchestrator to continue reporting telemetry data (latency, tokens consumed, estimated cost) from the single LLM call, so that the TelemetryPanel component continues functioning correctly.

#### Acceptance Criteria

1. WHEN a successful LLM response is received from a Provider, THE Orchestrator SHALL populate the `telemetry` field of AgentDriftResult with `latencyMs`, `tokensConsumed`, and `estimatedCost`.
2. WHEN the Deterministic_Local_Engine is used as fallback, THE Orchestrator SHALL set `telemetry` to `undefined`.
3. THE `telemetry.latencyMs` field SHALL reflect the round-trip time of the single LLM call (not cumulative across fallback attempts).
4. THE `telemetry.estimatedCost` field SHALL be calculated based on the Provider that successfully responded, using per-token cost constants.

### Requirement 6: Security and Environment Variable Handling

**User Story:** As a developer, I want the refactored Orchestrator to follow DriftBrief's security rules for API key management and error sanitization, so that no secrets are exposed in logs or source code.

#### Acceptance Criteria

1. THE Orchestrator SHALL access API keys exclusively through `import.meta.env.VITE_GEMINI_API_KEY` and `import.meta.env.VITE_GROQ_API_KEY`.
2. THE Orchestrator SHALL NOT hardcode any API keys, tokens, or credentials in the source code.
3. WHEN logging errors or fallback reasons, THE Orchestrator SHALL sanitize messages using the existing `sanitizeErrorMessage` function to remove sensitive data.
4. IF an API key environment variable is empty or undefined, THEN THE Orchestrator SHALL skip that Provider and proceed to the next in the Fallback_Chain without throwing an error.
