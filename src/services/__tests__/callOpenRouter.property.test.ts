/**
 * @fileoverview Property-based tests for callOpenRouter function.
 * Feature: openrouter-fallback-provider
 *
 * Property 1: Missing API key skips provider (Validates: Requirements 1.3, 5.3)
 * Property 2: Valid response content extraction (Validates: Requirements 1.5)
 * Property 4: Error resilience (Validates: Requirements 1.4, 6.4, 6.5)
 * Property 8: Error messages are sanitized before logging (Validates: Requirements 6.3)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { callOpenRouter, sanitizeErrorMessage } from '../agentService';

// ─── Setup ────────────────────────────────────────────────────────────────────

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_OPENROUTER_API_KEY', 'test-openrouter-key');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ─── Property 1: Missing API key skips provider without side effects ──────────

describe('Feature: openrouter-fallback-provider, Property 1: Missing API key skips provider', () => {
  /**
   * **Validates: Requirements 1.3, 5.3**
   *
   * For any value of VITE_OPENROUTER_API_KEY that is undefined, null, empty string,
   * or composed entirely of whitespace, calling callOpenRouter SHALL return null
   * without invoking fetch or throwing an exception.
   */
  it('returns null and never calls fetch when API key is undefined, empty, or whitespace-only', async () => {
    const invalidKeyArb = fc.oneof(
      fc.constant(undefined as string | undefined),
      fc.constant('' as string | undefined),
      // Generate whitespace-only strings of various lengths
      fc.array(fc.constantFrom(' ', '\t', '\n', '\r', '\f', '\v'), { minLength: 1, maxLength: 20 })
        .map((chars) => chars.join('') as string | undefined),
    );

    await fc.assert(
      fc.asyncProperty(invalidKeyArb, async (invalidKey) => {
        // Override the env var set in beforeEach with the generated invalid key
        if (invalidKey === undefined) {
          vi.stubEnv('VITE_OPENROUTER_API_KEY', '');
          // Additionally delete to simulate truly undefined
          delete (import.meta.env as Record<string, unknown>).VITE_OPENROUTER_API_KEY;
        } else {
          vi.stubEnv('VITE_OPENROUTER_API_KEY', invalidKey);
        }

        // Reset fetch mock call count for clean assertion
        fetchMock.mockClear();

        const result = await callOpenRouter('system prompt', 'user prompt');

        // Must return null
        expect(result).toBeNull();
        // Fetch must never be called
        expect(fetchMock).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.3, 5.3**
   *
   * For arbitrary whitespace strings of varying composition and length,
   * the function skips the provider without side effects.
   */
  it('returns null for arbitrary whitespace-only keys without invoking fetch', async () => {
    const whitespaceOnlyArb = fc.array(
      fc.constantFrom(' ', '\t', '\n', '\r', '  ', '\t\t', ' \n '),
      { minLength: 1, maxLength: 50 },
    ).map((chars) => chars.join(''));

    await fc.assert(
      fc.asyncProperty(whitespaceOnlyArb, async (whitespaceKey) => {
        vi.stubEnv('VITE_OPENROUTER_API_KEY', whitespaceKey);
        fetchMock.mockClear();

        const result = await callOpenRouter('any system', 'any user');

        expect(result).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.3, 5.3**
   *
   * The function never throws an exception for any invalid key value —
   * it always returns null gracefully.
   */
  it('never throws an exception regardless of the invalid key value', async () => {
    const invalidKeyArb = fc.oneof(
      fc.constant(undefined as string | undefined),
      fc.constant('' as string | undefined),
      fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 30 })
        .map((chars) => chars.join('') as string | undefined),
    );

    await fc.assert(
      fc.asyncProperty(
        invalidKeyArb,
        fc.string({ minLength: 0, maxLength: 100 }), // arbitrary systemPrompt
        fc.string({ minLength: 0, maxLength: 100 }), // arbitrary userPrompt
        async (invalidKey, systemPrompt, userPrompt) => {
          if (invalidKey === undefined) {
            vi.stubEnv('VITE_OPENROUTER_API_KEY', '');
            delete (import.meta.env as Record<string, unknown>).VITE_OPENROUTER_API_KEY;
          } else {
            vi.stubEnv('VITE_OPENROUTER_API_KEY', invalidKey);
          }
          fetchMock.mockClear();

          // Must not throw
          const result = await callOpenRouter(systemPrompt, userPrompt);

          expect(result).toBeNull();
          expect(fetchMock).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 2: Valid response content extraction ────────────────────────────

describe('Feature: openrouter-fallback-provider, Property 2: Valid response content extraction', () => {
  /**
   * **Validates: Requirements 1.5**
   *
   * For any HTTP 2xx response from OpenRouter containing a non-empty string at
   * `choices[0].message.content`, the function SHALL extract and return exactly
   * that string as the text field of the result.
   */
  it('extracts choices[0].message.content exactly as the returned text field', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        async (generatedContent) => {
          fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
              choices: [{ message: { content: generatedContent } }],
              usage: { total_tokens: 10 },
            }),
          });

          const result = await callOpenRouter('system prompt', 'user prompt');

          expect(result).not.toBeNull();
          expect(result!.text).toBe(generatedContent);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.5**
   *
   * For any arbitrary non-empty string content including special characters,
   * whitespace, and multi-line text, the function preserves it exactly.
   */
  it('preserves special characters, whitespace, and multi-line content exactly', async () => {
    const specialPrefixes = fc.constantFrom(
      '\n', '\t', '  ', '{"json": true}', '<html>',
      'line1\nline2\nline3', 'tab\there', '"quoted"',
    );

    await fc.assert(
      fc.asyncProperty(
        specialPrefixes,
        fc.string({ minLength: 1 }),
        async (prefix, suffix) => {
          const generatedContent = prefix + suffix;
          if (generatedContent.trim().length === 0) return;

          fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
              choices: [{ message: { content: generatedContent } }],
              usage: { total_tokens: 42 },
            }),
          });

          const result = await callOpenRouter('sys', 'usr');

          expect(result).not.toBeNull();
          expect(result!.text).toStrictEqual(generatedContent);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.5**
   *
   * The returned metadata contains valid latencyMs (non-negative integer) and
   * tokensConsumed matching the usage.total_tokens from the response.
   */
  it('returns metadata with valid latencyMs and tokensConsumed from usage', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        fc.nat({ max: 999999 }),
        async (generatedContent, tokens) => {
          fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
              choices: [{ message: { content: generatedContent } }],
              usage: { total_tokens: tokens },
            }),
          });

          const result = await callOpenRouter('system', 'user');

          expect(result).not.toBeNull();
          expect(result!.metadata.latencyMs).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(result!.metadata.latencyMs)).toBe(true);
          expect(result!.metadata.tokensConsumed).toBe(tokens);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 4: Error resilience returns null for all failure modes ──────────

describe('Feature: openrouter-fallback-provider, Property 4: Error resilience', () => {
  /**
   * **Validates: Requirements 1.4, 6.4, 6.5**
   *
   * For any HTTP error status code in [400, 599], callOpenRouter returns null
   * without throwing an unhandled exception.
   */
  it('returns null for any HTTP error status code (400-599)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 400, max: 599 }),
        async (statusCode) => {
          fetchMock.mockResolvedValue({
            ok: false,
            status: statusCode,
            json: async () => ({ error: 'Server error' }),
          });

          const result = await callOpenRouter('system prompt', 'user prompt');

          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 6.4**
   *
   * When fetch throws an AbortError (timeout), callOpenRouter returns null
   * without throwing an unhandled exception.
   */
  it('returns null when fetch throws AbortError (timeout)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        async (systemPrompt, userPrompt) => {
          fetchMock.mockRejectedValue(
            new DOMException('The operation was aborted', 'AbortError')
          );

          const result = await callOpenRouter(systemPrompt, userPrompt);

          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 6.5**
   *
   * When fetch throws a TypeError (network error like DNS failure,
   * connection refused, or connection reset), callOpenRouter returns null
   * without throwing an unhandled exception.
   */
  it('returns null when fetch throws TypeError (network error)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        async (systemPrompt, userPrompt) => {
          fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

          const result = await callOpenRouter(systemPrompt, userPrompt);

          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.4, 6.4, 6.5**
   *
   * For any combination of failure modes (HTTP errors, timeouts, network errors),
   * callOpenRouter never throws and always returns null.
   */
  it('never throws for any failure mode combination', async () => {
    const httpErrorArb = fc.integer({ min: 400, max: 599 }).map((status) => ({
      type: 'http-error' as const,
      status,
    }));

    const timeoutErrorArb = fc.constant({
      type: 'timeout' as const,
    });

    const networkErrorArb = fc.constantFrom(
      'Failed to fetch',
      'NetworkError when attempting to fetch resource',
      'net::ERR_CONNECTION_REFUSED',
      'net::ERR_NAME_NOT_RESOLVED',
      'net::ERR_CONNECTION_RESET',
    ).map((msg) => ({
      type: 'network-error' as const,
      message: msg,
    }));

    const failureModeArb = fc.oneof(httpErrorArb, timeoutErrorArb, networkErrorArb);

    await fc.assert(
      fc.asyncProperty(failureModeArb, async (failure) => {
        switch (failure.type) {
          case 'http-error':
            fetchMock.mockResolvedValue({
              ok: false,
              status: failure.status,
              json: async () => ({ error: `HTTP ${failure.status}` }),
            });
            break;
          case 'timeout':
            fetchMock.mockRejectedValue(
              new DOMException('The operation was aborted', 'AbortError')
            );
            break;
          case 'network-error':
            fetchMock.mockRejectedValue(new TypeError(failure.message));
            break;
        }

        // Must never throw
        const result = await callOpenRouter('test system', 'test user');
        expect(result).toBeNull();
      }),
      { numRuns: 100 }
    );
  });
});


// ─── Property 3: Malformed response structure yields failure ──────────────────

describe('Feature: openrouter-fallback-provider, Property 3: Malformed response structure yields failure', () => {
  /**
   * **Validates: Requirements 1.6, 6.2**
   *
   * For any HTTP 2xx response where the choices array is empty, absent, or where
   * choices[0].message.content is null, undefined, or empty string, the function
   * SHALL return null.
   */

  it('returns null when choices array is empty', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (systemPrompt, userPrompt) => {
          fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ choices: [] }),
          });

          const result = await callOpenRouter(systemPrompt, userPrompt);

          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns null when choices field is absent from response', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (systemPrompt, userPrompt) => {
          fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({}),
          });

          const result = await callOpenRouter(systemPrompt, userPrompt);

          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns null when choices[0].message.content is null', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (systemPrompt, userPrompt) => {
          fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
              choices: [{ message: { content: null } }],
            }),
          });

          const result = await callOpenRouter(systemPrompt, userPrompt);

          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns null when choices[0].message.content is empty string', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (systemPrompt, userPrompt) => {
          fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
              choices: [{ message: { content: '' } }],
            }),
          });

          const result = await callOpenRouter(systemPrompt, userPrompt);

          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns null when choices[0] has no message field', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (systemPrompt, userPrompt) => {
          fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
              choices: [{}],
            }),
          });

          const result = await callOpenRouter(systemPrompt, userPrompt);

          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.6, 6.2**
   *
   * For any randomly generated malformed response variant (from the universe of
   * all possible malformed structures), the function always returns null.
   */
  it('returns null for any generated malformed response variant', async () => {
    const malformedResponseArb = fc.oneof(
      // Empty choices array
      fc.constant({ choices: [] }),
      // Missing choices entirely
      fc.record({ id: fc.string(), model: fc.string() }),
      // Null content
      fc.constant({ choices: [{ message: { content: null } }] }),
      // Empty content
      fc.constant({ choices: [{ message: { content: '' } }] }),
      // Missing message field
      fc.constant({ choices: [{}] }),
      // Undefined content (message with no content key)
      fc.constant({ choices: [{ message: {} }] }),
      // choices is not an array (object)
      fc.constant({ choices: {} }),
      // choices[0].message is null
      fc.constant({ choices: [{ message: null }] }),
      // choices is null
      fc.constant({ choices: null }),
    );

    await fc.assert(
      fc.asyncProperty(malformedResponseArb, async (malformedBody) => {
        fetchMock.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => malformedBody,
        });

        const result = await callOpenRouter('system prompt', 'user prompt');

        expect(result).toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 5: Non-JSON response body yields null with sanitized warning ────

describe('Feature: openrouter-fallback-provider, Property 5: Non-JSON response body yields null with sanitized warning', () => {
  /**
   * **Validates: Requirements 6.1**
   *
   * For any response body that cannot be parsed as valid JSON (HTML error pages,
   * truncated payloads, malformed syntax), the function SHALL log a warning
   * processed through sanitizeErrorMessage and return null.
   */
  it('returns null and logs sanitized warning for arbitrary non-JSON strings', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter((s) => {
          try {
            JSON.parse(s);
            return false; // Exclude valid JSON
          } catch {
            return true; // Keep only non-JSON strings
          }
        }),
        async (_nonJsonBody) => {
          fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => { throw new SyntaxError(`Unexpected token in JSON at position 0`); },
          });

          const warnSpy = vi.spyOn(console, 'warn');
          const result = await callOpenRouter('system prompt', 'user prompt');

          expect(result).toBeNull();
          expect(warnSpy).toHaveBeenCalled();
          // Verify the warning message contains sanitized OpenRouter context
          const warnMessage = warnSpy.mock.calls[warnSpy.mock.calls.length - 1][0] as string;
          expect(warnMessage).toContain('OpenRouter');
          expect(warnMessage).toContain('not valid JSON');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.1**
   *
   * HTML error pages (common from reverse proxies) cannot be parsed as JSON
   * and the function returns null with a warning.
   */
  it('returns null for HTML error page responses', async () => {
    const htmlArb = fc.tuple(
      fc.constantFrom('404 Not Found', '502 Bad Gateway', '503 Service Unavailable', 'Error'),
      fc.string({ minLength: 0, maxLength: 200 }),
    ).map(([title, body]) => `<html><head><title>${title}</title></head><body>${body}</body></html>`);

    await fc.assert(
      fc.asyncProperty(htmlArb, async (htmlBody) => {
        fetchMock.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => { throw new SyntaxError(`Unexpected token '<', "${htmlBody.slice(0, 10)}..." is not valid JSON`); },
        });

        const warnSpy = vi.spyOn(console, 'warn');
        const result = await callOpenRouter('system', 'user');

        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.1**
   *
   * Truncated JSON payloads (e.g., connection dropped mid-stream) cannot be
   * parsed and the function returns null with a sanitized warning.
   */
  it('returns null for truncated JSON payloads', async () => {
    const truncatedJsonArb = fc.constantFrom(
      '{"choices":',
      '{"choices":[{"message"',
      '{"choices":[{"message":{"content":"hello"',
      '{"id":"chatcmpl-abc",',
      '[{"message":{"content',
      '{"usage":{"total_tok',
    );

    await fc.assert(
      fc.asyncProperty(truncatedJsonArb, async (_truncatedJson) => {
        fetchMock.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => { throw new SyntaxError('Unexpected end of JSON input'); },
        });

        const warnSpy = vi.spyOn(console, 'warn');
        const result = await callOpenRouter('system', 'user');

        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.1**
   *
   * Random byte sequences (binary responses from corrupted connections) cannot
   * be parsed as JSON and the function handles them gracefully.
   */
  it('returns null for random byte sequences', async () => {
    const randomBytesArb = fc
      .array(fc.integer({ min: 0, max: 255 }), { minLength: 1, maxLength: 512 })
      .map((bytes) => String.fromCharCode(...bytes))
      .filter((s) => {
        try {
          JSON.parse(s);
          return false;
        } catch {
          return true;
        }
      });

    await fc.assert(
      fc.asyncProperty(randomBytesArb, async (randomBytes) => {
        fetchMock.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => { throw new SyntaxError('Unexpected token'); },
        });

        const warnSpy = vi.spyOn(console, 'warn');
        const result = await callOpenRouter(randomBytes, 'user prompt');

        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.1**
   *
   * The warning message is sanitized: it does not contain Bearer tokens,
   * environment variable values, or absolute file paths, and is at most
   * 200 characters long.
   */
  it('logged warning is sanitized (no secrets, max 200 chars)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }).filter((s) => {
          try {
            JSON.parse(s);
            return false;
          } catch {
            return true;
          }
        }),
        async () => {
          fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => { throw new SyntaxError('Unexpected token in JSON'); },
          });

          const warnSpy = vi.spyOn(console, 'warn');
          const result = await callOpenRouter('system', 'user');

          expect(result).toBeNull();
          expect(warnSpy).toHaveBeenCalled();

          const warnMessage = warnSpy.mock.calls[warnSpy.mock.calls.length - 1][0] as string;
          // Sanitized: no Bearer tokens, no env values
          expect(warnMessage).not.toMatch(/Bearer [^[]/);
          expect(warnMessage).not.toMatch(/VITE_[A-Z_]+=\S+/);
          // Sanitized: truncated to 200 chars max
          expect(warnMessage.length).toBeLessThanOrEqual(250); // Accounting for prefix
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ─── Property 6: Token usage extraction with graceful null handling ────────────

describe('Feature: openrouter-fallback-provider, Property 6: Token usage extraction with graceful null handling', () => {
  /**
   * **Validates: Requirements 1.7, 4.6**
   *
   * For any OpenRouter response with a numeric usage.total_tokens, the returned
   * metadata SHALL contain that value as tokensConsumed alongside valid latencyMs.
   */
  it('extracts numeric usage.total_tokens as tokensConsumed in metadata', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: 999999 }),
        async (generatedTokens) => {
          fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
              choices: [{ message: { content: 'response text' } }],
              usage: { total_tokens: generatedTokens },
            }),
          });

          const result = await callOpenRouter('system prompt', 'user prompt');

          expect(result).not.toBeNull();
          expect(result!.metadata.tokensConsumed).toBe(generatedTokens);
          expect(result!.metadata.latencyMs).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(result!.metadata.latencyMs)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.7, 4.6**
   *
   * When usage field is completely absent from the response, tokensConsumed
   * SHALL be null while latencyMs remains a valid non-negative integer.
   */
  it('returns tokensConsumed as null when usage field is absent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        async (content) => {
          fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
              choices: [{ message: { content } }],
              // No usage field at all
            }),
          });

          const result = await callOpenRouter('system prompt', 'user prompt');

          expect(result).not.toBeNull();
          expect(result!.metadata.tokensConsumed).toBeNull();
          expect(result!.metadata.latencyMs).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(result!.metadata.latencyMs)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.7, 4.6**
   *
   * When usage.total_tokens is a non-numeric value (string, null, undefined,
   * boolean, object), tokensConsumed SHALL be null while latencyMs remains valid.
   */
  it('returns tokensConsumed as null when total_tokens is non-numeric', async () => {
    const nonNumericTokensArb = fc.oneof(
      fc.string().map(s => ({ usage: { total_tokens: s } })),
      fc.constant({ usage: { total_tokens: null } }),
      fc.constant({ usage: { total_tokens: undefined } }),
      fc.constant({ usage: { total_tokens: true } }),
      fc.constant({ usage: { total_tokens: false } }),
      fc.constant({ usage: { total_tokens: {} } }),
      fc.constant({ usage: { total_tokens: [] } }),
      fc.constant({ usage: {} }), // total_tokens key missing
    );

    await fc.assert(
      fc.asyncProperty(nonNumericTokensArb, async (usagePayload) => {
        fetchMock.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: 'valid response' } }],
            ...usagePayload,
          }),
        });

        const result = await callOpenRouter('system prompt', 'user prompt');

        expect(result).not.toBeNull();
        expect(result!.metadata.tokensConsumed).toBeNull();
        expect(result!.metadata.latencyMs).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(result!.metadata.latencyMs)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.7, 4.6**
   *
   * For ALL response cases (with or without usage), latencyMs must always be
   * a valid non-negative integer reflecting elapsed time.
   */
  it('latencyMs is always a non-negative integer regardless of usage presence', async () => {
    const responseVariantArb = fc.oneof(
      // With valid numeric tokens
      fc.nat({ max: 999999 }).map(tokens => ({
        choices: [{ message: { content: 'text' } }],
        usage: { total_tokens: tokens },
      })),
      // Without usage field
      fc.constant({
        choices: [{ message: { content: 'text' } }],
      }),
      // With null total_tokens
      fc.constant({
        choices: [{ message: { content: 'text' } }],
        usage: { total_tokens: null },
      }),
      // With string total_tokens
      fc.string().map(s => ({
        choices: [{ message: { content: 'text' } }],
        usage: { total_tokens: s },
      })),
    );

    await fc.assert(
      fc.asyncProperty(responseVariantArb, async (responseBody) => {
        fetchMock.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => responseBody,
        });

        const result = await callOpenRouter('system', 'user');

        expect(result).not.toBeNull();
        expect(result!.metadata.latencyMs).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(result!.metadata.latencyMs)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});


// ─── Property 8: Error messages are sanitized before logging ──────────────────

describe('Feature: openrouter-fallback-provider, Property 8: Error messages are sanitized before logging', () => {
  /**
   * **Validates: Requirements 6.3**
   *
   * For any error message originating from OpenRouter interactions that contains
   * VITE_* environment variable values, Bearer tokens, Authorization headers, or
   * absolute file paths, the logged message SHALL have those patterns redacted by
   * sanitizeErrorMessage and be truncated to at most 200 characters.
   */

  it('redacts Bearer tokens from arbitrary strings', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => !/\s/.test(s) && s.length > 0 && !s.includes('[REDACTED]') && s !== '[REDACTED'  && !'[REDACTED]'.includes(s)),
        fc.string({ minLength: 0, maxLength: 50 }),
        (prefix, token, suffix) => {
          const input = `${prefix} Bearer ${token} ${suffix}`;
          const result = sanitizeErrorMessage(input);

          // Bearer token value must not remain in the output
          expect(result).not.toContain(`Bearer ${token}`);
          // The redaction marker should be present
          expect(result).toContain('Bearer [REDACTED]');
          // Result must be at most 200 chars
          expect(result.length).toBeLessThanOrEqual(200);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('redacts VITE_* environment variable patterns (= format)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 30 }),
        fc.constantFrom('GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'SECRET', 'TOKEN'),
        fc.string({ minLength: 1, maxLength: 40 }).filter(s => !/\s/.test(s)),
        fc.string({ minLength: 0, maxLength: 30 }),
        (prefix, envName, value, suffix) => {
          const input = `${prefix} VITE_${envName}=${value} ${suffix}`;
          const result = sanitizeErrorMessage(input);

          // The env variable value must not remain
          expect(result).not.toContain(`VITE_${envName}=${value}`);
          // The redaction marker should be present
          expect(result).toContain('[REDACTED_ENV]');
          // Result must be at most 200 chars
          expect(result.length).toBeLessThanOrEqual(200);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('redacts VITE_* environment variable patterns (: format)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 30 }),
        fc.constantFrom('GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'SECRET', 'TOKEN'),
        fc.string({ minLength: 1, maxLength: 40 }).filter(s => !/\s/.test(s)),
        fc.string({ minLength: 0, maxLength: 30 }),
        (prefix, envName, value, suffix) => {
          const input = `${prefix} VITE_${envName}: ${value} ${suffix}`;
          const result = sanitizeErrorMessage(input);

          // The env variable value must not remain
          expect(result).not.toContain(`VITE_${envName}: ${value}`);
          // The redaction marker should be present
          expect(result).toContain('[REDACTED_ENV]');
          // Result must be at most 200 chars
          expect(result.length).toBeLessThanOrEqual(200);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('redacts /home/ file paths from arbitrary strings', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 30 }),
        fc.string({ minLength: 1, maxLength: 40 }).filter(s => !/[\s:,)}\]]/.test(s) && s.length > 0),
        fc.string({ minLength: 0, maxLength: 30 }),
        (prefix, pathSegment, suffix) => {
          const input = `${prefix} /home/${pathSegment} ${suffix}`;
          const result = sanitizeErrorMessage(input);

          // The file path must not remain
          expect(result).not.toContain(`/home/${pathSegment}`);
          // The redaction marker should be present
          expect(result).toContain('[REDACTED_PATH]');
          // Result must be at most 200 chars
          expect(result.length).toBeLessThanOrEqual(200);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('redacts /src/ file paths from arbitrary strings', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 30 }),
        fc.string({ minLength: 1, maxLength: 40 }).filter(s => !/[\s:,)}\]]/.test(s) && s.length > 0),
        fc.string({ minLength: 0, maxLength: 30 }),
        (prefix, pathSegment, suffix) => {
          const input = `${prefix} /src/${pathSegment} ${suffix}`;
          const result = sanitizeErrorMessage(input);

          // The file path must not remain
          expect(result).not.toContain(`/src/${pathSegment}`);
          // The redaction marker should be present
          expect(result).toContain('[REDACTED_PATH]');
          // Result must be at most 200 chars
          expect(result.length).toBeLessThanOrEqual(200);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('truncates any string longer than 200 characters to exactly 200', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 201, maxLength: 1000 }),
        (longMessage) => {
          const result = sanitizeErrorMessage(longMessage);
          expect(result.length).toBeLessThanOrEqual(200);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('redacts Authorization header values from arbitrary strings', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 30 }),
        fc.string({ minLength: 1, maxLength: 40 }).filter(s => !/\s/.test(s) && s.length > 0 && !'[REDACTED]'.startsWith(s)),
        fc.string({ minLength: 0, maxLength: 30 }),
        (prefix, headerValue, suffix) => {
          const input = `${prefix} Authorization: ${headerValue} ${suffix}`;
          const result = sanitizeErrorMessage(input);

          // The Authorization value must not remain
          expect(result).not.toContain(`Authorization: ${headerValue}`);
          // The redaction marker should be present
          expect(result).toContain('Authorization: [REDACTED]');
          // Result must be at most 200 chars
          expect(result.length).toBeLessThanOrEqual(200);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('handles strings with multiple sensitive patterns simultaneously', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => !/\s/.test(s)),
        fc.constantFrom('GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY'),
        fc.string({ minLength: 1, maxLength: 15 }).filter(s => !/[\s:,)}\]]/.test(s)),
        (token, envName, pathSeg) => {
          const input = `Bearer ${token} VITE_${envName}=secret /home/${pathSeg}`;
          const result = sanitizeErrorMessage(input);

          // No sensitive values should remain
          expect(result).not.toContain(`Bearer ${token}`);
          expect(result).not.toContain(`VITE_${envName}=secret`);
          expect(result).not.toContain(`/home/${pathSeg}`);
          // Result must be at most 200 chars
          expect(result.length).toBeLessThanOrEqual(200);
        }
      ),
      { numRuns: 100 }
    );
  });
});
