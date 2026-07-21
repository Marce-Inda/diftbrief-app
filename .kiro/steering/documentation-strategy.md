# Estrategia de Documentación - DriftBrief (Hackathon Kiro)
## Reglas de Documentación: Qué, Cuándo y Cómo
Para que la documentación sea un factor decisivo de victoria ante los jueces del hackathon, aplicaremos una línea clara y estructurada de documentación continua:
---
## 1. Documentación en Código (Inline & JSDoc)
- **CUÁNDO:** En el momento exacto en que se crea o modifica cualquier función utilitaria, servicio o componente React en `src/`.
- **CÓMO:** Obligatoriedad de bloques JSDoc `@param` y `@returns` en funciones exportadas (verificado automáticamente por los Hooks de Kiro).
---
## 2. Documentación por Iteración (Trazabilidad & Auditoría)
- **CUÁNDO:** Al finalizar cada una de las 4 iteraciones del proyecto (Iteración 1, 2, 3 y 4).
- **CÓMO:**
  1. Registrar el progreso incremental en `CHANGELOG.md`.
  2. Ejecutar `/chat save` en Kiro y guardar el registro de auditoría en `docs/audit-logs/`.
  3. Garantizar que la arquitectura en `docs/ARCHITECTURE.md` permanezca actualizada.
---
## 3. Estructura del `README.md` Estelar (Entregable Principal de GitHub)
El `README.md` del repositorio debe organizarse en 6 secciones estratégicas:
1. **Header & Tagline:** Título, badge de hackathon Kiro y la frase *"Understand what changed before deciding what to do next."*
2. **El Reto & La Solución:** Explicación visual del problema de pérdida de contexto en handoffs de ciberseguridad y cómo DriftBrief resuelve el delta entre snapshots (A → B → C).
3. **Diferenciación de Roles (SOC vs CISO):** Capturas de pantalla o diagramas que muestren la doble lectura técnica vs ejecutiva.
4. **Desarrollado con Kiro & Superpoderes (Sección Destacada):**
   - **Steering:** Explicación de los 8 archivos de memoria y reglas EARS.
   - **Hooks Automáticos:** Demostración de los 4 hooks (`PostFileSave`, `Stop` Secret Scanner, `PreToolUse` security guard).
   - **Custom Skills:** Explicación de `driftbrief-agent` y `driftbrief-reviewer`.
   - **Optimización & Costos:** Uso de `.kiroignore` y Spec-Driven Development para el ahorro masivo de tokens.
5. **Arquitectura Técnica & Enlace a Live Demo:** Enlace a la app pública desplegada en Vercel/Netlify.
6. **Instrucciones de Ejecución Local:** Comandos `npm install` y `npm run dev`.

