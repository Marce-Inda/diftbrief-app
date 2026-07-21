---
name: driftbrief-agent
description: Specialized Kiro skill for analyzing cybersecurity incident snapshot drift, computing structured deltas, and generating role-tailored briefings for SOC and CISO.
---

# DriftBrief Agent - Specialized Incident Drift Skill

## Overview
This skill provides custom agent intelligence for **DriftBrief**. Given two sequential incident snapshots (`previousSnapshot` and `currentSnapshot`), this skill computes structured deltas (drift) and formulates dual-audience incident briefings.

## Execution Workflow

### 1. Delta Detection (Deterministic Layer)
Compare `previousSnapshot` vs `currentSnapshot` to calculate:
- **Newly Confirmed Facts:** Items present in `currentSnapshot.factsConfirmed` but absent in `previousSnapshot.factsConfirmed`.
- **Severity Change:** Map transition (e.g., `medium` → `high`).
- **Confidence Shift:** Map transition (e.g., `probable` → `confirmed`).
- **Discarded Assumptions:** Items in `previousSnapshot.activeHypotheses` that appear in `currentSnapshot.dismissedHypotheses`.
- **Emerging Risks & Asset Impact:** Newly affected systems or business risks.

### 2. Role-Based Framing

#### SOC View Framing (Technical & Containment Priority)
- **Primary Focus:** Technical IOCs, malware binaries, network exfiltration, log preservation, and containment actions.
- **Tone:** Precise, technical, forensic, directive.
- **Action Pattern:** "Isolate [asset]", "Preserve logs from [source]", "Analyze [binary]".

#### CISO View Framing (Executive & Institutional Risk Priority)
- **Primary Focus:** Institutional exposure, reputational impact, regulatory compliance deadlines, communication strategy, and strategic decisions.
- **Tone:** Executive, high-level, impact-focused, strategic.
- **Action Pattern:** "Initiate crisis team", "Prepare public disclosure posture", "Coordinate legal assessment".

### 3. Output Generation Rule
Always format output adhering to the `Drift` schema defined in `.agents/AGENTS.md`. Ensure that the `urgentDecision` property highlights the single most critical decision demanded by the shift between snapshots.
