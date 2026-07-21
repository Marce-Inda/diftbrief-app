# Design - Role Content Filtering

## Approach

The fix requires conditional rendering in `App.tsx` based on the `activeRole` state, plus a new `ImpactCard` component for the CISO view, and optional `role` prop on `DriftBanner` for headline framing.

## Component Changes

### 1. `src/components/DriftBanner.tsx`
- Add optional `role: UserRole` prop
- When role is 'soc': prefix headline with technical framing
- When role is 'ciso': prefix headline with executive/strategic framing

### 2. New: `src/components/ImpactCard.tsx`
- Displays severity change (from → to) with justification
- Visual styling similar to DecisionCard but with drift/institutional theme
- Props: `severityChange: SeverityChange`

### 3. `src/App.tsx`
- Wrap SOC-specific content in a conditional block (`activeRole === 'soc'`)
- Wrap CISO-specific content in a conditional block (`activeRole === 'ciso'`)
- Add CSS class for fade transition on the role-content container

### 4. `src/App.css`
- Add `.app__role-content` container with CSS transition (opacity fade)
- Add key-based re-render or CSS class toggle for animation

## Content Distribution by Role

| Section | SOC | CISO |
|---------|-----|------|
| DriftBanner (technical) | ✓ | |
| DriftBanner (executive) | | ✓ |
| Nuevos IOCs Detectados | ✓ | |
| Nuevos Hechos Confirmados | ✓ | |
| Giros de Confianza | ✓ | |
| Decisión Urgente | | ✓ |
| Impacto Institucional | | ✓ |
| Acciones Recomendadas | filtered by role | filtered by role |
| BriefExportPanel | SOC briefing | CISO briefing |
