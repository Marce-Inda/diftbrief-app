# Criterios de Aceptación EARS - DriftBrief
## Requerimientos Formateados en EARS (Easy Approach to Requirements Syntax)
### Requerimiento 1: Comparación de Snapshots
- **WHEN** el usuario selecciona la transición entre dos snapshots válidos (ej. Snapshot A → B).
- **THE SYSTEM SHALL** calcular el objeto `Drift` estructurado identificando nuevos hechos confirmados, cambios de severidad, giros de confianza y la decisión urgente en menos de 100ms.
### Requerimiento 2: Diferenciación de Roles (SOC vs CISO)
- **WHEN** el usuario alterna la pestaña entre "Vista SOC" y "Vista CISO".
- **THE SYSTEM SHALL** actualizar instantáneamente el encuadre (framing), priorizando acciones técnicas de contención para el SOC y evaluación de riesgo reputacional/institucional para el CISO.
### Requerimiento 3: Resiliencia y Fallback (Chaos & Offline)
- **WHEN** la API de Inteligencia Artificial externa falle, expire por timeout o no tenga una clave configurada.
- **THE SYSTEM SHALL** realizar un *fallback* transparente al motor determinista local (`driftComparator.ts`), garantizando el 100% de la funcionalidad de la demo sin mostrar errores no capturados al usuario.
### Requerimiento 4: Exportación de Briefing
- **WHEN** el usuario presiona el botón "Copiar Briefing".
- **THE SYSTEM SHALL** copiar al portapapeles el texto condensado correspondiente al rol seleccionado y mostrar un feedback visual de éxito ("¡Copiado!").

