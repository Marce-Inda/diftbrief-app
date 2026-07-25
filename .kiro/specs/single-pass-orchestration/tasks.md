# Implementation Plan

## Overview

Refactor `getAgentDrift()` in `src/services/agentService.ts` from dual parallel LLM calls to a single-pass orchestration with in-memory caching and sequential fallback (Gemini → Groq → Local).

## Tasks

- [ ] 1. Add `UnifiedLLMResponse` interface in `src/services/agentService.ts` with fields `socBriefing: string`, `cisoBriefing: string`, `urgentDecision: string`
- [ ] 2. Add `UNIFIED_RESPONSE_SCHEMA` constant (Gemini format) with type OBJECT, all three STRING properties, required array, and propertyOrdering
- [ ] 3. Add `GROQ_UNIFIED_SCHEMA` constant (Groq json_schema format) with strict mode, all three properties, and additionalProperties: false
- [ ] 4. Add `const driftCache = new Map<string, AgentDriftResult>()` at module level in `agentService.ts`
- [ ] 5. Implement `buildUnifiedSystemPrompt()` combining SOC directives, CISO directives, anti-hallucination guardrails, and structured response instruction
- [ ] 6. Implement `buildUnifiedUserPrompt(drift: Drift, context: RouterContext)` merging drift data, MITRE tactic, regulation, and playbooks into one user message
- [ ] 7. Implement `validateUnifiedResponse(parsed: unknown): UnifiedLLMResponse | null` that checks all three fields are non-empty strings
- [ ] 8. Refactor `getAgentDrift()`: add cache-check at start — return cached result if `driftCache.has(cacheKey)` with key `${from.id}-${to.id}`
- [ ] 9. Refactor `getAgentDrift()`: replace `Promise.all` with sequential single-call — try Gemini with `UNIFIED_RESPONSE_SCHEMA`, then Groq with `GROQ_UNIFIED_SCHEMA`, then deterministic local
- [ ] 10. Extract `socBriefing`, `cisoBriefing`, `urgentDecision` from validated response; fall back to baseDrift values on validation failure
- [ ] 11. Remove OpenRouter from the internal fallback chain (keep `callOpenRouter` exported for backward compatibility)
- [ ] 12. Store result in `driftCache` before returning from `getAgentDrift()`
- [ ] 13. Update `agentService.fallback.test.ts` to remove expectations of parallel calls and OpenRouter usage in fallback chain
- [ ] 14. Update `agentService.react-loop.test.ts` to reflect single-call architecture (no dual writer agents)
- [ ] 15. Write property test (P1): cache round-trip — for any snapshot pair, second call returns same result with zero API calls
  - [ ] 15.1 PBT: Cache round-trip property test
- [ ] 16. Write property test (P2): unified prompt completeness — for any valid Drift+context, output contains drift headline, MITRE ID, regulation name, and response field names
  - [ ] 16.1 PBT: Unified prompt completeness property test
- [ ] 17. Write property test (P3): response validation correctness — returns non-null iff all three fields are non-empty strings
  - [ ] 17.1 PBT: Response validation correctness property test
- [ ] 18. Write property test (P4): sequential fallback with no parallelism — Gemini first, then Groq only if Gemini fails, never concurrent
  - [ ] 18.1 PBT: Sequential fallback property test
- [ ] 19. Write property test (P5): no retry on provider error — exactly one request per failed provider
  - [ ] 19.1 PBT: No retry on error property test
- [ ] 20. Write property test (P6): AgentDriftResult structural invariant — return always contains valid drift with non-empty briefings and valid source
  - [ ] 20.1 PBT: Structural invariant property test
- [ ] 21. Write property test (P7): serialization round-trip — JSON.parse(JSON.stringify(response)) equals original
  - [ ] 21.1 PBT: Serialization round-trip property test
- [ ] 22. Run `npm run build` — verify zero TypeScript errors
- [ ] 23. Run `npm run test` — verify all existing + new tests pass

## Task Dependency Graph

```json
{
  "waves": [
    [1, 2, 3, 4],
    [5, 6, 7],
    [8, 9, 10, 11, 12],
    [13, 14, 15, 16, 17, 18, 19, 20, 21],
    [22, 23]
  ]
}
```

- **Wave 1**: Add types, schemas, and cache (independent of each other)
- **Wave 2**: Build prompt functions and validator (depend on types from wave 1)
- **Wave 3**: Refactor `getAgentDrift` core logic (depends on functions from wave 2)
- **Wave 4**: Update existing tests and write property tests (depends on refactoring from wave 3)
- **Wave 5**: Final build and test verification (depends on all prior waves)

## Notes

- `callOpenRouter` remains exported but is no longer called internally by `getAgentDrift`
- All existing exports (`DriftSource`, `AgentDriftResult`, `GeminiFunctionDeclaration`, `GroqToolDefinition`, `ToolRegistry`, `buildSOCSystemPrompt`, `buildCISOSystemPrompt`, `sanitizeErrorMessage`, `sendOpenRouterFollowUp`) retain their signatures
- Property tests use `fast-check` (already in devDependencies) with minimum 100 iterations
- Tag format: `Feature: single-pass-orchestration, Property {N}: {title}`
