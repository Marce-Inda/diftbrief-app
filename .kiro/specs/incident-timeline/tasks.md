# Implementation Plan: Incident Timeline

## Overview

Implement the `IncidentTimeline` presentational component as a horizontal connected node graph using React + TypeScript with vanilla CSS. The component receives snapshot data as props and renders nodes with severity-based visual effects, active state highlighting, and click interaction. Integration into `App.tsx` below the incident card completes the feature.

## Task Dependency Graph

```
1 → 2 → 3 → 4 → 5
```

## Tasks

- [x] 1. Create TypeScript interfaces for timeline props
  - [x] 1.1 Add `TimelineNode` interface and `IncidentTimelineProps` interface to `src/types/index.ts`
    - Define `TimelineNode` with `id`, `label`, `time`, and `severity` fields
    - Define `IncidentTimelineProps` with `nodes`, `activeNodeId`, `activeTransition`, and `onNodeClick`
    - Add JSDoc documentation to all exported interfaces
    - _Requirements: 4.1, 5.1_

- [x] 2. Implement IncidentTimeline component and styles
  - [x] 2.1 Create `src/components/IncidentTimeline.css` stylesheet
    - Define `.incident-timeline` container with horizontal flexbox layout
    - Define `.incident-timeline__node` with surface background and subtle border
    - Define `.incident-timeline__node--active` with `--color-drift` border and elevated box-shadow
    - Define `.incident-timeline__node--glow-critical` with `#F85149` neon box-shadow
    - Define `.incident-timeline__node--glow-high` and `--glow-medium` with `#F5A524` box-shadow
    - Define `.incident-timeline__connector` as thin line using `--color-border-subtle`
    - Define `.incident-timeline__time`, `__label`, and `__badge` typography styles
    - Use only CSS variables from `src/styles/tokens.css`
    - _Requirements: 1.1, 1.3, 2.1, 3.1, 3.2, 3.3, 5.3_
  - [x] 2.2 Create `src/components/IncidentTimeline.tsx` component
    - Import `IncidentTimelineProps` from `src/types/index.ts`
    - Render horizontal container with nodes mapped from `props.nodes`
    - Render connector lines between adjacent nodes
    - Apply active class when `node.id === activeNodeId` or node participates in `activeTransition`
    - Apply severity glow class based on `node.severity`
    - Display `node.time`, `node.label`, and severity badge in each node
    - Attach `onClick` handler calling `onNodeClick(node.id)`
    - Handle empty nodes array gracefully (render empty container)
    - Add JSDoc to exported component
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 4.1, 4.2, 5.1, 5.2_
  - [ ]* 2.3 Write property tests for IncidentTimeline
    - **Property 1: Node count consistency** — For any array of TimelineNodes, rendered node count equals array length
    - **Property 2: Connector count consistency** — For N nodes, exactly N-1 connectors rendered
    - **Property 3: Active node uniqueness** — For valid activeNodeId, exactly one node has active class
    - **Property 6: Severity glow mapping** — Each node's glow class matches its severity level
    - **Property 7: Node content completeness** — Each node displays time, label, and badge
    - **Validates: Requirements 1.2, 1.3, 2.1, 3.1, 3.2, 3.3, 4.1**

- [x] 3. Checkpoint - Verify component renders correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Integrate IncidentTimeline into App.tsx
  - [x] 4.1 Add IncidentTimeline to the dashboard layout
    - Import `IncidentTimeline` component
    - Map existing snapshot data to `TimelineNode[]` array
    - Position below the "INCIDENTE ACTIVO" card and above the transition selector
    - Wire `activeNodeId` and `activeTransition` from existing app state
    - Wire `onNodeClick` to update active transition state
    - _Requirements: 1.1, 2.1, 2.2, 2.3, 5.1_

- [x] 5. Final checkpoint - Verify build compiles
  - Run `npm run build` and confirm zero TypeScript errors
  - Verify no new compilation warnings
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The component is purely presentational — no service calls or internal state management
- All colors use CSS variables from the existing design token system
- Property tests use `fast-check` with React Testing Library for DOM assertions
- The existing `SeverityLevel` type in `src/types/index.ts` aligns with the TimelineNode severity field
