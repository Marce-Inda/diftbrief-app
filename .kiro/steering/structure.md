# Code Base & Directory Structure - DriftBrief
## Convenciones de Estructura de Archivos
```text
driftbrief/
├── .kiro/
│   └── steering/
│       ├── product.md          # Memoria del producto, problema y usuarios
│       ├── tech.md             # Stack tecnológico, comandos y tokens UI
│       └── structure.md        # Estructura de carpetas y convenciones de código
├── .agents/
│   ├── AGENTS.md               # Directivas globales de steering
│   └── skills/
│       └── driftbrief-agent/   # Custom Skill de Kiro para incident drift
│           └── SKILL.md
├── src/
│   ├── components/             # Componentes de UI (React functional components)
│   │   ├── IncidentCard.tsx
│   │   ├── SnapshotSelector.tsx
│   │   ├── DriftBanner.tsx
│   │   ├── ComparisonPanel.tsx
│   │   ├── DeltaCard.tsx
│   │   ├── RoleSwitcher.tsx
│   │   └── BriefExportPanel.tsx
│   ├── data/
│   │   └── snapshots.json      # Datos estáticos demo (Snapshots A, B, C)
│   ├── services/
│   │   ├── driftComparator.ts  # Comparador determinista de drift
│   │   └── agentService.ts     # Integración del Agente de IA con Gemini/Groq
│   ├── types/
│   │   └── index.ts            # Definiciones de TypeScript (Snapshot, Drift)
│   ├── styles/
│   │   ├── tokens.css          # Design Tokens (variables CSS de color y fuentes)
│   │   └── App.css             # Estilos globales y layout
│   ├── App.tsx                 # Componente principal de la aplicación
│   └── main.tsx                # Punto de entrada de React
├── package.json
└── README.md
```
## Convenciones de Código
- **Componentes:** Componentes funcionales en TypeScript (`.tsx`) nombrados en `PascalCase`.
- **Funciones y Servicios:** Nombrados en `camelCase`.
- **Tipos e Interfaces:** Definidos en `src/types/index.ts` usando `PascalCase`.
- **Estilos:** Declarados con variables CSS nativas (`var(--color-bg-base)`, `var(--color-drift)`, etc.).
