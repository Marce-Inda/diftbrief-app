# Requirements - Role Content Filtering

## Overview
Fix the role-based content filtering in DriftBrief so that toggling between "Vista SOC" and "Vista CISO" dynamically changes the displayed content sections.

## Requirements

### REQ-1: SOC View Content
**WHEN** the user activates the SOC role (activeRole === 'soc')
**THE SYSTEM SHALL** display:
- DriftBanner with a technical framing headline
- "Nuevos IOCs Detectados" card (Hashes, IPs C2, Domains)
- "Nuevos Hechos Confirmados" card
- "Giros de Confianza" card (if any)
- "Acciones Recomendadas (SOC)" section
- "Briefing SOC" export panel

### REQ-2: CISO View Content
**WHEN** the user activates the CISO role (activeRole === 'ciso')
**THE SYSTEM SHALL** display:
- DriftBanner with an executive/strategic framing headline
- "Decisión Urgente Requerida" card (prominently displayed)
- "Impacto Institucional / Reputacional" card (severity change + justification)
- "Acciones Recomendadas (CISO)" section
- "Briefing CISO" export panel

### REQ-3: Smooth Transition
**WHEN** the user clicks a role button
**THE SYSTEM SHALL** smoothly transition the content with a CSS opacity fade animation.

### REQ-4: No Breaking Changes
**THE SYSTEM SHALL** maintain backward compatibility with existing component interfaces, using only new optional props where needed.
