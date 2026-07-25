# Requirements Document

## Introduction

The IncidentTimeline component provides a horizontal visual representation of an active cybersecurity incident's progression through snapshots. It connects snapshot nodes with lines, highlights active states, applies severity-based visual effects, and enables user interaction through node clicks. The component is purely presentational and integrates within the DriftBrief dashboard between the incident card and transition selector.

## Glossary

- **IncidentTimeline**: A React presentational component that renders a horizontal timeline of incident snapshots as connected nodes.
- **TimelineNode**: A data object representing a single snapshot point on the timeline, containing an ID, label, time, and severity level.
- **Active_Node**: The currently selected or highlighted node on the timeline, indicated by a distinct visual border/glow.
- **Active_Transition**: The currently selected transition between two snapshots (e.g., A → B), causing both endpoint nodes to be highlighted.
- **Severity_Glow**: A neon shadow/indicator applied to timeline nodes based on their severity level (critical = red `#F85149`, high/medium = orange `#F5A524`).
- **Connector_Line**: A thin horizontal line (`#2A333D` border color) connecting adjacent timeline nodes.
- **Severity_Badge**: A miniature visual indicator within each node showing the severity level.

## Requirements

### Requirement 1: Horizontal Timeline Rendering

**User Story:** As a SOC analyst, I want to see the incident's snapshots displayed as a horizontal connected timeline, so that I can quickly understand the chronological progression of the incident.

#### Acceptance Criteria

1. THE IncidentTimeline SHALL render a horizontal container with TimelineNode elements connected by Connector_Lines.
2. THE IncidentTimeline SHALL render exactly one visual node element for each TimelineNode object in the input array.
3. THE IncidentTimeline SHALL render Connector_Lines between each pair of adjacent nodes using the `--color-border-subtle` design token.
4. WHEN the nodes array is empty, THE IncidentTimeline SHALL render an empty container without errors.

### Requirement 2: Active Node Highlighting

**User Story:** As a SOC analyst, I want the selected snapshot node to be visually highlighted, so that I can see which point in time I am currently examining.

#### Acceptance Criteria

1. WHEN an activeNodeId is provided that matches a node in the array, THE IncidentTimeline SHALL apply a distinct border and elevated box-shadow to that single node using the `--color-drift` token.
2. WHEN an activeTransition is provided, THE IncidentTimeline SHALL highlight both the `from` and `to` nodes with the active visual treatment.
3. WHEN the user clicks on a timeline node, THE IncidentTimeline SHALL invoke the onNodeClick callback with the clicked node's ID.
4. WHEN an activeNodeId is provided that does not match any node, THE IncidentTimeline SHALL render all nodes in their default visual state without errors.

### Requirement 3: Severity-Based Visual Effects

**User Story:** As a SOC analyst, I want critical snapshots to stand out visually with neon glow effects, so that I can immediately identify severity escalation in the incident timeline.

#### Acceptance Criteria

1. WHILE a TimelineNode has severity 'critical', THE IncidentTimeline SHALL display a neon glow effect using color `#F85149` on that node.
2. WHILE a TimelineNode has severity 'high' or 'medium', THE IncidentTimeline SHALL display a neon glow effect using color `#F5A524` on that node.
3. WHILE a TimelineNode has severity 'low', THE IncidentTimeline SHALL render the node without any glow effect.

### Requirement 4: Node Content Display

**User Story:** As a SOC analyst, I want each timeline node to show the snapshot time, state name, and severity indicator, so that I can identify key information without clicking into details.

#### Acceptance Criteria

1. THE IncidentTimeline SHALL display the time string, the label text, and a Severity_Badge for each TimelineNode.
2. THE Severity_Badge SHALL visually represent the severity level using the corresponding functional color from the design tokens.

### Requirement 5: Presentational Architecture

**User Story:** As a developer, I want the IncidentTimeline to be a purely presentational component, so that it remains testable, reusable, and decoupled from application state management.

#### Acceptance Criteria

1. THE IncidentTimeline SHALL receive all display data through props without managing internal application state.
2. THE IncidentTimeline SHALL not call any external services or APIs directly.
3. THE IncidentTimeline SHALL use CSS variables from the design system tokens (`src/styles/tokens.css`) for all colors and spacing.
