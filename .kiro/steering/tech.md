# Technical Specifications - DriftBrief
## Stack Tecnológico
- **Frontend Framework:** React + Vite + TypeScript.
- **Estilos:** Vanilla CSS con CSS Variables de Design Tokens (definidas en `src/styles/tokens.css`).
- **Agente de IA / Motor:** Arquitectura híbrida:
  - **Capa Determinista:** `src/services/driftComparator.ts` (calcula deltas exactos y proveerá fallback si no hay API).
  - **Capa IA (Opcional/Gratuita):** `src/services/agentService.ts` usando API gratuita de Google Gemini (`@google/genai`) o Groq.
- **Plataforma de Despliegue:** Vercel, Netlify o Cloudflare Pages (Free tier, pública URL sin tarjeta bancaria).
## Design System Tokens
- **Background Base:** `#0F1318`
- **Surface / Panel:** `#161C22`
- **Surface Elevated:** `#1D252D`
- **Border Subtle:** `#2A333D`
- **Text Primary:** `#E8EEF5`
- **Text Secondary:** `#A8B3BF`
- **Text Muted:** `#7E8A97`
### Colores Funcionales
- **Drift / Cambio Detectado:** `#5BC0EB` (Cian)
- **Confirmado:** `#3FB950` (Verde)
- **Probable:** `#F5A524` (Naranja)
- **Crítico / Alerta:** `#F85149` (Rojo)
- **Decisión Requerida:** `#FFD166` (Ámbar/Amarillo)
## Comandos Principales
- `npm run dev`: Inicia el servidor de desarrollo local.
- `npm run build`: Compila TypeScript y genera los archivos estáticos de producción.
- `npm run preview`: Sirve localmente la build de producción.


