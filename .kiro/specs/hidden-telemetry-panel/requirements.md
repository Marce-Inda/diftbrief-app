# Requirements Document

## Introduction

El panel de telemetría de DriftBrief muestra información de depuración interna (tokens consumidos, latencia de las APIs de IA y costos estimados) que resulta útil para desarrolladores pero irrelevante y potencialmente confusa para los usuarios finales (SOC y CISO). Esta feature implementa un mecanismo de Debug Panel Oculto que combina una variable de entorno como gate de habilitación y un atajo de teclado como toggle de visibilidad, garantizando que la información de telemetría permanezca oculta por defecto en la interfaz principal.

## Glossary

- **Telemetry_Panel**: Componente de UI que renderiza métricas internas de depuración (tokens consumidos, latencia de API y costos estimados de las llamadas al agente IA).
- **Environment_Gate**: Variable de entorno `VITE_SHOW_TELEMETRY` que actúa como condición necesaria para habilitar la posibilidad de mostrar el Telemetry_Panel.
- **Keyboard_Shortcut**: Combinación de teclas `Ctrl + Shift + D` (Windows/Linux) o `Cmd + Shift + D` (macOS) que actúa como toggle de visibilidad del Telemetry_Panel.
- **Visibility_State**: Estado booleano interno que controla si el Telemetry_Panel se renderiza en el DOM. Comienza en `false` al cargar la página.
- **useTelemetryToggle**: Custom hook de React que encapsula la lógica del event listener global para el Keyboard_Shortcut y expone el Visibility_State.
- **SOC_User**: Analista del Security Operations Center que utiliza DriftBrief para respuesta operativa a incidentes.
- **CISO_User**: Chief Information Security Officer que utiliza DriftBrief para toma de decisiones ejecutivas.

## Requirements

### Requirement 1: Environment Variable Configuration

**User Story:** As a developer, I want to configure telemetry panel availability through an environment variable, so that I can completely disable the debug panel in production deployments without code changes.

#### Acceptance Criteria

1. THE Environment_Gate SHALL use the key `VITE_SHOW_TELEMETRY` and accept only the case-sensitive string value `"true"` (lowercase) as the enabling value; any other string including `"True"`, `"TRUE"`, or `"1"` SHALL be treated as disabling.
2. IF the Environment_Gate is absent or set to any value other than `"true"`, THEN THE Telemetry_Panel component SHALL not be rendered in the DOM and the Keyboard_Shortcut SHALL produce no observable effect.
3. THE Environment_Gate SHALL be documented in the `.env.example` file with a comment stating: the variable name, its accepted value (`true`), and that the telemetry panel is disabled by default when the variable is omitted.
4. THE Environment_Gate SHALL be accessed exclusively through `import.meta.env.VITE_SHOW_TELEMETRY` following the Vite environment variable convention, ensuring the value is resolved statically at build time.

### Requirement 2: Keyboard Shortcut Toggle

**User Story:** As a developer, I want to toggle telemetry panel visibility with a keyboard shortcut, so that I can quickly inspect AI performance metrics during development without modifying code or environment variables.

#### Acceptance Criteria

1. WHEN the Environment_Gate is set to `true` AND the user presses `Ctrl + Shift + D` on Windows or Linux, THE useTelemetryToggle hook SHALL toggle the Visibility_State between `true` and `false`.
2. WHEN the Environment_Gate is set to `true` AND the user presses `Cmd + Shift + D` on macOS, THE useTelemetryToggle hook SHALL toggle the Visibility_State between `true` and `false`.
3. IF the Environment_Gate value is not the string `"true"` (including when it is `undefined`, empty, or any other value), THEN THE useTelemetryToggle hook SHALL not register any keyboard event listeners and SHALL maintain the Visibility_State as `false`.
4. THE useTelemetryToggle hook SHALL detect the operating system platform using `navigator.userAgent`, listen for the appropriate modifier key (`metaKey` for macOS, `ctrlKey` for Windows and Linux), and remove all registered `keydown` event listeners when the hook unmounts.
5. WHEN the useTelemetryToggle hook mounts, THE useTelemetryToggle hook SHALL initialize the Visibility_State to `false`.

### Requirement 3: Default Hidden State on Page Load

**User Story:** As a SOC_User or CISO_User, I want the telemetry panel to be hidden by default when the application loads, so that I only see information relevant to incident response without distraction.

#### Acceptance Criteria

1. WHEN the application mounts on any fresh page load or browser refresh, THE Visibility_State SHALL initialize to `false` regardless of the Environment_Gate value.
2. WHILE the Visibility_State is `false`, THE Telemetry_Panel SHALL not be rendered in the DOM.
3. WHEN the user selects a different snapshot transition (e.g., A→B to B→C) or toggles between SOC_User and CISO_User roles, THE Visibility_State SHALL retain its current value without resetting.
4. WHEN the user refreshes the page or closes and reopens the browser tab, THE Visibility_State SHALL initialize to `false` without reading any persisted value from localStorage or sessionStorage.

### Requirement 4: Conditional Rendering of Telemetry Panel

**User Story:** As a developer, I want the telemetry panel to render only when both conditions are met (environment variable enabled AND keyboard toggle activated), so that there is a dual-gate mechanism preventing accidental exposure of debug information to end users.

#### Acceptance Criteria

1. WHEN the Environment_Gate is set to `true` AND the Visibility_State transitions from `false` to `true`, THE Telemetry_Panel SHALL render within the application layout displaying: tokens consumed (integer count), API latency (in milliseconds), and estimated cost (numeric value with up to 4 decimal places).
2. IF the Environment_Gate is not set to `true`, THEN THE Telemetry_Panel SHALL not render regardless of the Visibility_State value.
3. WHILE the Visibility_State is `false`, THE Telemetry_Panel SHALL not render even if the Environment_Gate is set to `true`.
4. WHEN the application initializes, THE Telemetry_Panel SHALL default the Visibility_State to `false`, requiring explicit keyboard toggle activation before rendering.
5. IF telemetry data from the agentService is unavailable or incomplete, THEN THE Telemetry_Panel SHALL display a placeholder indicator for each missing metric rather than rendering stale or empty values.
6. IF the Environment_Gate value changes between builds, THEN THE Telemetry_Panel availability SHALL reflect the new value on the next application build without requiring additional configuration beyond setting the VITE_SHOW_TELEMETRY environment variable.

### Requirement 5: Custom Hook Implementation

**User Story:** As a developer, I want a reusable custom hook that encapsulates the telemetry toggle logic, so that the visibility behavior is decoupled from the UI components and testable in isolation.

#### Acceptance Criteria

1. THE useTelemetryToggle hook SHALL be implemented as a standalone module in `src/hooks/useTelemetryToggle.ts`.
2. THE useTelemetryToggle hook SHALL return an object containing a boolean property named `isVisible` that initializes to `false` on mount and toggles between `true` and `false` each time the designated key combination is activated.
3. WHEN the component mounts, THE useTelemetryToggle hook SHALL register a global `keydown` event listener on the `document` object that responds to the key combination Ctrl+Shift+D (on Windows/Linux) or Cmd+Shift+D (on macOS), and SHALL remove the listener when the component unmounts to prevent memory leaks.
4. THE useTelemetryToggle hook SHALL read the `VITE_SHOW_TELEMETRY` environment variable via `import.meta.env.VITE_SHOW_TELEMETRY` once during initialization, treating the string value `"true"` (case-sensitive) as enabled and any other value or absence as disabled, and SHALL retain this result for the lifetime of the component without re-reading the variable.
5. IF the Environment_Gate is disabled, THEN THE useTelemetryToggle hook SHALL not register the `keydown` event listener and SHALL return `isVisible` as `false` for the entire component lifetime regardless of key presses.

### Requirement 6: Security and Information Exposure Prevention

**User Story:** As a CISO_User, I want assurance that internal telemetry data cannot be accidentally exposed through the UI in production, so that sensitive operational metrics remain confidential.

#### Acceptance Criteria

1. WHEN the Environment_Gate is absent from the runtime environment, THE application SHALL not render any Telemetry_Panel DOM elements, not register any Keyboard_Shortcut event listeners, and not output any telemetry data (tokens, latency, or cost) to the browser console via any method (log, warn, error, debug, or info).
2. THE `.env`, `.env.local`, and `.env.*.local` files containing the Environment_Gate value SHALL remain excluded from version control via entries in the `.gitignore` file.
3. IF the Environment_Gate is not set to `true`, THEN THE Telemetry_Panel SHALL not output tokens, latency, or cost data to the browser console via any console method (log, warn, error, debug, or info).
4. IF a production build is generated without the Environment_Gate set to `true`, THEN THE application bundle SHALL not expose any telemetry-related UI entry points discoverable through the Keyboard_Shortcut.
