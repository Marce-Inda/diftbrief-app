# Implementation Plan: Drift Delta Animations

## Overview

Implementación de micro-animaciones CSS `fadeInUp` para los paneles de drift. Se define un keyframe y clase utilitaria en `App.css`, se aplican `key` props en `App.tsx` para forzar remontaje con animación, y se valida el build.

## Tasks

- [ ] 1. Agregar keyframe fadeInUp y clase drift-animate-in en App.css
  - [ ] 1.1 Definir `@keyframes fadeInUp` y clase `.drift-animate-in` en `src/App.css`
    - Agregar `@keyframes fadeInUp` con `from { opacity: 0; transform: translateY(12px); }` y `to { opacity: 1; transform: translateY(0); }`
    - Agregar `.drift-animate-in { animation: fadeInUp 0.4s ease-out forwards; }`
    - Ubicar junto a los keyframes existentes (`fadeIn`, `smoothTabIn`)
    - _Requirements: 1.1, 1.2, 4.1, 4.2_

- [ ] 2. Agregar key props y clase de animación a paneles de drift en App.tsx
  - [ ] 2.1 Aplicar `key` y `drift-animate-in` a los cuatro paneles de drift en `src/App.tsx`
    - Envolver `<DriftBanner>` en `<div key={activeTransition} className="drift-animate-in">`
    - Agregar `key={activeTransition}` y `className="app__deltas drift-animate-in"` a `<section className="app__deltas">`
    - Envolver `<DecisionCard>` en `<div key={activeTransition} className="drift-animate-in">`
    - Cambiar el Suspense wrapper de `ComparisonPanel` a `key={`${activeTransition}-${activeRole}`}` y agregar clase `drift-animate-in`
    - No modificar props, tipos ni flujo de datos de los componentes existentes
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 5.1, 5.2_

- [ ] 3. Checkpoint — Verificar build y validar integridad
  - [ ] 3.1 Ejecutar `npm run build` y confirmar compilación exitosa
    - Confirmar cero errores de TypeScript tras las adiciones de `key` props y wrappers
    - Verificar que no se introducen warnings nuevos
    - _Requirements: 6.1, 6.2_
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- No se incluyen property tests porque la feature es exclusivamente de UI rendering y animación CSS, sin lógica de negocio testeable con PBT
- Cada tarea referencia requerimientos específicos para trazabilidad
- El checkpoint final valida la integridad del build como gate de calidad

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["3.1"] }
  ]
}
```
