# Workflow Rules - DriftBrief
## Reglas de Flujo de Trabajo y Commits
### 1. Commits Estandarizados (Conventional Commits)
Todos los commits en Git deben seguir el formato estandarizado:
- `feat:` Nuevas características (ej. `feat: implement role switcher component`).
- `fix:` Corrección de errores (ej. `fix: correct severity delta calculation`).
- `docs:` Documentación (ej. `docs: update Kiro steering rules`).
- `style:` Cambios de diseño/CSS sin alterar lógica (ej. `style: adjust cyan drift badge color`).
- `refactor:` Refactorización de código.
- `chore:` Tareas de mantenimiento o configuración.
### 2. Commits Atómicos por Iteración
- Cada commit debe representar un cambio atómico y funcional.
- Prohibido realizar "mega-commits" con múltiples características no relacionadas.
### 3. Desarrollo por Ramas (Feature Branches)
- La rama `main` debe mantenerse siempre con código estable y listo para desplegar.
- El desarrollo de iteraciones se realizará en ramas secundarias (ej. `feature/walking-skeleton`, `feature/ui-system`).

