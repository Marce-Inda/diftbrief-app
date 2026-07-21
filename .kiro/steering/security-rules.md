# Security Rules - DriftBrief
## Reglas Estrictas de Seguridad
### 1. Manejo de Secretos y API Keys
- **Prohibido Hardcodear Secretos:** Ninguna clave de API (Google Gemini, Groq, etc.) o credencial debe incluirse directamente en el código fuente.
- **Variables de Entorno:** Utilizar el prefijo de Vite `VITE_` (ej. `import.meta.env.VITE_GEMINI_API_KEY`).
- **Control de Versiones:** Los archivos `.env` y `.env.local` deben estar incluidos obligatoriamente en `.gitignore`.
### 2. Privacidad y Registros (Logging)
- **Cero PII o Secretos en Logs:** No imprimir en `console.log` credenciales, claves de API, tokens de autorización ni datos sensibles de usuarios en entornos de producción.
### 3. Validación de Entradas de Datos (Input Sanitation)
- Validar las estructuras JSON recibidas (`Snapshot` y `DriftRequest`) antes de procesarlas o renderizarlas.
- Prevenir vulnerabilidades XSS sanitizando textos dinámicos insertados en la interfaz de usuario.

