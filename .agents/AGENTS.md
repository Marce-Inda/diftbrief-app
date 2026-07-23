# Steering & Project Directives - DriftBrief (Hackathon Kiro)

> **Regla de Ahorro de Tokens:** Este archivo condensa todo el contexto del proyecto (PRD, UI System, Contrato de Datos y Arquitectura). El agente NO debe releer los 19 archivos Markdown individuales para responder sobre reglas de diseño o esquemas de datos.

---

## 🎯 Resumen del Producto
**DriftBrief** es una herramienta y agente especializado para respuesta a incidentes de ciberseguridad. Detecta el **drift (qué cambió)** entre dos snapshots sucesivos de un mismo incidente (A → B y B → C) y genera briefings adaptados por rol (**SOC** vs **CISO**).

---

## 🎨 Sistema de Diseño (UI Design System Tokens)

### Paleta de Colores
- **Background / Base:** `#0F1318`
- **Surface / Panel:** `#161C22`
- **Surface Elevated:** `#1D252D`
- **Border Subtle:** `#2A333D`
- **Text Primary:** `#E8EEF5`
- **Text Secondary:** `#A8B3BF`
- **Text Muted:** `#7E8A97`

### Colores Funcionales (Deltas & Estados)
- **Drift / Cambio Detectado:** `#5BC0EB` (Azul/Cian)
- **Confirmado / Certeza:** `#3FB950` (Verde)
- **Probable / Por Validar:** `#F5A524` (Naranja)
- **Crítico / Alerta:** `#F85149` (Rojo)
- **Riesgo Institucional:** `#C678DD` (Púrpura)
- **Decisión Requerida:** `#FFD166` (Amarillo/Ámbar)

### Tipografía & Layout
- **Fuente:** Sans-serif sobria (Inter / Geist / System Sans).
- **Layout:** Grid de 2 columnas principales (60% Comparación de Snapshots side-by-side, 40% Interpretación del Agente y Decisión Urgente).

---

## 📄 Contrato de Datos JSON (Schemas)

### 1. Objeto `Snapshot`
```json
{
  "id": "string",
  "incidentId": "string",
  "timestamp": "ISO-8601 string",
  "label": "string",
  "summary": "string",
  "severity": "low | medium | high | critical",
  "confidence": "confirmed | probable | needs_validation",
  "factsConfirmed": ["string"],
  "activeHypotheses": ["string"],
  "dismissedHypotheses": ["string"],
  "newEvidence": ["string"],
  "impactedAssets": ["string"],
  "businessImpact": ["string"],
  "openDecisions": ["string"],
  "nextRecommendedActions": ["string"],
  "priorityRole": "SOC | CISO"
}
```

### 2. Objeto `Drift` (Salida del Comparador / Agente)
```json
{
  "incidentId": "string",
  "previousSnapshotId": "string",
  "currentSnapshotId": "string",
  "headline": "string",
  "severityChange": { "from": "string", "to": "string" },
  "confidenceChange": { "from": "string", "to": "string" },
  "newlyConfirmed": ["string"],
  "newRisks": ["string"],
  "discardedAssumptions": ["string"],
  "whyItMatters": ["string"],
  "urgentDecision": {
    "title": "string",
    "description": "string"
  },
  "socView": {
    "summary": "string",
    "keyPoints": ["string"],
    "nextAction": "string"
  },
  "cisoView": {
    "summary": "string",
    "keyPoints": ["string"],
    "nextAction": "string"
  }
}
```

---

## 🛠️ Reglas de Código & Stack Técnico
- **Framework:** React + Vite + TypeScript.
- **Estilos:** CSS Vanilla / CSS Modules usando las variables CSS de los design tokens arriba definidos.
- **Estructura de Componentes:** Componentes funcionales limpios en `src/components/`.
- **Modo Offline / Fallback:** El motor determinista en `src/services/driftComparator.ts` debe proveer el objeto `Drift` completo si la API de IA no está disponible o falla.

---

## 👥 Diferenciación de Roles (Doble Lectura)
- **Vista SOC:** Orientada a contención técnica, análisis de evidencias/IOCs, preservación forense y acciones operativas inmediatas.
- **Vista CISO:** Orientada a exposición del negocio, riesgo reputacional y regulatorio, tiempos de comunicación y decisiones ejecutivas clave.


---

## 📝 Regla de Mantenimiento de Documentación (Definition of Done)

**INSTRUCCIÓN OBLIGATORIA PARA EL AGENTE:**

Cada vez que termines de implementar una nueva tarea, feature o bugfix, **DEBES revisar obligatoriamente** los archivos en la carpeta `docs/`. Si la tarea reciente impactó alguna de las siguientes áreas, debes modificar, agregar o actualizar el archivo correspondiente en `docs/` **antes de dar la tarea por terminada**:

| Área impactada | Archivo a actualizar |
|----------------|---------------------|
| Manejo de secretos, API keys, validación de inputs, hooks de seguridad, mecanismos de ocultamiento | `docs/SECURITY_BY_DESIGN.md` |
| Flujo de datos, persistencia, comunicación con APIs externas, clasificación de datos, cumplimiento regulatorio | `docs/DATA_GOVERNANCE_AND_COMPLIANCE.md` |
| Prompts de IA, structured outputs, anti-alucinación, tool calling, enrutamiento, temperatura/topP, observabilidad de IA | `docs/AI_ETHICS_AND_ENGINEERING.md` |
| Testing (unit, PBT, integration), dependencias, build system, deploy, hooks de automatización, CI/CD | `docs/DEVOPS_AND_INFRASTRUCTURE.md` |

### Criterios de aplicación

1. **Si agregaste o modificaste un hook de Kiro** → Actualiza `SECURITY_BY_DESIGN.md` y `DEVOPS_AND_INFRASTRUCTURE.md`.
2. **Si modificaste un system prompt o la Knowledge Base** → Actualiza `AI_ETHICS_AND_ENGINEERING.md`.
3. **Si agregaste una dependencia nueva** → Actualiza `DEVOPS_AND_INFRASTRUCTURE.md`.
4. **Si cambiaste el flujo de datos o la comunicación con APIs** → Actualiza `DATA_GOVERNANCE_AND_COMPLIANCE.md`.
5. **Si la tarea no impactó ninguna de estas áreas** → No se requiere actualización, pero verifica que esto sea cierto antes de cerrar.

**Esta regla es parte del Definition of Done del proyecto y su incumplimiento invalida la completitud de la tarea.**
