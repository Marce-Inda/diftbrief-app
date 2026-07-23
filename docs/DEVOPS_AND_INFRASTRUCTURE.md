# DevOps & Infrastructure — DriftBrief

> Documento de gobernanza sobre el entorno de testing, CI/CD y decisiones de despliegue.

---

## 1. Stack de Testing

### Framework: Vitest

| Aspecto | Configuración |
|---------|--------------|
| Runner | Vitest 4.x (compatible nativo con Vite) |
| Entorno DOM | jsdom 29.x |
| Testing Library | @testing-library/react 16.x + @testing-library/dom 10.x |
| Property-Based Testing | fast-check 4.x |

### Comandos

```bash
# Ejecutar tests una vez
npx vitest --run

# Ejecutar tests en modo watch (desarrollo)
npx vitest
```


### Estrategia de Testing

| Tipo | Herramienta | Cobertura |
|------|------------|-----------|
| Unit Tests | Vitest + Testing Library | Hooks (`useTelemetryToggle`), servicios |
| Property-Based Tests | fast-check + Vitest | `driftComparator`, `tools.ts`, `TelemetryPanel` |
| Integration Tests | Vitest + jsdom | Flujo completo del agente (fallback chain) |

### Property-Based Testing (PBT)

DriftBrief usa PBT para verificar propiedades formales de correctitud:

**Archivos de PBT existentes:**
- `src/hooks/__tests__/useTelemetryToggle.property.test.ts` — Propiedades del dual-gate
- `src/components/__tests__/TelemetryPanel.property.test.tsx` — Invariantes de renderizado
- `src/services/__tests__/tools.property.test.ts` — Propiedades de herramientas simuladas

**Propiedades verificadas (ejemplos):**
- El panel de telemetría nunca se renderiza si `VITE_SHOW_TELEMETRY !== "true"`.
- `queryThreatIntelligence` siempre retorna un objeto válido para cualquier string input.
- El motor determinista produce un `Drift` válido para cualquier par de snapshots válidos.

---

## 2. Entorno de Desarrollo

### Build System

| Herramienta | Versión | Propósito |
|------------|---------|-----------|
| Vite | 8.x | Bundler y dev server (HMR instantáneo) |
| TypeScript | 6.x | Type checking estricto (cero `any`) |
| ESLint | 10.x | Linting con plugins react-hooks y react-refresh |

### Comandos principales

```bash
npm run dev      # Servidor de desarrollo con HMR
npm run build    # tsc -b && vite build (type check + bundle)
npm run lint     # ESLint sobre todo el proyecto
npm run preview  # Sirve la build de producción localmente
```

### Política de TypeScript Estricto

- Compilación con `tsc -b` como paso obligatorio antes del bundle.
- Cero uso del tipo `any` (verificado por hooks automáticos).
- Todas las funciones exportadas deben tener JSDoc con `@param` y `@returns`.

---

## 3. Decisiones de Despliegue

### Plataforma objetivo

| Opción | Tier | Requisitos |
|--------|------|-----------|
| Vercel | Free | Repositorio GitHub público |
| Netlify | Free | Repositorio GitHub público |
| Cloudflare Pages | Free | Repositorio GitHub público |

### Características del deploy

- **SPA estática**: El output de `vite build` es HTML + JS + CSS estático.
- **Sin backend**: No hay servidor, funciones serverless ni base de datos.
- **Variables de entorno en plataforma**: Las API keys se configuran en el dashboard del proveedor, nunca en el repositorio.
- **Build command**: `npm run build`
- **Output directory**: `dist/`

### Política de ramas

| Rama | Propósito | Deploy |
|------|-----------|--------|
| `main` | Código estable, listo para producción | Auto-deploy a producción |
| `feature/*` | Desarrollo de iteraciones | Preview deploys (opcional) |

---

## 4. Hooks de Automatización del Agente (Kiro)

### Hooks activos en el proyecto

| Hook | Evento | Función |
|------|--------|---------|
| PostFileSave Quality & Security Check | `postToolUse: write` | Verifica cero `any`, catch vacíos y API keys |
| Secret Scanner on Agent Stop | `agentStop` | Escaneo de credenciales al cerrar turno |
| Snapshot JSON Schema Validator | `postToolUse: write` | Valida estructura de `snapshots.json` |

### Impacto en calidad

Estos hooks actúan como **CI local integrado en el agente**, detectando problemas antes de que lleguen a un commit:
- Secrets detectados → el agente reporta archivo y línea.
- Tipos `any` → el agente reporta violación de estándares.
- Schema inválido → el agente reporta campos faltantes.

---

## 5. Dependencias y Gestión de Paquetes

### Política de dependencias

- **Lock file**: `package-lock.json` siempre comiteado.
- **Dependencias mínimas**: Solo se agregan paquetes estrictamente necesarios.
- **Versiones fijadas**: Las dependencias de producción usan versiones exactas o rangos menores (`^`).

### Dependencias de producción (runtime)

| Paquete | Versión | Propósito |
|---------|---------|-----------|
| react | ^19.2.7 | UI framework |
| react-dom | ^19.2.7 | DOM renderer |
| fuse.js | 7.5.0 | Búsqueda difusa para enrutador local |

### Dependencias de desarrollo

| Paquete | Propósito |
|---------|-----------|
| vitest | Test runner |
| fast-check | Property-based testing |
| @testing-library/react | Testing utilities |
| typescript | Type system |
| eslint | Linting |
| jsdom | DOM simulation en tests |

---

## Historial de Decisiones de Infraestructura

| Fecha | Decisión | Justificación |
|-------|----------|---------------|
| 2025-07 | Vitest sobre Jest | Integración nativa con Vite, mismo transform pipeline |
| 2025-07 | fast-check para PBT | Estándar de la industria para property-based testing en JS/TS |
| 2025-07 | Deploy estático (SPA) | Sin backend = sin superficie de ataque server-side |
| 2025-07 | fuse.js para routing local | Elimina dependencia de LLM en enrutamiento (cero latencia, cero costo) |
| 2025-07 | Hooks de Kiro como CI local | Detección temprana de problemas sin configurar pipeline externo |
