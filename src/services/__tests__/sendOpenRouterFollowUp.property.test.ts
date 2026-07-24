/**
 * @fileoverview Property-based tests for sendOpenRouterFollowUp function.
 * Feature: openrouter-fallback-provider, Property 9: ReAct loop terminates within 2 iterations
 *
 * Tests that the follow-up function correctly signals "another tool call needed"
 * when the follow-up response also contains tool_calls, proving the bounded
 * iteration mechanism works. The outer handleFunctionCall uses this signal to
 * terminate the ReAct loop (max 2 iterations: 1 initial + 1 follow-up).
 *
 * **Validates: Requirements 2.5**
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { sendOpenRouterFollowUp } from '../agentService';

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

// ─── Property 9: ReAct loop terminates within 2 iterations ────────────────────

describe('Feature: openrouter-fallback-provider, Property 9: ReAct loop terminates within 2 iterations', () => {
  /**
   * **Validates: Requirements 2.5**
   *
   * For any sequence of OpenRouter responses containing tool_calls, the system
   * SHALL execute at most one tool call and one follow-up request (2 total
   * iterations). When the follow-up also returns a tool_call, sendOpenRouterFollowUp
   * returns a __functionCall JSON string signaling the outer loop to terminate.
   */
  it('returns __functionCall JSON when follow-up response contains tool_calls (bounded iteration signal)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),  // functionName
        fc.string({ minLength: 1, maxLength: 50 }),   // callId
        fc.string({ minLength: 1, maxLength: 200 }),  // systemPrompt
        fc.string({ minLength: 1, maxLength: 200 }),  // userPrompt
        async (functionName, callId, systemPrompt, userPrompt) => {
          fetchMock.mockClear();
          // Mock fetch to return a response with tool_calls (simulating infinite loop attempt)
          fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
              choices: [{
                message: {
                  content: null,
                  tool_calls: [{
                    id: 'call_followup_123',
                    type: 'function',
                    function: {
                      name: 'queryThreatIntelligence',
                      arguments: '{"ioc":"10.0.0.1"}',
                    },
                  }],
                },
              }],
              usage: { total_tokens: 50 },
            }),
          });

          const result = await sendOpenRouterFollowUp(
            systemPrompt,
            userPrompt,
            functionName,
            { key: 'value' },
            { result: 'tool output' },
            callId,
            [{
              type: 'function',
              function: {
                name: 'queryThreatIntelligence',
                description: 'Test tool',
                parameters: { type: 'object', properties: {}, required: [] },
              },
            }],
          );

          // The function MUST return (not hang), proving bounded iteration
          expect(result).not.toBeNull();

          // It must return a __functionCall JSON string (the termination signal)
          const parsed = JSON.parse(result!);
          expect(parsed.__functionCall).toBe(true);
          expect(parsed.name).toBe('queryThreatIntelligence');

          // Fetch must be called exactly ONCE (the follow-up itself does not recurse)
          expect(fetchMock).toHaveBeenCalledTimes(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 2.5**
   *
   * For any arbitrary tool name and args in the follow-up tool_calls response,
   * the function correctly extracts and returns them in the __functionCall signal,
   * allowing the outer loop to detect and terminate.
   */
  it('correctly extracts arbitrary tool name and args from follow-up tool_calls', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),  // tool name
        fc.string({ minLength: 1, maxLength: 50 }),  // tool call id
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z_]/.test(s)),
          fc.string({ minLength: 0, maxLength: 100 }),
          { minKeys: 0, maxKeys: 5 },
        ),  // function args
        async (toolName, toolCallId, toolArgs) => {
          fetchMock.mockClear();
          fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
              choices: [{
                message: {
                  content: null,
                  tool_calls: [{
                    id: toolCallId,
                    type: 'function',
                    function: {
                      name: toolName,
                      arguments: JSON.stringify(toolArgs),
                    },
                  }],
                },
              }],
              usage: { total_tokens: 25 },
            }),
          });

          const result = await sendOpenRouterFollowUp(
            'system prompt',
            'user prompt',
            'originalFunction',
            { arg: 'val' },
            { data: 'result' },
            'original_call_id',
            [{
              type: 'function',
              function: {
                name: toolName,
                description: 'Test',
                parameters: { type: 'object', properties: {}, required: [] },
              },
            }],
          );

          // Must return (no infinite loop)
          expect(result).not.toBeNull();

          // Must be valid JSON with __functionCall signal
          const parsed = JSON.parse(result!);
          expect(parsed.__functionCall).toBe(true);
          expect(parsed.name).toBe(toolName);
          expect(parsed.args).toEqual(toolArgs);
          expect(parsed.callId).toBe(toolCallId);

          // Exactly one fetch call (no recursion)
          expect(fetchMock).toHaveBeenCalledTimes(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 2.5**
   *
   * The system always terminates deterministically — even when the follow-up
   * response contains tool_calls with varying numbers of entries.
   * sendOpenRouterFollowUp only processes the first tool_call and returns,
   * never enters recursion regardless of how many tool_calls are present.
   */
  it('terminates deterministically with any number of tool_calls in follow-up response', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),  // number of tool_calls in response
        async (numToolCalls) => {
          fetchMock.mockClear();
          const toolCalls = Array.from({ length: numToolCalls }, (_, i) => ({
            id: `call_${i}`,
            type: 'function',
            function: {
              name: `tool_${i}`,
              arguments: JSON.stringify({ index: String(i) }),
            },
          }));

          fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
              choices: [{
                message: {
                  content: null,
                  tool_calls: toolCalls,
                },
              }],
              usage: { total_tokens: 100 },
            }),
          });

          const result = await sendOpenRouterFollowUp(
            'system',
            'user',
            'prevFunction',
            { key: 'val' },
            { output: 'data' },
            'prev_call_id',
            [{
              type: 'function',
              function: {
                name: 'tool_0',
                description: 'Test',
                parameters: { type: 'object', properties: {}, required: [] },
              },
            }],
          );

          // Must terminate (not hang)
          expect(result).not.toBeNull();

          // Must return __functionCall signal (only first tool_call)
          const parsed = JSON.parse(result!);
          expect(parsed.__functionCall).toBe(true);
          expect(parsed.name).toBe('tool_0');

          // Exactly one fetch call — no recursion or infinite loop
          expect(fetchMock).toHaveBeenCalledTimes(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 2.5**
   *
   * When follow-up returns normal text (no tool_calls), the function returns
   * the text directly, proving the loop correctly ends after a single follow-up.
   * This is the normal happy path: initial call → tool_call → follow-up → text.
   */
  it('returns text directly when follow-up has no tool_calls (normal termination)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 500 }).filter(s => s.trim().length > 0),
        async (responseText) => {
          fetchMock.mockClear();
          fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
              choices: [{
                message: {
                  content: responseText,
                },
              }],
              usage: { total_tokens: 75 },
            }),
          });

          const result = await sendOpenRouterFollowUp(
            'system prompt',
            'user prompt',
            'queryThreatIntelligence',
            { ioc: '10.0.0.1' },
            { reputation: 'high-threat' },
            'call_abc',
            [{
              type: 'function',
              function: {
                name: 'queryThreatIntelligence',
                description: 'Query threat intel',
                parameters: { type: 'object', properties: {}, required: [] },
              },
            }],
          );

          // Returns text directly (not __functionCall)
          expect(result).toBe(responseText);

          // Exactly one fetch call
          expect(fetchMock).toHaveBeenCalledTimes(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});
