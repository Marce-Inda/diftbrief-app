---
name: driftbrief-reviewer
description: Specialized Kiro reviewer skill for evaluating code quality, EARS criteria compliance, security safeguards, and fallback resilience in DriftBrief.
---

# DriftBrief Code & Quality Reviewer Skill

## Overview
This skill operates as a read-only Code Reviewer agent for **DriftBrief**. It audits code changes before PR integration or final delivery according to Kiro Spec-Driven Validation principles.

## Audit Dimensions

### 1. EARS Specification Alignment
- Check that new components or functions fulfill the exact `WHEN... THE SYSTEM SHALL...` statements in `.kiro/steering/ears-acceptance-criteria.md`.

### 2. Code Quality & Style
- Verify strict TypeScript typing (no implicit or explicit `any`).
- Ensure all exported functions contain JSDoc annotations.
- Verify function length is under 40 lines.
- Ensure no empty `catch` blocks exist.

### 3. Security Audit
- Confirm no hardcoded API keys (Gemini, Groq) or tokens exist in source files.
- Verify environment variables use `VITE_` prefix and are gitignored.

### 4. Chaos & Resilience Check
- Verify that `src/services/driftComparator.ts` handles corrupt snapshot inputs gracefully.
- Ensure `src/services/agentService.ts` seamlessly falls back to the deterministic output when the LLM service times out or errors.

## Review Summary Output
Provide a concise Markdown review report structured as:
- **Status:** APPROVED | REJECTED
- **EARS Compliance:** Yes/No
- **Security Check:** Passed/Failed
- **Resilience Test:** Passed/Failed
- **Required Fixes:** Bullet points of actionable fixes.
