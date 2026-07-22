/**
 * @fileoverview Property-based tests for queryThreatIntelligence IOC classification.
 * Feature: mcp-tool-calling, Property 1: IOC classification correctness
 * Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { queryThreatIntelligence, queryRegulatoryPrecedents } from '../tools';

// Use fake timers to bypass the 400-600ms simulated delay
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Helper: calls queryThreatIntelligence and advances timers to resolve the delay.
 */
async function callWithTimerAdvance(ioc: string) {
  const promise = queryThreatIntelligence(ioc);
  await vi.advanceTimersByTimeAsync(700);
  return promise;
}

// ─── Custom Generators ────────────────────────────────────────────────────────

/** Generates valid IPv4 addresses (1-3 digit octets separated by dots) */
const ipv4Arb = fc.ipV4();

/** Single hex character arbitrary */
const hexCharArb = fc.constantFrom(
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'a', 'b', 'c', 'd', 'e', 'f', 'A', 'B', 'C', 'D', 'E', 'F',
);

/** Generates hex strings of exactly N characters */
function hexStringOfLength(len: number) {
  return fc.array(hexCharArb, { minLength: len, maxLength: len }).map((chars) => chars.join(''));
}

/** Generates hex strings of exactly 32 characters (MD5 hash) */
const md5Arb = hexStringOfLength(32);

/** Generates hex strings of exactly 40 characters (SHA1 hash) */
const sha1Arb = hexStringOfLength(40);

/** Generates hex strings of exactly 64 characters (SHA256 hash) */
const sha256Arb = hexStringOfLength(64);

/** Generates any valid hash (MD5, SHA1, or SHA256) */
const hashArb = fc.oneof(md5Arb, sha1Arb, sha256Arb);

/** Generates whitespace-only strings (spaces, tabs, newlines) */
const whitespaceCharArb = fc.constantFrom(' ', '\t', '\n');
const whitespaceArb = fc.array(whitespaceCharArb, { minLength: 1, maxLength: 20 }).map((chars) => chars.join(''));

/**
 * Generates "other" strings: non-empty, non-whitespace-only, not an IPv4, not a hex hash.
 * Filters out strings that match IPv4 or hash patterns.
 */
const otherIocArb = fc
  .string({ minLength: 1 })
  .filter((s) => {
    if (s.trim().length === 0) return false;
    const trimmed = s.trim();
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed)) return false;
    if (/^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$|^[a-fA-F0-9]{64}$/.test(trimmed)) return false;
    return true;
  });

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Feature: mcp-tool-calling, Property 1: IOC classification correctness', () => {
  it('IPv4 addresses produce firewall-related actions with non-empty fields', async () => {
    await fc.assert(
      fc.asyncProperty(ipv4Arb, async (ip) => {
        const result = await callWithTimerAdvance(ip);

        // All fields must be non-empty strings
        expect(result.reputation).toBeTruthy();
        expect(result.campaign).toBeTruthy();
        expect(result.action_recommended).toBeTruthy();

        expect(typeof result.reputation).toBe('string');
        expect(typeof result.campaign).toBe('string');
        expect(typeof result.action_recommended).toBe('string');

        // IPv4 produces firewall-related containment action
        expect(result.action_recommended.toLowerCase()).toContain('firewall');
      }),
      { numRuns: 100 },
    );
  });

  it('Hex strings of 32/40/64 chars produce endpoint isolation actions with non-empty fields', async () => {
    await fc.assert(
      fc.asyncProperty(hashArb, async (hash) => {
        const result = await callWithTimerAdvance(hash);

        // All fields must be non-empty strings
        expect(result.reputation).toBeTruthy();
        expect(result.campaign).toBeTruthy();
        expect(result.action_recommended).toBeTruthy();

        expect(typeof result.reputation).toBe('string');
        expect(typeof result.campaign).toBe('string');
        expect(typeof result.action_recommended).toBe('string');

        // Hash produces endpoint isolation action
        expect(result.action_recommended.toLowerCase()).toContain('isolat');
      }),
      { numRuns: 100 },
    );
  });

  it('Whitespace-only strings produce unknown/none/no action', async () => {
    await fc.assert(
      fc.asyncProperty(whitespaceArb, async (ws) => {
        const result = await callWithTimerAdvance(ws);

        expect(result.reputation).toBe('unknown');
        expect(result.campaign).toBe('none');
        expect(result.action_recommended).toBe('no action');
      }),
      { numRuns: 100 },
    );
  });

  it('Empty string produces unknown/none/no action', async () => {
    const result = await callWithTimerAdvance('');

    expect(result.reputation).toBe('unknown');
    expect(result.campaign).toBe('none');
    expect(result.action_recommended).toBe('no action');
  });

  it('Other non-empty strings produce campaign="unattributed" with monitoring action', async () => {
    await fc.assert(
      fc.asyncProperty(otherIocArb, async (ioc) => {
        const result = await callWithTimerAdvance(ioc);

        // All fields must be non-empty strings
        expect(result.reputation).toBeTruthy();
        expect(result.campaign).toBeTruthy();
        expect(result.action_recommended).toBeTruthy();

        expect(typeof result.reputation).toBe('string');
        expect(typeof result.campaign).toBe('string');
        expect(typeof result.action_recommended).toBe('string');

        // Other IOCs produce unattributed campaign with monitoring action
        expect(result.campaign).toBe('unattributed');
        expect(result.action_recommended.toLowerCase()).toContain('monitor');
      }),
      { numRuns: 100 },
    );
  });

  it('All IOC types return result with exactly three required fields', async () => {
    const anyIocArb = fc.oneof(
      ipv4Arb,
      hashArb,
      whitespaceArb,
      otherIocArb,
      fc.constant(''),
    );

    await fc.assert(
      fc.asyncProperty(anyIocArb, async (ioc) => {
        const result = await callWithTimerAdvance(ioc);

        // Result must have exactly the three required fields as strings
        expect(Object.keys(result)).toHaveLength(3);
        expect(result).toHaveProperty('reputation');
        expect(result).toHaveProperty('campaign');
        expect(result).toHaveProperty('action_recommended');

        expect(typeof result.reputation).toBe('string');
        expect(typeof result.campaign).toBe('string');
        expect(typeof result.action_recommended).toBe('string');

        // All fields must be non-empty
        expect(result.reputation.length).toBeGreaterThan(0);
        expect(result.campaign.length).toBeGreaterThan(0);
        expect(result.action_recommended.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 2: Unrecognized regulation returns unavailable response ─────────
// Feature: mcp-tool-calling, Property 2: Unrecognized regulation returns unavailable response
// Validates: Requirements 2.3

/**
 * Helper: calls queryRegulatoryPrecedents and advances timers to resolve the delay.
 */
async function callRegWithTimerAdvance(regulation: string) {
  const promise = queryRegulatoryPrecedents(regulation);
  await vi.advanceTimersByTimeAsync(700);
  return promise;
}

describe('Feature: mcp-tool-calling, Property 2: Unrecognized regulation returns unavailable response', () => {
  it('for any non-empty string not in {"GDPR", "NIS2"} (case-insensitive), returns unavailable response', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string().filter(s => s.trim().length > 0 && !['GDPR', 'NIS2'].includes(s.trim().toUpperCase())),
        async (regulation) => {
          const result = await callRegWithTimerAdvance(regulation);

          expect(result.max_penalty).toBe('specific penalty data unavailable for this regulation');
          expect(result.recent_fine_example).toBe('no precedent data exists for the given regulation');
          expect(result.notification_deadline).toBe('notification deadline unspecified for this regulation');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Validates: Requirements 2.3
   * Ensures the property holds for various edge-case unrecognized strings
   */
  it('for strings that look similar to recognized regulations but differ, returns unavailable response', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('GDPR2', 'NIS', 'NIS3', 'gdprx', 'nis2extra', 'HIPAA', 'SOX', 'PCI-DSS', 'CCPA'),
        async (regulation) => {
          const result = await callRegWithTimerAdvance(regulation);

          expect(result.max_penalty).toBe('specific penalty data unavailable for this regulation');
          expect(result.recent_fine_example).toBe('no precedent data exists for the given regulation');
          expect(result.notification_deadline).toBe('notification deadline unspecified for this regulation');
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Unit Tests: Recognized regulations and edge cases ────────────────────────
// Validates: Requirements 2.2, 2.4

describe('queryRegulatoryPrecedents - Unit Tests', () => {
  it('returns correct data for "GDPR" (max_penalty contains "€20 million", notification_deadline contains "72 hours")', async () => {
    const result = await callRegWithTimerAdvance('GDPR');

    expect(result.max_penalty).toContain('€20 million');
    expect(result.notification_deadline).toContain('72 hours');
    expect(result.recent_fine_example).toBeTruthy();
  });

  it('returns correct data for "NIS2" (max_penalty contains "€10 million", notification_deadline contains "24 hours")', async () => {
    const result = await callRegWithTimerAdvance('NIS2');

    expect(result.max_penalty).toContain('€10 million');
    expect(result.notification_deadline).toContain('24 hours');
    expect(result.recent_fine_example).toBeTruthy();
  });

  it('returns same data for "gdpr" (lowercase) as "GDPR" (case-insensitive)', async () => {
    const resultLower = await callRegWithTimerAdvance('gdpr');
    const resultUpper = await callRegWithTimerAdvance('GDPR');

    expect(resultLower).toEqual(resultUpper);
  });

  it('returns "no regulation specified" for all fields when given empty string', async () => {
    const result = await callRegWithTimerAdvance('');

    expect(result.max_penalty).toBe('no regulation specified');
    expect(result.recent_fine_example).toBe('no regulation specified');
    expect(result.notification_deadline).toBe('no regulation specified');
  });

  it('returns "no regulation specified" for all fields when given whitespace-only string " "', async () => {
    const result = await callRegWithTimerAdvance('   ');

    expect(result.max_penalty).toBe('no regulation specified');
    expect(result.recent_fine_example).toBe('no regulation specified');
    expect(result.notification_deadline).toBe('no regulation specified');
  });
});
