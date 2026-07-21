# Definition of Done (DoD) - DriftBrief
## Lista de Comprobación para Considerar una Tarea "TERMINADA"
Para que el agente o desarrollador marque una tarea o iteración como completada, debe cumplir **estrictamente** con estos 5 puntos:
1. **Criterios EARS:** Se verifican y cumplen todos los requerimientos especificados en `ears-acceptance-criteria.md`.
2. **TypeScript & Calidad de Código:** Compilación `npm run build` sin errores de tipo, cero uso del tipo `any` y JSDoc en funciones exportadas.
3. **Resiliencia & Chaos Testing:** La app responde correctamente incluso cuando la API de IA falla o el usuario interactúa velozmente entre estados.
4. **Seguridad Auditada:** No hay claves de API ni datos sensibles expuestos en el código fuente (verificado por los Hooks de Kiro).
5. **Revisión Humana Aprobada:** El resultado visual y funcional ha sido revisado y validado en el navegador por el desarrollador.

