# DriftBrief — Arquitectura Técnica

> Diagramas de arquitectura para presentación en video del proyecto.

---

## Diagrama 1: Pipeline de Resiliencia Agéntica (Single-Pass & Fallback)

```mermaid
flowchart TD
    subgraph Entrada ["📥 Entrada de Snapshots"]
        A["Snapshot A<br/>Anomalía Técnica"]
        B["Snapshot B<br/>Malware Confirmado"]
    end

    A --> Diff["⚙️ Calculadora de Drift<br/><i>driftComparator.ts</i>"]
    B --> Diff

    Diff --> Router["🔍 Enrutador Local<br/><i>Fuse.js — Latencia ~0ms</i>"]

    Router --> KB["📚 Knowledge Base<br/>MITRE ATT&CK · NIS2 · Playbooks"]
    KB --> Engine{"🤖 Orquestador Agéntico<br/>Single-Pass"}

    subgraph Cadena_Fallback ["🔀 Cadena de Fallback (Resiliencia 100%)"]
        direction TB
        Gemini["☁️ Google Gemini 2.0 Flash<br/><i>Intento primario</i>"]
        Groq["☁️ Groq API<br/><i>Llama 3.3 70B</i>"]
        OpenRouter["☁️ OpenRouter<br/><i>Llama 3.1 8B Free</i>"]
        LocalEngine["🏠 Motor Determinista Local<br/><i>driftComparator.ts</i><br/>100% offline"]
        Gemini -->|"Si falla / cuota"| Groq
        Groq -->|"Si falla / timeout"| OpenRouter
        OpenRouter -->|"Sin red / offline"| LocalEngine
    end

    Engine --> Gemini

    subgraph Tool_Calling ["🔧 Tool Calling (ReAct Loop)"]
        ThreatIntel["queryThreatIntelligence<br/><i>IOC reputation & campaigns</i>"]
        Regulatory["queryRegulatoryPrecedents<br/><i>NIS2 penalties & deadlines</i>"]
    end

    Engine -.->|"Function Call"| Tool_Calling
    Tool_Calling -.->|"Function Response"| Engine

    subgraph Salida ["📤 Salida Adaptada por Rol"]
        Response["✅ Objeto Drift Validado<br/><i>JSON estructurado</i>"]
        SOC["🛡️ Vista SOC<br/>IOCs · Malware · Acciones Operativas<br/>Contención · Forense"]
        CISO["📊 Vista CISO<br/>Exposure $150k/h · SLA NIS2<br/>Decisión Urgente · Comunicación"]
    end

    Gemini --> Response
    Groq --> Response
    OpenRouter --> Response
    LocalEngine --> Response
    Response --> SOC
    Response --> CISO

    %% Estilos
    style LocalEngine fill:#3FB950,stroke:#2A333D,color:#0F1318
    style Engine fill:#5BC0EB,stroke:#2A333D,color:#0F1318
    style Response fill:#FFD166,stroke:#2A333D,color:#0F1318
    style Gemini fill:#4285F4,stroke:#2A333D,color:#FFFFFF
    style Groq fill:#F55036,stroke:#2A333D,color:#FFFFFF
    style OpenRouter fill:#9B59B6,stroke:#2A333D,color:#FFFFFF
    style Router fill:#5BC0EB,stroke:#2A333D,color:#0F1318
    style KB fill:#A8B3BF,stroke:#2A333D,color:#0F1318
```

---

## Diagrama 2: Flujo de Datos End-to-End (Usuario → Briefing)

```mermaid
flowchart LR
    subgraph UI ["🖥️ Interfaz de Usuario"]
        User(("👤 Operador"))
        SnapSelector["SnapshotSelector<br/><i>A→B / B→C</i>"]
        RoleSwitch["RoleSwitcher<br/><i>SOC ↔ CISO</i>"]
        Export["BriefExportPanel<br/><i>Copiar Briefing</i>"]
    end

    subgraph Core ["⚙️ Core Engine"]
        direction TB
        Comparator["driftComparator.ts<br/><i>Funciones puras</i><br/>newFacts · severityChange<br/>confidenceShifts · IOCs"]
        LocalRouter["localRouter.ts<br/><i>Fuse.js fuzzy search</i><br/>Selección de contexto RAG"]
        Agent["agentService.ts<br/><i>Orquestador Single-Pass</i><br/>Structured Output + Tool Calling"]
    end

    subgraph Data ["💾 Datos"]
        Snapshots["snapshots.json<br/><i>A · B · C</i>"]
        KnowledgeBase["knowledgeBase.ts<br/><i>MITRE · NIS2 · GDPR<br/>Playbooks · Precedentes</i>"]
        Tools["tools.ts<br/><i>Threat Intel · Regulatory</i>"]
    end

    subgraph Providers ["☁️ LLM Providers"]
        direction TB
        P1["Gemini 2.0 Flash"]
        P2["Groq Llama 3.3"]
        P3["OpenRouter Free"]
    end

    subgraph Output ["📋 Output"]
        DriftObj["Drift Object<br/><i>JSON validado</i>"]
        SOCView["Vista SOC<br/><i>Técnica · Operativa</i>"]
        CISOView["Vista CISO<br/><i>Ejecutiva · Estratégica</i>"]
        Clipboard["📎 Clipboard<br/><i>Briefing copiado</i>"]
    end

    User --> SnapSelector
    User --> RoleSwitch
    SnapSelector --> Comparator
    Snapshots --> Comparator
    Comparator --> LocalRouter
    KnowledgeBase --> LocalRouter
    LocalRouter --> Agent
    Tools -.-> Agent
    Agent --> P1
    Agent --> P2
    Agent --> P3
    Agent --> DriftObj
    DriftObj --> SOCView
    DriftObj --> CISOView
    RoleSwitch -->|"Filtra vista"| SOCView
    RoleSwitch -->|"Filtra vista"| CISOView
    SOCView --> Export
    CISOView --> Export
    Export --> Clipboard

    %% Estilos
    style Comparator fill:#3FB950,stroke:#2A333D,color:#0F1318
    style Agent fill:#5BC0EB,stroke:#2A333D,color:#0F1318
    style DriftObj fill:#FFD166,stroke:#2A333D,color:#0F1318
    style P1 fill:#4285F4,stroke:#2A333D,color:#FFFFFF
    style P2 fill:#F55036,stroke:#2A333D,color:#FFFFFF
    style P3 fill:#9B59B6,stroke:#2A333D,color:#FFFFFF
    style LocalRouter fill:#5BC0EB,stroke:#2A333D,color:#0F1318
```

---

## Resumen de Componentes Clave

| Componente | Archivo | Responsabilidad |
|---|---|---|
| **Calculadora de Drift** | `driftComparator.ts` | Funciones puras: compara snapshots, produce Drift JSON |
| **Enrutador Local** | `localRouter.ts` | Búsqueda difusa Fuse.js para seleccionar contexto RAG |
| **Knowledge Base** | `knowledgeBase.ts` | MITRE ATT&CK, NIS2, GDPR, Playbooks de incidentes |
| **Tool Calling** | `tools.ts` | Threat Intelligence y Regulatory Precedents |
| **Orquestador Agéntico** | `agentService.ts` | Single-pass con cadena de fallback y structured output |
| **UI Components** | `src/components/` | SnapshotSelector, RoleSwitcher, DeltaCard, Export |

## Principios de Resiliencia

1. **Fallback en cascada**: Gemini → Groq → OpenRouter → Motor Local (siempre responde)
2. **Cero alucinaciones**: Grounding obligatorio contra Knowledge Base
3. **Latencia mínima**: Enrutador Fuse.js en browser (~0ms) evita llamada LLM extra
4. **Offline-first**: El motor determinista local garantiza 100% funcionalidad sin red
5. **Structured Output**: JSON schema enforcement en Gemini + Groq para respuestas predecibles
