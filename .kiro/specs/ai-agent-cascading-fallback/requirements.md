# Requirements Document

## Introduction

This feature implements a high-resilience AI enrichment service for DriftBrief with a double cascading fallback strategy (Gemini → Groq → Local Deterministic Engine). The service enhances the existing deterministic drift analysis by generating natural-language analytical texts in Spanish for SOC and CISO briefings, while guaranteeing zero interruptions through graceful degradation to the local engine when AI providers are unavailable.

## Glossary

- **Agent_Service**: The AI enrichment service module (`src/services/agentService.ts`) that orchestrates the cascading fallback logic
- **Gemini_Provider**: Google Gemini API integration (model `gemini-2.0-flash`) accessed via the `@google/genai` SDK, serving as the primary AI provider
- **Groq_Provider**: Groq API integration (model `llama-3.3-70b-versatile`) accessed via REST fetch to the OpenAI-compatible endpoint, serving as the secondary AI fallback
- **Deterministic_Engine**: The existing local drift comparator (`src/services/driftComparator.ts`) that computes structured `Drift` objects without external dependencies
- **Drift**: The structured output interface containing all drift analysis data including briefings, severity changes, IOCs, and recommended actions
- **Cascading_Fallback**: The resilience pattern where failure at one provider level triggers automatic, silent transition to the next provider level
- **Enrichment**: The process of replacing deterministic text fields (`socBriefing`, `cisoBriefing`, `urgentDecision.description`) with AI-generated natural-language analytical content in Spanish
- **Base_Drift**: The `Drift` object produced by the Deterministic_Engine before AI enrichment

## Requirements

### Requirement 1: AI Enrichment Orchestration

**User Story:** As a SOC analyst or CISO, I want the drift briefings to contain natural-language AI-generated analytical text in Spanish, so that I receive contextually richer and more actionable intelligence.

#### Acceptance Criteria

1. WHEN the user selects a snapshot transition, THE Agent_Service SHALL invoke `enrichDriftWithAI(previousSnapshot, currentSnapshot, baseDrift)` to attempt AI enrichment of the Base_Drift
2. THE Agent_Service SHALL enrich only the `socBriefing` (string), `cisoBriefing` (string), and `urgentDecision.description` (string) fields of the Drift object, generating structured Markdown content with section headers and bullet points
3. THE Agent_Service SHALL return an object that strictly conforms to the existing `Drift` interface without modifications, preserving all non-enriched fields from the Base_Drift unchanged
4. THE Agent_Service SHALL generate all AI-enriched text content in Spanish

### Requirement 2: Primary Provider - Gemini

**User Story:** As a system operator, I want Gemini to serve as the primary AI provider, so that the system leverages the most capable available model for briefing generation.

#### Acceptance Criteria

1. WHEN the Gemini API key is configured in `VITE_GEMINI_API_KEY` AND the Gemini_Provider responds within 6 seconds with valid JSON, THE Agent_Service SHALL use the Gemini response to enrich the drift briefings
2. THE Gemini_Provider SHALL use the `@google/genai` SDK with model `gemini-2.0-flash`
3. THE Gemini_Provider SHALL enforce a network timeout of 6 seconds for each request
4. THE Gemini_Provider SHALL read the API key exclusively from `import.meta.env.VITE_GEMINI_API_KEY`

### Requirement 3: Secondary Provider - Groq Fallback

**User Story:** As a system operator, I want Groq to serve as a secondary AI fallback, so that the system maintains AI enrichment capability when Gemini is unavailable.

#### Acceptance Criteria

1. WHEN the Gemini_Provider fails, times out, returns invalid JSON, or has no API key configured, THE Agent_Service SHALL silently attempt enrichment via the Groq_Provider
2. WHEN the Groq API key is configured in `VITE_GROQ_API_KEY` AND the Groq_Provider responds within 5 seconds with valid JSON, THE Agent_Service SHALL use the Groq response to enrich the drift briefings
3. THE Groq_Provider SHALL use the REST API via `fetch` to the Groq OpenAI-compatible endpoint with model `llama-3.3-70b-versatile`
4. THE Groq_Provider SHALL enforce a network timeout of 5 seconds for each request
5. THE Groq_Provider SHALL read the API key exclusively from `import.meta.env.VITE_GROQ_API_KEY`

### Requirement 4: Safe Fallback - Deterministic Engine

**User Story:** As an end user, I want the application to always display complete drift analysis without errors, so that my workflow is never interrupted by AI provider failures.

#### Acceptance Criteria

1. WHEN both the Gemini_Provider and the Groq_Provider fail, time out, return invalid JSON, or have no API keys configured, THE Agent_Service SHALL return the Base_Drift object unmodified
2. THE Agent_Service SHALL produce zero user-visible errors, error popups, or unhandled exceptions during the cascading fallback process
3. THE Agent_Service SHALL log provider failures silently without exposing API keys, PII, or secrets in log messages

### Requirement 5: Response Validation

**User Story:** As a developer, I want AI responses to be validated before acceptance, so that malformed LLM output never corrupts the application state.

#### Acceptance Criteria

1. WHEN the Gemini_Provider returns a response, THE Agent_Service SHALL validate the parsed JSON against the Drift interface structure before accepting the enrichment
2. WHEN the Groq_Provider returns a response, THE Agent_Service SHALL validate the parsed JSON against the Drift interface structure before accepting the enrichment
3. IF a provider response fails JSON parsing or structural validation, THEN THE Agent_Service SHALL treat the response as a provider failure and proceed to the next fallback level

### Requirement 6: Loading State UI

**User Story:** As an end user, I want to see a loading indicator while AI enrichment is in progress, so that I understand the system is processing and not frozen.

#### Acceptance Criteria

1. WHILE the Agent_Service is resolving the cascading fallback, THE App SHALL display a skeleton loading indicator with the message "Analizando telemetría y redactando briefings con IA..."
2. WHEN the Agent_Service resolves (with AI enrichment or fallback), THE App SHALL replace the loading indicator with the enriched drift content

### Requirement 7: Security and Configuration

**User Story:** As a security-conscious developer, I want API keys managed exclusively through environment variables with no secrets in source code, so that credentials are never exposed.

#### Acceptance Criteria

1. THE Agent_Service SHALL read API keys exclusively from environment variables prefixed with `VITE_` accessed via `import.meta.env`
2. THE Agent_Service SHALL contain zero hardcoded API keys, tokens, or secrets in source code
3. THE Agent_Service SHALL avoid logging API keys, tokens, or request/response bodies containing sensitive data to the console in production builds
4. WHEN the `.env` or `.env.local` files exist, THE project `.gitignore` SHALL exclude them from version control
