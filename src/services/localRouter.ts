/**
 * @fileoverview Enrutador local de contexto basado en búsqueda difusa (Fuse.js).
 * Reemplaza la llamada LLM del Agente Enrutador eliminando latencia de red
 * y consumo de tokens, manteniendo selección precisa de regulaciones y tácticas MITRE.
 *
 * Estrategia de matching:
 * 1. Keyword matching directo (prioridad máxima, O(1))
 * 2. Búsqueda difusa con Fuse.js como fallback (fuzzy match)
 * 3. IDs por defecto si no hay coincidencia
 */

import Fuse from 'fuse.js';
import type { Drift, Regulation, MitreAttackTactic, IncidentPlaybook } from '../types';
import { SECURITY_KNOWLEDGE_BASE } from './knowledgeBase';

/** Contexto seleccionado por el Enrutador Local */
export interface LocalRouterContext {
  /** Regulación seleccionada como más relevante */
  regulation: Regulation;
  /** Táctica MITRE seleccionada como más relevante */
  mitreTactic: MitreAttackTactic;
  /** Playbooks aplicables */
  playbooks: IncidentPlaybook[];
}

/** IDs por defecto cuando no hay coincidencia */
const DEFAULT_REGULATION_ID = 'nis2';
const DEFAULT_MITRE_ID = 'TA0010';

// ─── Keyword Maps (Matching Directo) ──────────────────────────────────────────

/**
 * Mapa de keywords → ID de regulación.
 * Las keywords están normalizadas en minúsculas.
 */
const REGULATION_KEYWORDS: ReadonlyArray<{ keywords: string[]; regulationId: string }> = [
  {
    keywords: [
      'datos personales', 'pii', 'personal data', 'gdpr', 'protección de datos',
      'interesados', 'consentimiento', 'dato personal', 'privacy', 'privacidad',
    ],
    regulationId: 'gdpr',
  },
  {
    keywords: [
      'salud', 'health', 'hipaa', 'phi', 'hospital', 'paciente', 'médico',
      'clínica', 'historial médico', 'información de salud',
    ],
    regulationId: 'hipaa',
  },
  {
    keywords: [
      'infraestructura crítica', 'critical infrastructure', 'nis2', 'esencial',
      'electoral', 'padrón', 'gobierno', 'institucional', 'servicio esencial',
      'entidad esencial', 'nacional', 'suministro', 'energía', 'transporte',
    ],
    regulationId: 'nis2',
  },
];

/**
 * Mapa de keywords → ID de táctica MITRE ATT&CK.
 * Las keywords están normalizadas en minúsculas.
 */
const MITRE_KEYWORDS: ReadonlyArray<{ keywords: string[]; mitreId: string }> = [
  {
    keywords: [
      'exfiltración', 'exfiltration', 'robo de datos', 'data theft', 'transferencia',
      'salida de datos', 'fuga de datos', 'data leak', 'extracción de datos',
      'c2 channel', 'datos salientes',
    ],
    mitreId: 'TA0010',
  },
  {
    keywords: [
      'movimiento lateral', 'lateral movement', 'pivoting', 'pivot',
      'propagación', 'pass-the-hash', 'rdp', 'remote services', 'smb',
    ],
    mitreId: 'TA0008',
  },
  {
    keywords: [
      'persistencia', 'persistence', 'backdoor', 'web shell', 'acceso persistente',
      'scheduled task', 'tarea programada', 'implante', 'implant',
    ],
    mitreId: 'TA0003',
  },
  {
    keywords: [
      'impacto', 'impact', 'destrucción', 'ransomware', 'cifrado malicioso',
      'defacement', 'manipulación', 'data manipulation', 'integridad',
      'manipulación de datos', 'crisis institucional', 'sabotaje',
    ],
    mitreId: 'TA0040',
  },
];

// ─── Fuse.js Indexes (Fuzzy Fallback) ─────────────────────────────────────────

/** Índice Fuse.js para regulaciones (busca en nombre, scope, jurisdicción) */
const regulationFuse = new Fuse(SECURITY_KNOWLEDGE_BASE.regulations, {
  keys: ['name', 'scope', 'jurisdiction'],
  threshold: 0.3,
  includeScore: true,
});

/** Índice Fuse.js para tácticas MITRE (busca en nombre, descripción, técnicas) */
const mitreFuse = new Fuse(SECURITY_KNOWLEDGE_BASE.frameworks, {
  keys: ['name', 'description', 'commonTechniques'],
  threshold: 0.3,
  includeScore: true,
});

// ─── Funciones de Matching ────────────────────────────────────────────────────

/**
 * Construye un texto de búsqueda consolidado a partir del drift.
 * Normalizado a minúsculas para matching insensible a mayúsculas.
 * Maneja campos undefined/null de forma defensiva para evitar excepciones.
 * @param drift - Drift calculado localmente
 * @returns Texto concatenado con campos relevantes del drift (string vacío si drift es inválido)
 */
function buildSearchText(drift: Drift): string {
  if (!drift) return '';

  const parts: string[] = [];

  if (drift.headline) parts.push(drift.headline);
  if (drift.severityChange?.justification) parts.push(drift.severityChange.justification);
  if (drift.urgentDecision?.title) parts.push(drift.urgentDecision.title);
  if (drift.urgentDecision?.description) parts.push(drift.urgentDecision.description);
  if (drift.urgentDecision?.impact) parts.push(drift.urgentDecision.impact);

  if (Array.isArray(drift.newFacts)) {
    for (const f of drift.newFacts) {
      if (f.description) parts.push(f.description);
    }
  }
  if (Array.isArray(drift.newIOCs)) {
    for (const i of drift.newIOCs) {
      parts.push([i.type, i.value, i.description].filter(Boolean).join(' '));
    }
  }
  if (Array.isArray(drift.confidenceShifts)) {
    for (const s of drift.confidenceShifts) {
      if (s.description) parts.push(s.description);
    }
  }

  return parts.join(' ').toLowerCase();
}

/**
 * Busca coincidencia de regulación por keywords directos.
 * Retorna el primer match encontrado (O(n*m) donde n=reglas, m=keywords).
 * @param searchText - Texto normalizado del drift
 * @returns ID de la regulación o null si no hay match
 */
function matchRegulationByKeyword(searchText: string): string | null {
  for (const entry of REGULATION_KEYWORDS) {
    for (const keyword of entry.keywords) {
      if (searchText.includes(keyword)) {
        return entry.regulationId;
      }
    }
  }
  return null;
}

/**
 * Busca coincidencia de táctica MITRE por keywords directos.
 * @param searchText - Texto normalizado del drift
 * @returns ID de la táctica o null si no hay match
 */
function matchMitreByKeyword(searchText: string): string | null {
  for (const entry of MITRE_KEYWORDS) {
    for (const keyword of entry.keywords) {
      if (searchText.includes(keyword)) {
        return entry.mitreId;
      }
    }
  }
  return null;
}

/**
 * Busca coincidencia de regulación con Fuse.js (fuzzy fallback).
 * Solo acepta resultados con score < 0.4 (alta confianza) para evitar falsos positivos.
 * @param searchText - Texto del drift
 * @returns ID de la regulación mejor rankeada o null
 */
function matchRegulationByFuzzy(searchText: string): string | null {
  const results = regulationFuse.search(searchText.slice(0, 200));
  if (results.length > 0 && results[0].score !== undefined && results[0].score < 0.4) {
    return results[0].item.id;
  }
  return null;
}

/**
 * Busca coincidencia de táctica MITRE con Fuse.js (fuzzy fallback).
 * Solo acepta resultados con score < 0.4 (alta confianza) para evitar falsos positivos.
 * @param searchText - Texto del drift
 * @returns ID de la táctica mejor rankeada o null
 */
function matchMitreByFuzzy(searchText: string): string | null {
  const results = mitreFuse.search(searchText.slice(0, 200));
  if (results.length > 0 && results[0].score !== undefined && results[0].score < 0.4) {
    return results[0].item.id;
  }
  return null;
}

// ─── Enrutador Principal ──────────────────────────────────────────────────────

/**
 * Enruta el contexto del incidente de forma local y síncrona.
 * Estrategia en cascada:
 * 1. Keyword matching directo (más rápido, ~0.1ms)
 * 2. Búsqueda difusa Fuse.js (~1-5ms)
 * 3. Contexto por defecto (NIS2 + Exfiltration)
 *
 * Elimina completamente la latencia de red del enrutador LLM anterior (~1-3s).
 * @param drift - Drift calculado por el motor determinista
 * @returns Contexto seleccionado con regulación, táctica y playbooks
 */
export function routeContextLocally(drift: Drift): LocalRouterContext {
  const searchText = buildSearchText(drift);

  // Guard: si el texto de búsqueda está vacío, retornar contexto por defecto
  if (!searchText) {
    console.warn('[LocalRouter] Drift vacío o inválido, usando contexto por defecto.');
    const regulation = SECURITY_KNOWLEDGE_BASE.regulations.find(r => r.id === DEFAULT_REGULATION_ID)!;
    const mitreTactic = SECURITY_KNOWLEDGE_BASE.frameworks.find(f => f.id === DEFAULT_MITRE_ID)!;
    return { regulation, mitreTactic, playbooks: SECURITY_KNOWLEDGE_BASE.playbooks };
  }

  // Paso 1: Keyword matching directo
  let regulationId = matchRegulationByKeyword(searchText);
  let mitreId = matchMitreByKeyword(searchText);

  // Paso 2: Fuzzy fallback para lo que no matcheó
  if (!regulationId) {
    regulationId = matchRegulationByFuzzy(searchText);
  }
  if (!mitreId) {
    mitreId = matchMitreByFuzzy(searchText);
  }

  // Paso 3: Defaults si todo falla
  if (!regulationId) {
    regulationId = DEFAULT_REGULATION_ID;
  }
  if (!mitreId) {
    mitreId = DEFAULT_MITRE_ID;
  }

  const regulation = SECURITY_KNOWLEDGE_BASE.regulations.find(r => r.id === regulationId)!;
  const mitreTactic = SECURITY_KNOWLEDGE_BASE.frameworks.find(f => f.id === mitreId)!;

  console.info(`[LocalRouter] ✅ Contexto enrutado localmente: ${regulation.name} + ${mitreTactic.name}`);

  return {
    regulation,
    mitreTactic,
    playbooks: SECURITY_KNOWLEDGE_BASE.playbooks,
  };
}
