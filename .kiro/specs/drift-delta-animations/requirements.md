# Documento de Requerimientos — Drift Delta Animations

## Introducción

Esta feature agrega micro-animaciones CSS (`fadeInUp`) a los paneles de resultados de drift en DriftBrief. Cuando el usuario cambia la transición activa (A→B ↔ B→C) mediante el `SnapshotSelector`, o cuando los datos de drift se actualizan, los paneles afectados (`DriftBanner`, sección `.app__deltas`, `DecisionCard` y `ComparisonPanel`) se re-renderizan con una animación suave de entrada tipo "slide-in from below" (12px translateY, 400ms, ease-out). La técnica utiliza el prop `key` de React para forzar el remontaje y re-disparar la animación CSS.

## Glosario

- **Sistema_Animaciones**: Conjunto de reglas CSS y propiedades React (`key` prop) que controlan las animaciones de entrada de los paneles de drift.
- **Panel_Drift**: Cualquiera de los siguientes componentes: `DriftBanner`, sección `.app__deltas` (contenedora de `DeltaCard`s), `DecisionCard` o `ComparisonPanel`.
- **Transición_Activa**: Estado `activeTransition` de tipo `TransitionId` ('A-B' | 'B-C') que indica qué par de snapshots se está comparando.
- **fadeInUp**: Keyframe CSS que anima un elemento desde `opacity: 0; translateY(12px)` hasta `opacity: 1; translateY(0)`.
- **Remontaje**: Proceso por el cual React desmonta y vuelve a montar un componente al cambiar su prop `key`, re-disparando animaciones CSS asociadas.
- **Datos_Drift**: Resultado calculado por el comparador determinista o el agente IA que contiene headline, nuevos hechos, IOCs, giros de confianza y decisión urgente.

## Requerimientos

### Requerimiento 1: Definición del keyframe fadeInUp

**User Story:** Como desarrollador frontend, quiero definir un keyframe CSS `fadeInUp` reutilizable, para que los paneles de drift tengan una animación de entrada consistente y más pronunciada que las existentes.

#### Criterios de Aceptación

1. THE Sistema_Animaciones SHALL define un `@keyframes fadeInUp` con estado inicial `opacity: 0; transform: translateY(12px)` y estado final `opacity: 1; transform: translateY(0)`
2. THE Sistema_Animaciones SHALL ubicar la definición del keyframe `fadeInUp` en el archivo `App.css` junto a los keyframes existentes (`fadeIn`, `smoothTabIn`)

### Requerimiento 2: Aplicación de animación fadeInUp a paneles de drift

**User Story:** Como usuario del dashboard, quiero que los paneles de resultados de drift aparezcan con una animación suave de entrada al cambiar de transición, para percibir visualmente que los datos se han actualizado.

#### Criterios de Aceptación

1. WHEN la Transición_Activa cambia de valor, THE Sistema_Animaciones SHALL aplicar la animación `fadeInUp` con duración de 400ms y timing-function `ease-out` al componente `DriftBanner`
2. WHEN la Transición_Activa cambia de valor, THE Sistema_Animaciones SHALL aplicar la animación `fadeInUp` con duración de 400ms y timing-function `ease-out` a la sección `.app__deltas`
3. WHEN la Transición_Activa cambia de valor, THE Sistema_Animaciones SHALL aplicar la animación `fadeInUp` con duración de 400ms y timing-function `ease-out` al componente `DecisionCard`
4. WHEN la Transición_Activa cambia de valor, THE Sistema_Animaciones SHALL aplicar la animación `fadeInUp` con duración de 400ms y timing-function `ease-out` al componente `ComparisonPanel`

### Requerimiento 3: Re-disparo de animación mediante key prop de React

**User Story:** Como desarrollador frontend, quiero que las animaciones se re-disparen automáticamente al cambiar la transición activa, sin necesidad de lógica imperativa adicional.

#### Criterios de Aceptación

1. THE Sistema_Animaciones SHALL asignar un prop `key` basado en el identificador de Transición_Activa a cada contenedor animado de Panel_Drift
2. WHEN el valor de Transición_Activa cambia, THE Sistema_Animaciones SHALL forzar el Remontaje de los contenedores animados mediante el cambio de `key`, re-disparando la animación CSS `fadeInUp`

### Requerimiento 4: Duración de la animación dentro de rango perceptual óptimo

**User Story:** Como usuario del dashboard, quiero que la transición visual sea lo suficientemente rápida para no sentirse lenta, pero no tan breve que sea imperceptible.

#### Criterios de Aceptación

1. WHILE los Datos_Drift se actualizan visualmente, THE Sistema_Animaciones SHALL ejecutar la animación `fadeInUp` con una duración entre 300ms y 500ms
2. THE Sistema_Animaciones SHALL utilizar una duración de exactamente 400ms como valor por defecto para la animación `fadeInUp`

### Requerimiento 5: Restricción de no modificar lógica de negocio

**User Story:** Como líder técnico, quiero garantizar que esta feature solo añade CSS y props de `key`, sin alterar el flujo de datos ni las props de los componentes existentes.

#### Criterios de Aceptación

1. THE Sistema_Animaciones SHALL limitar los cambios exclusivamente a reglas CSS de animación y adición de props `key` en contenedores JSX
2. THE Sistema_Animaciones SHALL preservar intactos todos los props, tipos, interfaces y flujo de datos de los componentes `DriftBanner`, `DeltaCard`, `DecisionCard` y `ComparisonPanel`

### Requerimiento 6: Integridad del build tras los cambios

**User Story:** Como desarrollador, quiero que la aplicación siga compilando correctamente después de agregar las animaciones, sin introducir errores de TypeScript ni warnings.

#### Criterios de Aceptación

1. WHEN se ejecuta `npm run build` después de aplicar los cambios de animación, THE Sistema_Animaciones SHALL producir una compilación exitosa sin errores de TypeScript
2. IF `npm run build` falla después de los cambios, THEN THE Sistema_Animaciones SHALL revertir los cambios hasta restaurar un build exitoso
