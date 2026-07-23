# Data Governance & Compliance — DriftBrief

> Documento de gobernanza sobre el flujo de datos, su clasificación y nuestra postura respecto al manejo de la información de incidentes.

---

## 1. Clasificación de Datos

### Datos del Incidente (Snapshots)

| Campo | Sensibilidad | Justificación |
|-------|-------------|---------------|
| `facts`, `hypotheses` | Alta | Describen el estado real de un compromiso de seguridad |
| `iocs` (IPs, hashes, dominios) | Alta | Indicadores activos que podrían ser usados por adversarios |
| `businessImpact` | Media-Alta | Revelan exposición institucional y riesgo reputacional |
| `openDecisions` | Media | Decisiones pendientes que implican postura de respuesta |
| `severity`, `confidence` | Media | Metadatos de clasificación del incidente |

### Datos Generados (Drift & Briefings)

| Dato | Sensibilidad | Destino |
|------|-------------|---------|
| Objeto `Drift` completo | Alta | Renderizado en UI, nunca persistido en servidor |
| `socBriefing` / `cisoBriefing` | Alta | Portapapeles del usuario (acción explícita) |
| `TelemetryData` (tokens, latencia, costo) | Baja-Interna | Solo visible con dual-gate habilitado |

---

## 2. Flujo de Datos

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTE (Browser)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  snapshots.json ──→ driftComparator.ts ──→ Drift (local)        │
│       (estático)         (determinista)                          │
│                                                                  │
│  snapshots.json ──→ agentService.ts ──→ LLM API ──→ Drift (IA) │
│       (estático)     (prompts + KB)     (Gemini/Groq)           │
│                                                                  │
│  Drift ──→ UI Components ──→ Clipboard (exportación)            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Principios del flujo

1. **Procesamiento 100% client-side**: No existe backend propio. Todo cómputo ocurre en el navegador.
2. **Datos estáticos demo**: `snapshots.json` contiene un escenario ficticio. No se procesan datos reales de incidentes en el MVP.
3. **Sin persistencia de estado**: El drift calculado vive en memoria (React state). No hay localStorage, IndexedDB ni cookies.
4. **Exportación explícita**: El briefing solo sale del sistema cuando el usuario ejecuta manualmente "Copiar Briefing".

---

## 3. Comunicación con APIs Externas

### Qué se envía a las APIs de IA

| Dato enviado | API destino | Propósito |
|-------------|-------------|-----------|
| System prompt con reglas del agente | Gemini / Groq | Instrucciones de comportamiento |
| Drift calculado + contexto de Knowledge Base | Gemini / Groq | Generación del briefing |
| IOCs del drift (cuando hay tool calling) | Gemini / Groq | Enriquecimiento vía herramientas simuladas |

### Qué NO se envía

- Credenciales de usuario
- Datos de identificación personal (PII)
- Metadatos del sistema del usuario
- Historial de sesiones previas

### Postura sobre retención por terceros

- Google Gemini y Groq pueden retener datos de acuerdo a sus políticas.
- En el escenario demo (datos ficticios), esto no representa riesgo real.
- Para un despliegue con datos reales, se requeriría un proxy server-side que anonimice antes de enviar, o el uso exclusivo del motor determinista local.

---

## 4. Cumplimiento Regulatorio (Postura del MVP)

### Marco aplicable al caso demo

El escenario ficticio involucra infraestructura electoral, lo cual activa:

| Regulación | Relevancia | Implementación en DriftBrief |
|-----------|------------|------------------------------|
| NIS2 | Alta — infraestructura crítica | Knowledge Base incluye plazos y obligaciones de NIS2 |
| GDPR | Media — si hay datos personales en el padrón | Knowledge Base incluye Arts. 32-34 |
| HIPAA | Baja — no aplica al caso demo | Incluida como referencia para extensibilidad |

### Nuestra postura

DriftBrief **no procesa datos reales regulados** en el MVP. Sin embargo:
- La Knowledge Base incluye información verificada de regulaciones reales para que los briefings generados sean precisos y accionables.
- Los agentes de IA están instruidos a citar plazos legales exactos (72h GDPR, 24h NIS2).
- El sistema informa al CISO sobre obligaciones de notificación como parte del briefing.

---

## 5. Retención y Eliminación

| Dato | Retención | Mecanismo de eliminación |
|------|-----------|--------------------------|
| Snapshots demo | Indefinida (archivo estático en repo) | Git history |
| Drift calculado | Duración de la sesión del navegador | Cierre de pestaña / refresh |
| Briefing exportado | Portapapeles del usuario | El usuario controla |
| Telemetría (tokens/costo) | Duración de la sesión | Cierre de pestaña / refresh |
| Logs de consola (dev) | Sesión de DevTools | Cierre del navegador |

---

## 6. Principio de Mínimo Privilegio

- La app no solicita permisos del navegador (geolocalización, notificaciones, cámara, etc.).
- El único permiso implícito es acceso a red para llamar a APIs de IA (opcional).
- La funcionalidad de clipboard (`navigator.clipboard.writeText`) solo se invoca por acción explícita del usuario.

---

## Historial de Decisiones de Gobernanza

| Fecha | Decisión | Justificación |
|-------|----------|---------------|
| 2025-07 | Procesamiento 100% client-side | Eliminar superficie de ataque de un backend propio |
| 2025-07 | Datos ficticios en el MVP | Evitar complejidad regulatoria real en fase de hackathon |
| 2025-07 | Knowledge Base con regulaciones reales | Briefings creíbles y accionables para evaluadores |
| 2025-07 | Sin persistencia de estado | Minimizar riesgo de data-at-rest |
