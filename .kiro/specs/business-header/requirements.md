# Requirements Document

## Introduction

El componente `BusinessHeader` es un banner visual de métricas de impacto de negocio que se ubica en la parte superior del dashboard principal de DriftBrief (entre el Header existente y el IncidentCard). Su propósito es comunicar de forma inmediata al usuario el valor operativo de la herramienta: reducción de tiempo de triage, riesgo financiero estimado por hora según severidad, y cumplimiento regulatorio (SLAs de notificación NIS2/GDPR). El componente es estrictamente presentacional y recibe todos sus datos vía props, sin mutar estado ni interactuar con servicios backend.

## Glossary

- **BusinessHeader**: Componente React funcional (`src/components/BusinessHeader.tsx`) que renderiza un banner con métricas de impacto de negocio.
- **Drift**: Objeto que representa los cambios calculados entre dos Snapshots consecutivos de un incidente.
- **Snapshot**: Captura del estado de un incidente en un punto en el tiempo, incluyendo severidad, hechos e IOCs.
- **SeverityLevel**: Tipo unión de TypeScript con valores `'low' | 'medium' | 'high' | 'critical'` que indica la gravedad del incidente.
- **Regulation**: Interfaz TypeScript que describe un marco regulatorio (NIS2, GDPR, etc.) con campos de jurisdicción y `notificationDeadlineHours`.
- **Financial_Risk_Indicator**: Sección del BusinessHeader que muestra el riesgo financiero estimado por hora según la severidad actual.
- **Triage_Time_Badge**: Sección del BusinessHeader que muestra la reducción del tiempo de triage comparando la velocidad automatizada vs manual.
- **Regulatory_SLA_Badge**: Sección del BusinessHeader que muestra una alerta visual con el tiempo límite de notificación según la regulación detectada.
- **Design_Tokens**: Variables CSS definidas en `src/styles/tokens.css` que controlan la paleta de colores y espaciado del design system.

## Requirements

### Requerimiento 1: Renderizado del Banner BusinessHeader

**User Story:** Como analista SOC o ejecutivo CISO, quiero ver un banner de métricas de impacto de negocio al inicio del dashboard, para comprender inmediatamente el valor operativo y el contexto financiero/regulatorio del incidente activo.

#### Criterios de Aceptación

1. THE BusinessHeader SHALL renderizarse como un banner horizontal de ancho completo en la parte superior del contenido principal del dashboard, posicionado entre el componente Header y el componente IncidentCard dentro del elemento `<main>`.
2. THE BusinessHeader SHALL utilizar los Design_Tokens del proyecto: fondo `var(--color-surface)`, bordes `var(--color-border-subtle)`, texto principal `var(--color-text-primary)` y acento cian `var(--color-drift)`.
3. THE BusinessHeader SHALL mostrar tres secciones de métricas distribuidas horizontalmente con igual proporción de espacio, visibles simultáneamente sin necesidad de scroll: Triage_Time_Badge (mostrando un valor numérico en minutos representando el tiempo medio de triage), Financial_Risk_Indicator (mostrando un valor monetario formateado en USD representando la exposición financiera estimada) y Regulatory_SLA_Badge (mostrando un valor numérico en horas representando el tiempo restante para cumplimiento regulatorio de notificación).
4. THE BusinessHeader SHALL ser un componente puramente presentacional que reciba los datos de las tres métricas a través de props tipadas en TypeScript (triageTimeMinutes: number, financialExposureUsd: number, regulatorySlaHours: number), sin gestionar estado interno mutable ni realizar llamadas a servicios externos.
5. IF alguna de las props de métricas es null o undefined, THEN THE BusinessHeader SHALL renderizar un indicador de texto placeholder con el contenido "--" en la posición de la métrica ausente, sin generar errores de renderizado.
6. THE BusinessHeader SHALL aplicar el atributo `role="banner"` al elemento contenedor y utilizar encabezados o etiquetas descriptivas para cada métrica de forma que sea accesible mediante lectores de pantalla.

### Requerimiento 2: Actualización Dinámica por Selección de Drift/Snapshot

**User Story:** Como analista SOC, quiero que las métricas del banner se actualicen automáticamente cuando selecciono una transición de snapshots diferente, para mantener la información de impacto sincronizada con el contexto actual sin recargar la página.

#### Criterios de Aceptación

1. WHEN el usuario selecciona una transición de snapshots diferente en el SnapshotSelector, THE BusinessHeader SHALL re-renderizar las métricas visuales (Financial_Risk_Indicator y Regulatory_SLA_Badge) con los datos correspondientes a la nueva transición en un máximo de 100ms sin recargar la página completa.
2. WHEN la severidad del Snapshot destino de la transición seleccionada es diferente a la severidad previa, THE Financial_Risk_Indicator SHALL mostrar el valor monetario correspondiente al nuevo SeverityLevel: Critical = `$150k/hr`, High = `$50k/hr`, Medium = `$10k/hr`, Low = `$0/hr`.
3. WHEN las props del BusinessHeader se actualizan con nuevos datos de regulación, THE Regulatory_SLA_Badge SHALL mostrar el nombre de la regulación aplicable y el valor de `notificationDeadlineHours` en formato "[NombreRegulación] Alert SLA: [N]h".
4. IF tras un cambio de transición la lista de regulaciones aplicables está vacía o el campo `notificationDeadlineHours` es nulo, THEN THE Regulatory_SLA_Badge SHALL renderizar un estado neutro sin badge de alerta y sin lanzar errores de ejecución.

### Requerimiento 3: Indicador de Riesgo Financiero con Estilo de Alerta por Severidad

**User Story:** Como ejecutivo CISO, quiero que el indicador de riesgo financiero destaque visualmente cuando la severidad del incidente es crítica o alta, para identificar inmediatamente los escenarios de mayor exposición económica.

#### Criterios de Aceptación

1. WHILE la severidad del incidente es `critical`, THE Financial_Risk_Indicator SHALL aplicar el color `var(--color-critical)` como borde izquierdo de 4px y como color de fondo con opacidad reducida (10%-15%) para indicar alerta máxima.
2. WHILE la severidad del incidente es `high`, THE Financial_Risk_Indicator SHALL aplicar el color `var(--color-probable)` como borde izquierdo de 4px y como color de fondo con opacidad reducida (10%-15%) para indicar alerta elevada.
3. WHILE la severidad del incidente es `medium` o `low`, THE Financial_Risk_Indicator SHALL mostrarse con fondo `var(--color-surface)`, borde `var(--color-border-subtle)` y sin borde de color de énfasis ni fondo con opacidad de alerta.
4. WHEN la prop `severity` del Financial_Risk_Indicator cambia de valor, THE Financial_Risk_Indicator SHALL actualizar su estilo visual al correspondiente nuevo nivel de severidad sin requerir recarga de la página.
5. WHILE la severidad del incidente es `critical` o `high`, THE Financial_Risk_Indicator SHALL incluir un atributo `aria-label` que indique el nivel de severidad actual, de modo que la diferenciación no dependa exclusivamente del color.

### Requerimiento 4: Badge de Tiempo de Triage

**User Story:** Como analista SOC, quiero ver una insignia que muestre la reducción de tiempo de triage comparada con el análisis manual, para apreciar la eficiencia de la herramienta en un vistazo.

#### Criterios de Aceptación

1. THE Triage_Time_Badge SHALL mostrar el tiempo de triage automatizado y el tiempo de análisis manual recibidos como props de tipo numérico (en segundos), formateados como texto legible con unidad (segundos o minutos) en el patrón "{tiempoAutomatizado} vs {tiempoManual} manual" (ejemplo: "12s vs 45m manual"), donde valores menores a 60 segundos se muestran en segundos y valores de 60 o más se convierten a minutos redondeados al entero más cercano.
2. THE Triage_Time_Badge SHALL incluir el emoji ⏱️ como prefijo del texto de la métrica y aplicar el color `var(--color-drift)` al texto del valor de tiempo automatizado para distinguirlo visualmente como indicador de eficiencia.
3. THE Triage_Time_Badge SHALL ser un componente presentacional sin estado interno que recibe los valores de tiempo de triage como props tipadas (`automatedTimeSeconds: number` y `manualTimeSeconds: number`) y renderiza exclusivamente a partir de los valores proporcionados.
4. IF alguna de las props de tiempo (`automatedTimeSeconds` o `manualTimeSeconds`) es menor o igual a cero, indefinida o no proporcionada, THEN THE Triage_Time_Badge SHALL no renderizar contenido visible (retornar `null`).

### Requerimiento 5: Badge Regulatorio (NIS2 / GDPR)

**User Story:** Como ejecutivo CISO, quiero ver una alerta visual cuando una regulación relevante (NIS2, GDPR) aplica al incidente, para estar informado del plazo máximo de notificación obligatoria.

#### Criterios de Aceptación

1. IF una o más regulaciones con `notificationDeadlineHours` distinto de null son detectadas en las props, THEN THE Regulatory_SLA_Badge SHALL renderizar un badge por cada regulación aplicable, mostrando el nombre de la regulación y el tiempo límite de notificación en formato "{name} Alert SLA: {notificationDeadlineHours}h" (ejemplo: "NIS2 Alert SLA: 24h").
2. IF múltiples regulaciones aplican simultáneamente, THEN THE Regulatory_SLA_Badge SHALL mostrar los badges ordenados de menor a mayor `notificationDeadlineHours`, de modo que la regulación con plazo más urgente aparezca primero.
3. IF ninguna regulación aplica (lista vacía o todas las regulaciones tienen `notificationDeadlineHours` nulo), THEN THE Regulatory_SLA_Badge SHALL no renderizar ningún elemento visible en el DOM (componente retorna null).
4. THE Regulatory_SLA_Badge SHALL aplicar `var(--color-decision)` como color de fondo del badge y utilizar texto con contraste mínimo 4.5:1 sobre dicho fondo, de modo que la información no dependa exclusivamente del color.

### Requerimiento 6: Seguridad y Resiliencia del Componente

**User Story:** Como desarrollador del equipo, quiero que el BusinessHeader sea un componente seguro y resiliente, para evitar vulnerabilidades XSS, mutaciones de estado no autorizadas y errores de renderizado con datos incompletos.

#### Criterios de Aceptación

1. THE BusinessHeader SHALL recibir datos exclusivamente vía props tipadas de TypeScript, sin acceder a estado global, contextos mutables ni realizar efectos secundarios (fetch, localStorage, dispatch, suscripciones a eventos externos).
2. IF las props recibidas contienen valores nulos, indefinidos o cadenas vacías para cualquier campo de texto o valor numérico, THEN THE BusinessHeader SHALL renderizar un placeholder visual no interactivo (texto vacío o guion "—") en la posición correspondiente, sin lanzar errores de ejecución ni ocultar el resto del componente.
3. THE BusinessHeader SHALL renderizar todo texto dinámico recibido vía props utilizando exclusivamente interpolación JSX estándar de React, sin utilizar `dangerouslySetInnerHTML`, inyección directa en `innerHTML` ni APIs de manipulación del DOM (`document.createElement`, `insertAdjacentHTML`).
4. THE BusinessHeader SHALL exportar una interfaz TypeScript `BusinessHeaderProps` con tipos estrictos (sin uso de `any`) donde cada propiedad incluya un comentario JSDoc de una línea que describa su propósito.
5. IF el componente BusinessHeader recibe una prop con un valor cuyo tipo no coincide con la interfaz `BusinessHeaderProps`, THEN el compilador TypeScript SHALL reportar un error de tipo en tiempo de compilación, impidiendo la construcción exitosa del proyecto.
