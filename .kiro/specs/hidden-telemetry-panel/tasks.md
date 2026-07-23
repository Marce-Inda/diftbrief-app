# Implementation Plan: Hidden Telemetry Panel

## Overview

Implement a dual-gate debug panel that displays AI telemetry metrics (tokens consumed, API latency, estimated cost) for developers. The panel is protected by an environment variable gate (`VITE_SHOW_TELEMETRY=true`) and a keyboard shortcut toggle (`Ctrl+Shift+D` / `Cmd+Shift+D`). The implementation uses a custom hook for toggle logic, a lazy-loaded panel component, and extends the existing agent service to capture telemetry metadata.

## Tasks

- [x] 1. Define types and extend data models
  - [x] 1.1 Add TelemetryData interface and extend AgentDriftResult
    - Add `TelemetryData` interface to `src/types/index.ts` with fields: `tokensConsumed: number | null`, `latencyMs: number | null`, `estimatedCost: number | null`
    - Add optional `telemetry?: TelemetryData` field to `AgentDriftResult` in `src/services/agentService.ts`
    - _Requirements: 4.1, 4.5_

- [x] 2. Implement useTelemetryToggle hook
  - [x] 2.1 Create useTelemetryToggle hook module
    - Create `src/hooks/useTelemetryToggle.ts`
    - Export `UseTelemetryToggleResult` interface with `isVisible: boolean`
    - Implement dual-gate logic: read `import.meta.env.VITE_SHOW_TELEMETRY` on mount, only enable if value is exactly `"true"` (case-sensitive)
    - If disabled, return `{ isVisible: false }` without registering any listener
    - If enabled, initialize `isVisible` state to `false`, detect macOS via `navigator.userAgent`, register `document` keydown listener for `Ctrl+Shift+D` (Windows/Linux) or `Cmd+Shift+D` (macOS)
    - Toggle `isVisible` on valid key combination, call `event.preventDefault()`
    - Clean up listener on unmount
    - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.4, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 2.2 Write property test: Strict Environment Gate Validation
    - **Property 1: Strict Environment Gate Validation**
    - **Validates: Requirements 1.1, 1.2, 2.3, 4.2, 5.4, 5.5**
    - Create `src/hooks/__tests__/useTelemetryToggle.property.test.ts`
    - Generate arbitrary strings with `fc.oneof(fc.constant("true"), fc.constant("True"), fc.constant("TRUE"), fc.constant("1"), fc.constant(""), fc.constant(undefined), fc.string())`
    - Assert only `"true"` enables the system (registers listener, allows toggle)

  - [x] 2.3 Write property test: Keyboard Event Discrimination
    - **Property 2: Keyboard Event Discrimination**
    - **Validates: Requirements 2.1, 2.2, 2.4**
    - Generate random KeyboardEvent-like objects with `fc.record({ key: fc.string(), shiftKey: fc.boolean(), ctrlKey: fc.boolean(), metaKey: fc.boolean() })` and a platform boolean
    - Assert only the correct combination (key="d" case-insensitive + shiftKey + platform modifier) triggers toggle

  - [x] 2.4 Write property test: Toggle Alternation Sequence
    - **Property 3: Toggle Alternation Sequence**
    - **Validates: Requirements 5.2, 2.1, 2.2**
    - Generate `fc.nat({ max: 50 })` for press count
    - Assert final `isVisible` state equals `N % 2 === 1`

  - [x] 2.5 Write property test: Visibility State Independence
    - **Property 4: Visibility State Independence**
    - **Validates: Requirements 3.3**
    - Generate sequences of role/transition changes via `fc.array(fc.oneof(...))`
    - Assert visibility state remains unchanged after external app state mutations

  - [x] 2.6 Write unit tests for useTelemetryToggle
    - Create `src/hooks/__tests__/useTelemetryToggle.test.ts`
    - Test: hook initializes `isVisible` to `false` when gate is enabled
    - Test: hook registers `keydown` listener on mount, removes on unmount
    - Test: hook does NOT register listener when gate is disabled
    - Test: no localStorage/sessionStorage reads on mount
    - _Requirements: 2.5, 3.1, 3.4, 5.3, 5.5_

- [x] 3. Implement TelemetryPanel component
  - [x] 3.1 Create TelemetryPanel component
    - Create `src/components/TelemetryPanel.tsx`
    - Accept `TelemetryPanelProps` with `data: TelemetryData`
    - Render tokens consumed (integer), latency (ms), estimated cost (up to 4 decimal places)
    - Render placeholder `—` for `null` values
    - Style as a fixed overlay at bottom-right using existing design tokens (surface-elevated background, drift color for headers)
    - Export as named export for lazy loading
    - _Requirements: 4.1, 4.5_

  - [x] 3.2 Write property test: Telemetry Data Rendering Completeness
    - **Property 5: Telemetry Data Rendering Completeness**
    - **Validates: Requirements 4.1, 4.5**
    - Generate `TelemetryData` with `fc.record({ tokensConsumed: fc.option(fc.nat()), latencyMs: fc.option(fc.nat()), estimatedCost: fc.option(fc.float()) })`
    - Assert correct formatting for non-null values and placeholder indicators for null values

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Wire telemetry data through agent service and hooks
  - [x] 5.1 Capture telemetry metadata in agentService
    - In `src/services/agentService.ts`, capture response timing (latency) and extract token usage from Gemini/Groq API responses
    - Compute `estimatedCost` based on token count and model pricing
    - Include `telemetry` field in `AgentDriftResult` returned by `getAgentDrift`
    - Set `telemetry` to `undefined` when using local deterministic fallback
    - _Requirements: 4.1, 4.5, 6.1_

  - [x] 5.2 Extend useAgentDrift hook to forward telemetry
    - Update `UseAgentDriftResult` interface in `src/hooks/useAgentDrift.ts` to include `telemetry?: TelemetryData`
    - Forward the `telemetry` field from `AgentDriftResult` to the hook's return value
    - _Requirements: 4.1_

- [x] 6. Integrate in App.tsx
  - [x] 6.1 Wire useTelemetryToggle and TelemetryPanel in App.tsx
    - Import `useTelemetryToggle` from `./hooks/useTelemetryToggle`
    - Lazy-load `TelemetryPanel` with `React.lazy()`
    - Call `useTelemetryToggle()` inside App component
    - Read `import.meta.env.VITE_SHOW_TELEMETRY === 'true'` as build-time gate
    - Implement dual-gate conditional rendering: only render `TelemetryPanel` when both env gate AND `isVisible` are true
    - Pass `telemetry` data from `useAgentDrift` result to the panel
    - Wrap in `<Suspense fallback={null}>` for lazy loading
    - _Requirements: 1.2, 2.1, 2.2, 3.2, 4.1, 4.2, 4.3, 4.4, 4.6_

- [x] 7. Update environment configuration
  - [x] 7.1 Update .env.example with VITE_SHOW_TELEMETRY documentation
    - Add `VITE_SHOW_TELEMETRY=` entry to `.env.example`
    - Include comment stating: the variable name, its accepted value (`true`), and that the telemetry panel is disabled by default when omitted
    - Verify `.gitignore` excludes `.env`, `.env.local`, and `.env.*.local`
    - _Requirements: 1.3, 6.2_

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The design uses TypeScript (React + Vite) as the implementation language
- All existing project conventions (JSDoc, PascalCase components, camelCase functions) must be followed

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "7.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "3.2"] },
    { "id": 3, "tasks": ["5.1"] },
    { "id": 4, "tasks": ["5.2"] },
    { "id": 5, "tasks": ["6.1"] }
  ]
}
```
