# Implementation Plan: BusinessHeader

## Overview

Implementación del componente presentacional `BusinessHeader` para el dashboard de DriftBrief. El componente renderiza un banner con tres métricas de impacto de negocio: tiempo de triage, riesgo financiero por severidad y badges regulatorios. La implementación sigue un enfoque incremental: primero la estructura e interfaces, luego cada sección del componente, estilos y finalmente la integración en `App.tsx`.

## Tasks

- [x] 1. Crear la interfaz BusinessHeaderProps y la estructura base del componente
  - [x] 1.1 Crear el archivo `src/components/BusinessHeader.tsx` con la interfaz exportada `BusinessHeaderProps` tipada estrictamente (sin `any`), con JSDoc en cada propiedad, y el esqueleto del componente funcional que retorna el contenedor `<section>` con `role="banner"`
    - Definir las props: `automatedTimeSeconds: number | null | undefined`, `manualTimeSeconds: number | null | undefined`, `severity: SeverityLevel`, `financialExposureUsd: number | null | undefined`, `regulations: Regulation[]`
    - Importar los tipos `SeverityLevel` y `Regulation` desde `src/types/index.ts`
    - El contenedor debe tener la clase `business-header` y el atributo `role="banner"`
    - Exportar el componente como named export
    - _Requisitos: 1.4, 1.6, 6.1, 6.4, 6.5_

  - [x] 1.2 Crear el archivo `src/components/BusinessHeader.css` con los estilos base del contenedor y la estructura flexbox de tres columnas, utilizando exclusivamente design tokens de `src/styles/tokens.css`
    - Incluir estilos para `.business-header`, `.business-header__metric`, `.business-header__label`, `.business-header__value`
    - Usar `var(--color-surface)`, `var(--color-border-subtle)`, `var(--color-text-primary)`, `var(--color-text-muted)`
    - Cada `.business-header__metric` debe tener `flex: 1` para distribución equitativa
    - _Requisitos: 1.2, 1.3_

- [x] 2. Implementar las funciones auxiliares internas y las secciones del componente
  - [x] 2.1 Implementar la función interna `formatTime(seconds: number): string` que convierte segundos a formato legible (`"{N}s"` si < 60, `"{Math.round(N/60)}m"` si >= 60) y la sección `TriageTimeBadge` dentro de `BusinessHeader`
    - Si `automatedTimeSeconds` o `manualTimeSeconds` es `null`, `undefined` o `<= 0`, la sección retorna `null`
    - Incluir emoji ⏱️ como prefijo
    - Aplicar la clase `business-header__automated` al valor automatizado (color `var(--color-drift)`)
    - Patrón de texto: `"{tiempoAutomatizado} vs {tiempoManual} manual"`
    - _Requisitos: 4.1, 4.2, 4.3, 4.4_

  - [x] 2.2 Implementar la función interna `severityToClassName(severity: SeverityLevel): string` y la sección `FinancialRiskIndicator` dentro de `BusinessHeader`
    - `critical` → clase `financial-risk--critical`, `high` → clase `financial-risk--high`, otros → cadena vacía
    - Si `financialExposureUsd` es `null` o `undefined`, renderizar placeholder "—"
    - Si severity es `critical` o `high`, incluir `aria-label` con formato `"Riesgo financiero: severidad {severity}"`
    - Mostrar el valor monetario formateado (ej. `$150k/hr`)
    - _Requisitos: 1.5, 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 6.2_

  - [x] 2.3 Implementar la función interna `getApplicableRegulations(regulations: Regulation[]): Regulation[]` y la sección `RegulatorySLABadge` dentro de `BusinessHeader`
    - Filtrar regulaciones con `notificationDeadlineHours` distinto de `null`
    - Ordenar por `notificationDeadlineHours` ascendente (más urgente primero)
    - Si no hay regulaciones aplicables, la sección retorna `null`
    - Cada badge muestra el formato `"{name} Alert SLA: {notificationDeadlineHours}h"`
    - Aplicar la clase `business-header__badge` con fondo `var(--color-decision)`
    - _Requisitos: 2.3, 2.4, 5.1, 5.2, 5.3, 5.4_

  - [ ]* 2.4 Escribir tests de propiedad para `formatTime` y valores inválidos de tiempo
    - **Propiedad 1: Formato de tiempo respeta el umbral de 60 segundos**
    - **Propiedad 2: Valores de tiempo inválidos producen renderizado nulo**
    - **Valida: Requisitos 4.1, 4.4**
    - Archivo: `src/components/__tests__/BusinessHeader.property.test.tsx`
    - Usar generadores `fc.integer({ min: 1, max: 86400 })` para positivos y `fc.oneof(fc.constant(0), fc.integer({min:-10000, max:0}), fc.constant(null), fc.constant(undefined))` para inválidos

  - [ ]* 2.5 Escribir tests de propiedad para resiliencia ante props ausentes
    - **Propiedad 3: Resiliencia ante props ausentes**
    - **Valida: Requisitos 1.5, 6.2**
    - Archivo: `src/components/__tests__/BusinessHeader.property.test.tsx`
    - Verificar que el componente renderiza placeholder "—" y no lanza excepciones cuando `financialExposureUsd` es null/undefined

- [x] 3. Checkpoint - Verificar compilación y renderizado base
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Completar estilos condicionales por severidad y tests de badges regulatorios
  - [x] 4.1 Añadir al archivo `BusinessHeader.css` los estilos condicionales para `financial-risk--critical` (borde izquierdo 4px `var(--color-critical)`, fondo rgba rojo 12%) y `financial-risk--high` (borde izquierdo 4px `var(--color-probable)`, fondo rgba naranja 12%)
    - Incluir estilos para `.business-header__badge` con fondo `var(--color-decision)` y texto oscuro para contraste 4.5:1
    - Incluir estilos para `.business-header__automated` con color `var(--color-drift)`
    - _Requisitos: 3.1, 3.2, 3.3, 4.2, 5.4_

  - [ ]* 4.2 Escribir tests de propiedad para badges regulatorios
    - **Propiedad 4: Formato de badge regulatorio**
    - **Propiedad 5: Filtrado y orden de badges regulatorios por urgencia**
    - **Valida: Requisitos 2.3, 5.1, 5.2**
    - Archivo: `src/components/__tests__/BusinessHeader.property.test.tsx`
    - Usar generadores de `Regulation` con deadline válido y con deadline null

  - [ ]* 4.3 Escribir tests de propiedad para accesibilidad (role y aria-label)
    - **Propiedad 6: Atributo role="banner" siempre presente**
    - **Propiedad 7: aria-label de severidad para niveles críticos**
    - **Valida: Requisitos 1.6, 3.5**
    - Archivo: `src/components/__tests__/BusinessHeader.property.test.tsx`
    - Verificar que `role="banner"` está presente para cualquier combinación de props
    - Verificar que `aria-label` contiene el nombre del nivel solo para `critical` y `high`

- [x] 5. Integración en App.tsx y tests unitarios
  - [x] 5.1 Integrar el componente `BusinessHeader` en `src/App.tsx`, insertándolo entre `<Header />` y `<main>`, pasando las props derivadas del estado actual (`toSnapshot.severity`, regulaciones aplicables, tiempos de triage y exposición financiera)
    - Importar `BusinessHeader` desde `./components/BusinessHeader`
    - Derivar `financialExposureUsd` a partir de la severidad del snapshot destino
    - Pasar regulaciones desde los datos disponibles en la aplicación
    - Definir valores de demostración para `automatedTimeSeconds` y `manualTimeSeconds`
    - _Requisitos: 1.1, 2.1_

  - [ ]* 5.2 Escribir tests unitarios para `BusinessHeader` en `src/components/__tests__/BusinessHeader.test.tsx`
    - Verificar mapeo severidad → valor monetario: critical=$150k/hr, high=$50k/hr, medium=$10k/hr, low=$0/hr
    - Verificar clases CSS aplicadas para cada nivel de severidad
    - Verificar emoji ⏱️ presente en TriageTimeBadge
    - Verificar que array vacío de regulaciones no renderiza badges
    - Verificar que cambio de severidad actualiza estilos
    - _Requisitos: 2.2, 3.1, 3.2, 3.3, 4.2, 5.3, 6.3_

- [x] 6. Checkpoint final - Validar integración completa
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido
- Cada tarea referencia requisitos específicos para trazabilidad
- Los checkpoints aseguran validación incremental
- Los tests de propiedad validan las 7 propiedades de correctitud definidas en el documento de diseño usando fast-check
- Los tests unitarios validan ejemplos específicos y casos borde
- Todo el texto dinámico se renderiza mediante interpolación JSX estándar (sin `dangerouslySetInnerHTML`)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 2, "tasks": ["2.4", "2.5", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "5.1"] },
    { "id": 4, "tasks": ["5.2"] }
  ]
}
```
