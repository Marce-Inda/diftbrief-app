# Documento de Requerimientos

## Introducción

Este documento define los requerimientos formales para el refinamiento visual "Cyber-Premium" del componente `BusinessHeader`. Los cambios son exclusivamente de presentación (CSS + 1 elemento JSX mínimo) sin alterar la lógica de negocio, cálculos ni flujo de datos del componente existente.

## Glosario

- **BusinessHeader**: Componente React de banner de métricas de negocio (`src/components/BusinessHeader.tsx`)
- **Neon_Glow**: Efecto visual de sombra luminosa (`box-shadow`) con color adaptativo según severidad
- **Glassmorphism**: Técnica CSS de fondo semi-transparente con `backdrop-filter: blur()` y borde sutil
- **LIVE_Badge**: Indicador visual de estado "en vivo" con dot animado y texto monospace
- **Severity_Level**: Clasificación del incidente: `critical`, `high`, `medium`, `low`
- **Triage_Card**: Sección del banner que muestra el tiempo de triage automatizado vs manual
- **Financial_Risk_Card**: Sección del banner que muestra la exposición financiera por hora
- **Regulatory_Chip**: Badge compacto pill-shaped que muestra regulación aplicable con formato "⚠️ NIS2 • 24h SLA"
- **Build_System**: Proceso de compilación TypeScript + Vite ejecutado mediante `npm run build`

## Requerimientos

### Requerimiento 1: Neon Glow Shadows Adaptativos por Severidad

**User Story:** Como analista SOC, quiero que las cards del banner tengan sombras neón adaptativas por severidad, para que pueda identificar visualmente el nivel de riesgo de un vistazo.

#### Criterios de Aceptación

1. THE BusinessHeader SHALL aplicar un `box-shadow` cyan (`0 0 12px rgba(91, 192, 235, 0.3)`) a la Triage_Card
2. THE BusinessHeader SHALL aplicar un `box-shadow` rojo con animación pulsante a la Financial_Risk_Card cuando Severity_Level es `critical`
3. THE BusinessHeader SHALL aplicar un `box-shadow` naranja (`0 0 12px rgba(245, 165, 36, 0.2)`) a la Financial_Risk_Card cuando Severity_Level es `high`
4. WHILE Severity_Level es `medium` o `low`, THE Financial_Risk_Card SHALL renderizarse sin Neon_Glow especial

### Requerimiento 2: Énfasis Critical Financial Risk

**User Story:** Como CISO, quiero que el valor de exposición financiera sea visualmente prominente en severidad crítica, para que la urgencia económica sea inmediatamente evidente.

#### Criterios de Aceptación

1. WHILE Severity_Level es `critical`, THE Financial_Risk_Card SHALL mostrar el valor monetario con `font-size: 1.8rem` y `font-weight: 700`
2. WHILE Severity_Level es `critical`, THE Financial_Risk_Card SHALL tener un `box-shadow` animado con keyframe `neon-pulse` de ciclo 3 segundos
3. WHILE Severity_Level es `critical`, THE Financial_Risk_Card SHALL mostrar un `border-left: 4px solid` en color crítico rojo

### Requerimiento 3: Triage Card Cyan Accent con Monospace Typography

**User Story:** Como analista SOC, quiero que la card de triage tenga acento visual cyan y tipografía monospace bold, para que los tiempos de respuesta sean fáciles de leer como datos técnicos.

#### Criterios de Aceptación

1. THE Triage_Card SHALL tener un `border-left: 3px solid` en color cyan drift
2. THE Triage_Card SHALL mostrar el valor de tiempo automatizado en tipografía `monospace` con `font-weight: 700` y `font-size` XL
3. THE Triage_Card SHALL aplicar el Neon_Glow cyan como `box-shadow`

### Requerimiento 4: Glassmorphism Regulatory Chips

**User Story:** Como CISO, quiero que los badges regulatorios tengan formato compacto glassmorphism con ícono de warning, para que las obligaciones de compliance sean visualmente distinguibles y premium.

#### Criterios de Aceptación

1. WHEN regulaciones aplicables existen, THE BusinessHeader SHALL renderizar cada Regulatory_Chip con formato compacto "⚠️ {nombre} • {horas}h SLA"
2. THE Regulatory_Chip SHALL aplicar Glassmorphism con `backdrop-filter: blur(4px)` y fondo semi-transparente `rgba(255, 209, 102, 0.1)`
3. THE Regulatory_Chip SHALL tener forma pill (`border-radius: 999px`) con borde sutil `rgba(255, 209, 102, 0.3)`
4. IF `backdrop-filter` no es soportado por el navegador, THEN THE Regulatory_Chip SHALL mantener el fondo semi-transparente como fallback visual aceptable

### Requerimiento 5: LIVE Indicator Badge

**User Story:** Como usuario del dashboard, quiero ver un indicador "● LIVE DRIFT METRICS" en el banner, para saber que las métricas mostradas son datos en tiempo real.

#### Criterios de Aceptación

1. THE BusinessHeader SHALL renderizar un LIVE_Badge con texto "LIVE DRIFT METRICS" en tipografía monospace uppercase
2. THE LIVE_Badge SHALL incluir un dot circular animado verde/cyan con animación `live-pulse` de ciclo 2 segundos
3. THE LIVE_Badge SHALL tener fondo semi-transparente verde (`rgba(63, 185, 80, 0.08)`) con borde sutil verde

### Requerimiento 6: No Cambios en Lógica de Negocio

**User Story:** Como desarrollador, quiero garantizar que los cambios visuales no alteren el comportamiento funcional del componente, para mantener la integridad del sistema.

#### Criterios de Aceptación

1. THE BusinessHeader SHALL mantener idéntica la interfaz `BusinessHeaderProps` sin agregar ni modificar props
2. THE BusinessHeader SHALL preservar la misma lógica de filtrado y ordenamiento de regulaciones (`getApplicableRegulations`)
3. THE BusinessHeader SHALL preservar la misma lógica de formateo financiero (`formatFinancialValue`) y de tiempo (`formatTime`)
4. THE BusinessHeader SHALL preservar el mismo mapeo de severidad a clases CSS (`severityToClassName`)

### Requerimiento 7: Build Integrity

**User Story:** Como desarrollador, quiero que el proyecto compile sin errores después de los cambios, para asegurar que no se introducen regresiones.

#### Criterios de Aceptación

1. THE Build_System SHALL completar `npm run build` exitosamente sin errores TypeScript tras aplicar los cambios en BusinessHeader.css y BusinessHeader.tsx
2. THE Build_System SHALL completar la compilación sin warnings nuevos de tipo o CSS
