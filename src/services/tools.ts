/**
 * @fileoverview Módulo de herramientas simuladas (MCP Tool Calling - Phase 4).
 * Exporta funciones async que simulan llamadas a servicios externos de threat intelligence
 * y precedentes regulatorios, retornando datos estructurados tras un delay simulado.
 * Las funciones son stateless y no requieren dependencias externas.
 */

/** Result from the threat intelligence tool */
export interface ThreatIntelligenceResult {
  /** Threat score descriptor or malware family classification */
  reputation: string;
  /** Campaign name attribution */
  campaign: string;
  /** Recommended containment action */
  action_recommended: string;
}

/** Result from the regulatory precedents tool */
export interface RegulatoryPrecedentResult {
  /** Maximum financial penalty description */
  max_penalty: string;
  /** Real enforcement case with entity name and fine amount */
  recent_fine_example: string;
  /** Mandatory breach notification timeframe */
  notification_deadline: string;
}

// ─── Regex Patterns for IOC Classification ────────────────────────────────────

/** Matches IPv4 dotted-decimal format (e.g., 192.168.1.1) */
const IPV4_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/** Matches hexadecimal strings of exactly 32, 40, or 64 characters (MD5, SHA1, SHA256) */
const HASH_REGEX = /^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$|^[a-fA-F0-9]{64}$/;

// ─── Simulated Delay ──────────────────────────────────────────────────────────

/**
 * Simulates network latency with a random delay between 400-600ms.
 * @returns Promise that resolves after the simulated delay
 */
function simulateDelay(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 400 + Math.random() * 200));
}

// ─── Threat Intelligence Tool ─────────────────────────────────────────────────

/**
 * Simulates a threat intelligence lookup for a given IOC.
 * Returns classification based on IOC type (IP, hash, or unknown).
 * @param ioc - Indicator of Compromise value
 * @returns Structured threat intel result after 400-600ms simulated delay
 */
export async function queryThreatIntelligence(ioc: string): Promise<ThreatIntelligenceResult> {
  await simulateDelay();

  // Empty or whitespace-only input
  if (!ioc || ioc.trim().length === 0) {
    return {
      reputation: 'unknown',
      campaign: 'none',
      action_recommended: 'no action',
    };
  }

  const trimmedIoc = ioc.trim();

  // IPv4 address detection
  if (IPV4_REGEX.test(trimmedIoc)) {
    return {
      reputation: 'high-threat: known C2 infrastructure (score 87/100)',
      campaign: 'APT-29 Cozy Bear',
      action_recommended: 'block at perimeter firewall and flag for SOC review',
    };
  }

  // Hash detection (MD5/SHA1/SHA256)
  if (HASH_REGEX.test(trimmedIoc)) {
    return {
      reputation: 'malware-family: X-Agent/Sofacy dropper variant',
      campaign: 'Operation DarkPulse',
      action_recommended: 'isolate affected endpoints and initiate forensic imaging',
    };
  }

  // Unknown/other IOC type
  return {
    reputation: 'low-confidence: unverified indicator',
    campaign: 'unattributed',
    action_recommended: 'add to monitoring watchlist for 72h observation period',
  };
}

// ─── Regulatory Precedents Tool ───────────────────────────────────────────────

/**
 * Simulates a regulatory precedent lookup for a given regulation.
 * Returns penalty data and enforcement examples for recognized regulations.
 * @param regulation - Regulation identifier (e.g., "GDPR", "NIS2")
 * @returns Structured regulatory precedent result after 400-600ms simulated delay
 */
export async function queryRegulatoryPrecedents(regulation: string): Promise<RegulatoryPrecedentResult> {
  await simulateDelay();

  // Empty string input
  if (!regulation || regulation.trim().length === 0) {
    return {
      max_penalty: 'no regulation specified',
      recent_fine_example: 'no regulation specified',
      notification_deadline: 'no regulation specified',
    };
  }

  const normalizedRegulation = regulation.trim().toUpperCase();

  // GDPR lookup
  if (normalizedRegulation === 'GDPR') {
    return {
      max_penalty: 'Up to €20 million or 4% of annual global turnover, whichever is higher',
      recent_fine_example: 'Meta Platforms Ireland fined €1.2 billion (May 2023) for unlawful data transfers to the US',
      notification_deadline: '72 hours from breach discovery to supervisory authority notification',
    };
  }

  // NIS2 lookup
  if (normalizedRegulation === 'NIS2') {
    return {
      max_penalty: 'Up to €10 million or 2% of annual global turnover for essential entities',
      recent_fine_example: 'Deutsche Telekom fined €900,000 (2024) for failure to report significant incident within deadline',
      notification_deadline: '24 hours early warning, 72 hours full incident notification to CSIRT',
    };
  }

  // Unrecognized regulation
  return {
    max_penalty: 'specific penalty data unavailable for this regulation',
    recent_fine_example: 'no precedent data exists for the given regulation',
    notification_deadline: 'notification deadline unspecified for this regulation',
  };
}
