# AI Ethics & Engineering — DriftBrief

> Documento de gobernanza sobre cómo controlamos la IA, prevenimos alucinaciones y garantizamos que el humano (SOC/CISO) mantenga siempre la decisión final.

---

## 1. Principio Fundamental: Human-in-the-Loop

DriftBrief está diseñado bajo la premisa de que **la IA asiste, no decide**. El sistema:

- **Presenta** drift, evidencia y opciones al analista humano.
- **Sugiere** acciones basadas en playbooks verificados y frameworks de seguridad.
- **Nunca ejecuta** acciones de contención, notificación o comunicación automáticamente.
- **Siempre requiere** que el SOC o CISO tome la decisión final y actúe manualmente.

El campo `urgentDecision` en el objeto Drift es explícitamente una **recomendación**, no una orden. El briefing exportable es un documento de apoyo a la toma de decisiones, no un plan de acción autónomo.

---

## 2. Arquitectura Anti-Alucinación

### 2.1 Grounding en Knowledge Base Estática

Los agentes redactores (SOC/CISO) operan con una base de conocimiento cerrada (`knowledgeBase.ts`) que contiene:

| Categoría | Contenido | Verificación |
|-----------|-----------|--------------|
| Regulaciones | GDPR, HIPAA, NIS2 con artículos y plazos | Fuentes oficiales de la UE y US HHS |
| Frameworks | MITRE ATT&CK (TA0003, TA0008, TA0010, TA0040) | Catálogo oficial de MITRE |
| Playbooks | Aislamiento de red, preservación forense, reset de credenciales | Estándares NIST/SANS |

Los agentes **solo pueden citar** información presente en esta base. Las directivas constitucionales del prompt prohíben explícitamente inventar datos externos.

### 2.2 Prompt Hardening (Directivas Constitucionales)

Cada system prompt de agente redactor incluye restricciones formales:

```
DIRECTIVAS CONSTITUCIONALES (ANTI-ALUCINACIÓN):
- Basa tu respuesta EXCLUSIVAMENTE en el Drift y el contexto táctico provisto.
- NO inventes IOCs, hashes, IPs o dominios que no aparezcan en los datos del drift.
- NO asumas herramientas, sistemas operativos o topología de red no mencionados.
- NO generes recomendaciones basadas en técnicas MITRE no proporcionadas.
- Si un dato no está disponible, indica "información no disponible".
- Cada afirmación técnica DEBE ser trazable a un dato proporcionado.
```

### 2.3 Structured Output (JSON Schema Enforcement)

Las respuestas de la IA se fuerzan mediante schemas estrictos:

- **Gemini**: `responseMimeType: 'application/json'` + `responseSchema` nativo.
- **Groq**: `response_format: { type: 'json_schema', json_schema: { strict: true } }`.

Esto elimina:
- Respuestas en formato libre que podrían incluir información no solicitada.
- Markdown, comentarios o texto fuera del schema esperado.
- Ambigüedad en el parsing de la respuesta.

### 2.4 Temperatura Mínima

Ambas APIs se configuran con:
- `temperature: 0.0`
- `topP: 0.1`

Esto minimiza la creatividad del modelo y maximiza la adherencia al prompt y contexto proporcionado.

---

## 3. Enrutamiento Local (Zero-LLM Router)

### Decisión: Fuse.js en lugar de LLM para enrutamiento

El Agente Enrutador **no usa IA**. En su lugar, implementa búsqueda difusa local:

| Estrategia | Latencia | Costo | Determinismo |
|-----------|----------|-------|--------------|
| Keyword matching directo | ~0.1ms | $0 | 100% determinista |
| Fuzzy search (Fuse.js) | ~1-5ms | $0 | Reproducible (mismo input → mismo output) |
| Defaults por defecto | 0ms | $0 | 100% determinista |

### Justificación ética

- El enrutamiento determina qué regulación y táctica MITRE se presentan al analista.
- Una alucinación en este paso podría llevar a citar la regulación incorrecta (ej. HIPAA en lugar de NIS2).
- Al ser determinista, el enrutamiento es auditable y reproducible.

---

## 4. Tool Calling Controlado

### Herramientas disponibles para la IA

| Herramienta | Función | Datos que retorna |
|------------|---------|-------------------|
| `queryThreatIntelligence` | Consulta de reputación de IOCs | Reputación, campaña, acción recomendada |
| `queryRegulatoryPrecedents` | Consulta de precedentes regulatorios | Multa máxima, ejemplo reciente, deadline |

### Controles de seguridad en tool calling

1. **Herramientas simuladas**: Las funciones son stubs locales con datos precalculados. No hay llamadas reales a servicios de threat intel.
2. **Registry cerrado**: Solo se ejecutan funciones registradas en el `ToolRegistry`. Si la IA solicita una función no registrada, recibe un error controlado.
3. **Loop máximo de 2 iteraciones**: El ReAct loop (call → execute → follow-up) tiene un límite estricto de 2 iteraciones para prevenir loops infinitos.
4. **Error sanitization**: Los errores de ejecución de herramientas se sanitizan con `sanitizeErrorMessage()` antes de enviarlos de vuelta a la IA.

### Invocación condicional

El system prompt del agente SOC solo instruye invocar `queryThreatIntelligence` cuando `drift.newIOCs.length > 0`. Si no hay IOCs, la herramienta no se ofrece en el prompt.

---

## 5. Transparencia y Observabilidad

### Panel de Telemetría (Development Only)

Cuando está habilitado (dual-gate), el panel muestra:
- **Tokens consumidos**: Visibilidad del costo cognitivo de cada briefing.
- **Latencia**: Tiempo real de respuesta de la API.
- **Costo estimado**: Transparencia sobre el costo económico de cada generación.

### Campo `source` en AgentDriftResult

El resultado siempre indica su origen:
- `'gemini'` — Generado por Google Gemini.
- `'groq'` — Generado por Groq (Llama 3.3 70B).
- `'local'` — Generado por el motor determinista (sin IA).

Esto permite al usuario saber si el briefing fue generado por IA o por el motor local.

---

## 6. Diferenciación de Roles y Framing Ético

### SOC vs CISO: Mismos datos, diferente encuadre

| Aspecto | Vista SOC | Vista CISO |
|---------|-----------|------------|
| Enfoque | Contención técnica, IOCs, forense | Riesgo institucional, regulatorio, comunicación |
| Acciones | Operativas (bloquear IP, aislar red) | Estratégicas (notificar autoridad, comunicado público) |
| Lenguaje | Técnico, específico | Ejecutivo, impacto de negocio |

### Principio ético

La IA **no filtra ni oculta** información según el rol. Ambas vistas tienen acceso al mismo drift completo. La diferencia es únicamente de **encuadre y priorización**, no de acceso a datos.

---

## 7. Limitaciones Conocidas y Mitigaciones

| Limitación | Riesgo | Mitigación |
|-----------|--------|------------|
| APIs externas pueden ver el prompt + drift | Fuga de contexto del incidente | Datos ficticios en MVP; proxy server-side para producción |
| Structured output no previene alucinaciones semánticas | Dato formalmente correcto pero inventado | Directivas constitucionales + Knowledge Base cerrada |
| Tool calling simulado | No refleja threat intel real | Diseñado como demostración; en producción se conectaría a MISP/VirusTotal |
| Temperatura 0.0 no es 100% determinista | Posible variabilidad entre calls | Fallback local como verdad base |

---

## Historial de Decisiones de IA

| Fecha | Decisión | Justificación |
|-------|----------|---------------|
| 2025-07 | Enrutador local con Fuse.js (sin LLM) | Determinismo, cero costo, cero latencia, auditabilidad |
| 2025-07 | Directivas constitucionales anti-alucinación | Prevenir que la IA invente IOCs o regulaciones |
| 2025-07 | Structured Output obligatorio | Eliminar parsing frágil y respuestas en formato libre |
| 2025-07 | Límite de 2 iteraciones en ReAct loop | Prevenir loops infinitos y consumo descontrolado de tokens |
| 2025-07 | Temperature 0.0 + topP 0.1 | Maximizar reproducibilidad y adherencia al contexto |
| 2025-07 | Human-in-the-Loop como principio base | La IA sugiere, el humano decide y actúa |
