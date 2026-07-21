# DriftBrief

## Resumen del Producto

**DriftBrief** es una herramienta y agente especializado para respuesta a incidentes de ciberseguridad. En lugar de generar resúmenes estáticos globales, detecta el **drift (qué cambió)** entre dos snapshots sucesivos de un mismo incidente (A → B y B → C) y genera briefings accionables adaptados por rol (**SOC** vs **CISO**).

## Tagline

> "Understand what changed before deciding what to do next."

## Usuarios Objetivo

- **Usuario Primario (SOC / Respondedor Técnico):** Necesita entender la nueva evidencia, IOCs, binarios de malware, tráfico de red, preservación forense y acciones operativas de contención.
- **Usuario Secundario (CISO / Ejecutivo):** Necesita entender la evolución de la exposición del negocio, riesgos reputacionales y regulatorios, plazos de comunicación pública y decisiones estratégicas urgentes.

## Problema que Resuelve

Durante una crisis de ciberseguridad o traspaso de turno (handoff), se pierde valioso tiempo repitiendo contexto general en vez de enfocar la atención en **qué cambió**, por qué es grave ahora y **qué decisión exige intervención inmediata**.

## Caso Demo (MVP)

Un escenario ficticio de alta complejidad inspirado en una interferencia contra la integridad electoral:

- **Snapshot A:** Inconsistencias en base de datos del padrón (anomalía técnica inicial).
- **Snapshot B:** Presencia confirmada de malware X-Agent y exfiltración de datos saliente.
- **Snapshot C:** Crisis institucional, presión sobre certificación oficial y decisión de comunicación pública.
