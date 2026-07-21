# Tasks - Role Content Filtering

## Task 1: Update DriftBanner to accept role prop
- [x] Add optional `role?: UserRole` prop to DriftBanner component
- [x] When role is 'soc', display headline with technical framing (e.g., "RESUMEN TÉCNICO" prefix/subheading)
- [x] When role is 'ciso', display headline with executive framing (e.g., "RESUMEN EJECUTIVO" prefix/subheading)
- [x] Add JSDoc for the new prop
- [x] Maintain backward compatibility (prop is optional, defaults to current behavior)

## Task 2: Create ImpactCard component for CISO view
- [x] Create `src/components/ImpactCard.tsx` component
- [x] Props: `severityChange: SeverityChange` from types
- [x] Display severity level transition (from → to) with visual indicators
- [x] Show justification text
- [x] Style with decision-required amber/institutional theme using existing CSS tokens
- [x] Add JSDoc documentation

## Task 3: Update App.tsx with role-based conditional rendering
- [x] Wrap SOC-specific sections (IOCs, Hechos Confirmados, Giros de Confianza) in `activeRole === 'soc'` conditional
- [x] Wrap CISO-specific sections (DecisionCard, new ImpactCard) in `activeRole === 'ciso'` conditional
- [x] Pass `activeRole` prop to DriftBanner
- [x] Import and render ImpactCard in CISO view with `drift.severityChange`
- [x] Keep ComparisonPanel visible in both views (shared context)
- [x] Ensure filteredActions and BriefExportPanel continue working correctly (already role-aware)

## Task 4: Add CSS fade transition for role content switching
- [x] Add `.app__role-content` wrapper class in App.css
- [x] Implement CSS opacity transition (0.3s ease) for smooth content switching
- [x] Use key prop or CSS class toggle to trigger animation on role change
- [x] Ensure no layout shift during transition

## Task 5: Verify build compiles without errors
- [x] Run `npm run build` and confirm zero TypeScript errors
- [x] Verify no `any` types were introduced
- [x] Confirm all exported functions have JSDoc
