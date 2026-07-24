/**
 * @fileoverview Unit tests verifying sanitizeErrorMessage handles
 * OpenRouter-specific error message patterns.
 *
 * Validates: Requirements 6.3
 */

import { describe, it, expect } from 'vitest';
import { sanitizeErrorMessage } from '../agentService';

describe('sanitizeErrorMessage - OpenRouter error patterns', () => {
  it('redacts Bearer token from OpenRouter HTTP 401 error', () => {
    const input = 'OpenRouter HTTP 401: Bearer sk-or-v1-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz';
    const result = sanitizeErrorMessage(input);

    expect(result).not.toContain('sk-or-v1-abc123');
    expect(result).toContain('Bearer [REDACTED]');
    expect(result).toContain('OpenRouter HTTP 401');
  });

  it('redacts VITE_OPENROUTER_API_KEY value from error message', () => {
    const input = 'OpenRouter error: VITE_OPENROUTER_API_KEY=sk-or-v1-xxx123secret456';
    const result = sanitizeErrorMessage(input);

    expect(result).not.toContain('sk-or-v1-xxx123secret456');
    expect(result).not.toContain('VITE_OPENROUTER_API_KEY=sk-or-v1');
    expect(result).toContain('[REDACTED_ENV]');
  });

  it('redacts file paths from OpenRouter error messages', () => {
    const input = 'Error at /home/user/project/src/services/agentService.ts:42';
    const result = sanitizeErrorMessage(input);

    expect(result).not.toContain('/home/user/project');
    expect(result).toContain('[REDACTED_PATH]');
  });

  it('truncates verbose OpenRouter error messages to 200 characters', () => {
    const verboseError =
      'OpenRouter API Error (HTTP 503 Service Unavailable): The upstream provider ' +
      'meta-llama/llama-3.1-8b-instruct:free is currently experiencing high load. ' +
      'Please retry your request after a brief delay. Request ID: req_abc123def456. ' +
      'For more information visit https://openrouter.ai/docs/errors. Additional context: ' +
      'the model queue is full and all inference workers are busy processing other requests.';

    expect(verboseError.length).toBeGreaterThan(200);

    const result = sanitizeErrorMessage(verboseError);

    expect(result.length).toBeLessThanOrEqual(200);
    // Starts with the original error prefix (not truncated from beginning)
    expect(result).toContain('OpenRouter API Error');
  });

  it('redacts multiple sensitive patterns in a single OpenRouter error', () => {
    const input =
      'OpenRouter call failed: Bearer sk-or-v1-secret123 at /home/dev/app/src/services/agentService.ts VITE_OPENROUTER_API_KEY=leaked';
    const result = sanitizeErrorMessage(input);

    expect(result).not.toContain('sk-or-v1-secret123');
    expect(result).not.toContain('/home/dev/app');
    expect(result).not.toContain('VITE_OPENROUTER_API_KEY=leaked');
    expect(result).toContain('Bearer [REDACTED]');
    expect(result).toContain('[REDACTED_PATH]');
    expect(result).toContain('[REDACTED_ENV]');
  });

  it('preserves safe error messages without modification', () => {
    const input = 'OpenRouter HTTP 429: rate limit exceeded, retry after 60s';
    const result = sanitizeErrorMessage(input);

    expect(result).toBe(input);
  });

  it('handles Authorization header pattern in OpenRouter context', () => {
    const input = 'Request headers: Authorization: sk-or-v1-mykey123 failed';
    const result = sanitizeErrorMessage(input);

    expect(result).not.toContain('sk-or-v1-mykey123');
    expect(result).toContain('Authorization: [REDACTED]');
  });
});
