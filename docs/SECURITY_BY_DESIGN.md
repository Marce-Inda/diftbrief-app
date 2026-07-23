# Security by Design — DriftBrief

> Documento de gobernanza que registra las decisiones de seguridad tomadas desde el diseño del sistema.

---

## 1. Gestión de Secretos y API Keys

### Principio: Zero Hardcoded Secrets

DriftBrief maneja claves de APIs externas (Google Gemini, Groq) exclusivamente mediante variables de entorno con el prefijo `VITE_`:

| Variable | Propósito | Exposición |
|----------|-----------|------------|
| `VITE_GEMINI_API_KEY` | API de Google Gemini para generación de briefings IA | Bundle cliente (Vite) |
| `VITE_GROQ_API_KEY` | API de Groq como fallback de generación IA | Bundle cliente (Vite) |
| `VITE_SHOW_TELEMETRY` | Gate de activación del panel de depuración | Bundle cliente (Vite) |

### Controles implementados

- **`.gitignore` estricto**: Los archivos `.env`, `.env.local` y `.env.*.local` están excluidos del control de versiones.
- **`.env.example` como plantilla**: Provee estructura sin valores reales, facilitando onboarding seguro.
- **Hook automático "Secret Scanner on Agent Stop"**: Al finalizar cada turno del agente de desarrollo, se ejecuta un escaneo de patrones de API keys (`AIzaSy...` para Gemini, `gsk_...` para Groq) en todo código modificado.
- **Hook "PostFileSave Quality & Security Check"**: Cada escritura de archivo verifica que no existan API keys expuestas en texto plano.
- **Función `sanitizeErrorMessage()`**: En `agentService.ts`, los mensajes de error se sanitizan antes de logging, eliminando:
  - Valores de variables `VITE_*`
  - Bearer tokens
  - Headers de Authorization
  - Rutas absolutas del sistema de archivos

---

## 2. Panel de Telemetría Oculto (Security by Obscurity + Dual Gate)

El panel de telemetría (`TelemetryPanel.tsx`) expone métricas internas de la IA (tokens, latencia, costo). Su visibilidad se controla con un mecanismo **dual-gate**:

1. **Environment Gate**: `VITE_SHOW_TELEMETRY` debe ser exactamente `"true"` (case-sensitive, lowercase only). Si no está configurado o tiene cualquier otro valor, el panel no existe en el DOM.
2. **Keyboard Toggle**: Una vez habilitado el environment gate, el panel permanece oculto hasta que el usuario presiona `Ctrl+Shift+D` (Win/Linux) o `Cmd+Shift+D` (macOS).

### Justificación de seguridad

- En producción, `VITE_SHOW_TELEMETRY` se omite del deploy, eliminando completamente el panel del bundle.
- Usuarios finales (SOC/CISO) nunca ven métricas internas ni costos operativos de la IA.
- En desarrollo, el dual-gate previene exposición accidental durante demos o screen sharing.

---

## 3. Resiliencia y Fallback (Cadena de Confianza)

### Arquitectura de fallback de 3 niveles

```
Gemini API → Groq API → Motor Determinista Local
```

| Nivel | Servicio | Fallo esperado | Comportamiento |
|-------|----------|----------------|----------------|
| 1 | Google Gemini | Timeout 10s, HTTP error, sin API key | Intenta Groq |
| 2 | Groq (Llama 3.3 70B) | Timeout 10s, HTTP error, sin API key | Usa motor local |
| 3 | `driftComparator.ts` | Nunca falla (determinista, sin dependencias externas) | Resultado garantizado |

### Garantías

- **100% funcionalidad offline**: El motor determinista produce un objeto `Drift` completo sin red.
- **Timeout estricto (10s)**: `AbortSignal.timeout(10000)` en ambas APIs evita bloqueos indefinidos.
- **Degradación transparente**: El `AgentDriftResult` incluye campo `source` que indica qué motor produjo el resultado, y `fallbackReason` cuando aplica.

---

## 4. Anti-Alucinación (Prompt Hardening)

### System Prompts con Directivas Constitucionales

Los agentes redactores (SOC/CISO) operan con prompts que incluyen restricciones explícitas:

- NO inventar IOCs, hashes, IPs o dominios que no aparezcan en los datos del drift.
- NO asumir infraestructura, herramientas o topología de red no mencionados.
- NO generar recomendaciones basadas en técnicas MITRE que no estén en el catálogo proporcionado.
- Cada afirmación DEBE ser trazable a un dato proporcionado en el drift o la Knowledge Base.

### Grounding por Knowledge Base estática

La `SECURITY_KNOWLEDGE_BASE` (`knowledgeBase.ts`) contiene datos verificados de:
- Regulaciones (GDPR, HIPAA, NIS2) con artículos y plazos exactos.
- Tácticas MITRE ATT&CK con técnicas y mitigaciones.
- Playbooks de respuesta a incidentes con pasos numerados.

Los agentes solo pueden citar información presente en esta base, no inventar fuentes externas.

---

## 5. Validación de Entradas (Input Sanitation)

- Las estructuras JSON (`Snapshot`, `DriftRequest`) se validan mediante tipado estricto de TypeScript antes de procesarse.
- El campo `VITE_SHOW_TELEMETRY` solo acepta el valor exacto `"true"` — cualquier variación es rechazada.
- Los IOCs procesados por las herramientas simuladas se validan con regex (`IPV4_REGEX`, `HASH_REGEX`) antes de clasificarlos.

---

## 6. Hooks Automáticos de Seguridad (Kiro Agent Hooks)

| Hook | Trigger | Acción |
|------|---------|--------|
| PostFileSave Quality & Security Check | Cada escritura de archivo (`postToolUse: write`) | Escanea `any`, catch vacíos, API keys en texto plano |
| Secret Scanner on Agent Stop | Fin de turno del agente (`agentStop`) | Escaneo completo de patrones de credenciales |
| Snapshot JSON Schema Validator | Cada escritura de archivo (`postToolUse: write`) | Valida estructura obligatoria de `snapshots.json` |

---

## Historial de Decisiones

| Fecha | Decisión | Justificación |
|-------|----------|---------------|
| 2025-07 | Dual-gate para telemetría | Evitar exposición de métricas internas en producción/demos |
| 2025-07 | `sanitizeErrorMessage()` con truncado a 200 chars | Prevenir fuga de rutas o tokens en logs de consola |
| 2025-07 | Timeout de 10s con AbortSignal | Balance entre UX y resiliencia ante APIs lentas |
| 2025-07 | Structured Output (JSON Schema) en LLM calls | Eliminar parsing frágil y garantizar formato de respuesta |
