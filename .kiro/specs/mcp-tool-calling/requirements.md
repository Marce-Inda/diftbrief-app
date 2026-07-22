# Requirements Document

## Introduction

This feature implements Phase 4 (Tool Calling) for DriftBrief: an agentic ReAct loop that enables the SOC and CISO writer agents to invoke simulated tools (threat intelligence and regulatory precedents) during briefing generation. The tools follow the MCP (Model Context Protocol) simulation pattern, enriching briefings with contextual data while maintaining full graceful degradation when APIs or tools fail.

## Glossary

- **Tool_Service**: The module (`src/services/tools.ts`) that exports simulated async tool functions for threat intelligence and regulatory lookups.
- **Agent_Service**: The orchestration module (`src/services/agentService.ts`) that manages LLM calls, tool registration, and the agentic loop for SOC and CISO writer agents.
- **Agentic_Loop**: The ReAct-pattern control flow within `callWriterLLM` that sends prompts with tool definitions, evaluates function call responses, executes local tools, and returns results to the LLM for final briefing generation.
- **Tool_Definition**: A structured JSON object describing a callable function (name, description, parameters) injected into the LLM request payload.
- **Function_Call**: A response from the LLM indicating it wants to invoke a registered tool with specific arguments instead of producing a text response.
- **Function_Response**: The result of executing a local tool function, sent back to the LLM so it can incorporate the data into its final briefing output.
- **IOC**: Indicator of Compromise — a hash, IP address, domain, or other artifact used to identify malicious activity.
- **Drift**: The structured object representing changes detected between two incident snapshots.
- **Deterministic_Fallback**: The local drift calculation engine (`driftComparator.ts`) that guarantees functional output without any external API dependency.

## Requirements

### Requirement 1: Threat Intelligence Tool Function

**User Story:** As a SOC analyst, I want the briefing to include threat intelligence context for detected IOCs, so that I can understand the severity and attribution of indicators without manually querying external systems.

#### Acceptance Criteria

1. THE Tool_Service SHALL export an async function `queryThreatIntelligence` that accepts a single `ioc` string parameter and returns a `ThreatIntelligenceResult` object containing at minimum the fields `reputation` (string), `campaign` (string), and `action_recommended` (string).
2. WHEN `queryThreatIntelligence` is invoked with a non-empty IOC string, THE Tool_Service SHALL return the `ThreatIntelligenceResult` JSON object after a simulated delay between 400 and 600 milliseconds.
3. WHEN `queryThreatIntelligence` is invoked with an IP address IOC (matching IPv4 dotted-decimal format), THE Tool_Service SHALL return threat data with a `reputation` field indicating a threat score descriptor, a `campaign` field containing a campaign name attribution, and `action_recommended` set to a firewall-related containment action.
4. WHEN `queryThreatIntelligence` is invoked with a hash IOC (matching hexadecimal string of 32, 40, or 64 characters), THE Tool_Service SHALL return threat data with a `reputation` field indicating a malware family classification, a `campaign` field containing a campaign name attribution, and `action_recommended` set to an endpoint isolation action.
5. IF `queryThreatIntelligence` is invoked with an empty string or a string containing only whitespace, THEN THE Tool_Service SHALL return a `ThreatIntelligenceResult` object with `reputation` set to "unknown", `campaign` set to "none", and `action_recommended` set to "no action".
6. IF `queryThreatIntelligence` is invoked with an IOC string that does not match a known IOC type (not an IP address and not a hash), THEN THE Tool_Service SHALL return a `ThreatIntelligenceResult` object with a generic low-confidence reputation, `campaign` set to "unattributed", and `action_recommended` set to a monitoring action.

### Requirement 2: Regulatory Precedents Tool Function

**User Story:** As a CISO, I want the briefing to include regulatory precedent data for applicable regulations, so that I can quantify legal risk with real enforcement examples during decision-making.

#### Acceptance Criteria

1. THE Tool_Service SHALL export an async function `queryRegulatoryPrecedents` that accepts a single `regulation` string parameter and returns an object conforming to the `RegulatoryPrecedentResult` interface, which contains `max_penalty` (string describing the maximum financial penalty), `recent_fine_example` (string describing a real enforcement case with entity name and fine amount), and `notification_deadline` (string describing the mandatory breach notification timeframe).
2. WHEN `queryRegulatoryPrecedents` is invoked with a recognized regulation identifier from the supported set ("GDPR", "NIS2"), THE Tool_Service SHALL return a `RegulatoryPrecedentResult` object populated with regulation-specific data for `max_penalty`, `recent_fine_example`, and `notification_deadline` fields after a simulated delay between 400 and 600 milliseconds.
3. WHEN `queryRegulatoryPrecedents` is invoked with an unrecognized regulation identifier (any string not in the supported set), THE Tool_Service SHALL return a `RegulatoryPrecedentResult` object where `max_penalty` indicates that specific penalty data is unavailable, `recent_fine_example` indicates no precedent data exists for the given regulation, and `notification_deadline` indicates that the deadline is unspecified, after the same simulated delay.
4. IF `queryRegulatoryPrecedents` is invoked with an empty string, THEN THE Tool_Service SHALL return a `RegulatoryPrecedentResult` object with all fields indicating that no regulation was specified and precedent data cannot be retrieved.

### Requirement 3: Tool Definition Registration for SOC Agent

**User Story:** As a system maintainer, I want the SOC agent's LLM request to include the threat intelligence tool definition, so that the model can autonomously decide to query threat data when IOCs are present in the drift.

#### Acceptance Criteria

1. WHEN the Agent_Service constructs a request for the SOC writer agent targeting the Gemini API, THE Agent_Service SHALL inject the `queryThreatIntelligence` Tool_Definition into the `functionDeclarations` array within the request payload, regardless of whether the current drift contains IOCs.
2. WHEN the Agent_Service constructs a request for the SOC writer agent targeting the Groq API, THE Agent_Service SHALL inject the `queryThreatIntelligence` Tool_Definition into the `tools` array using the Groq function tool format (object with `type: "function"` and nested `function` descriptor), regardless of whether the current drift contains IOCs.
3. THE Tool_Definition for `queryThreatIntelligence` SHALL include the function name `queryThreatIntelligence`, a description stating that it queries threat intelligence data for a given Indicator of Compromise, and a parameter schema specifying a single required `ioc` parameter of type string with a description indicating the IOC value to look up.
4. WHEN the SOC system prompt is constructed and the drift contains one or more entries in the `newIOCs` array, THE Agent_Service SHALL include an instruction in the system prompt directing the LLM to invoke `queryThreatIntelligence` for IOC indicators present in the drift data.
5. IF the drift contains zero entries in the `newIOCs` array, THEN THE Agent_Service SHALL still register the Tool_Definition in the request payload but SHALL NOT include a prompt instruction directing the LLM to invoke the tool.

### Requirement 4: Tool Definition Registration for CISO Agent

**User Story:** As a system maintainer, I want the CISO agent's LLM request to include the regulatory precedents tool definition, so that the model can autonomously decide to query legal precedent data when regulations are referenced.

#### Acceptance Criteria

1. WHEN the Agent_Service constructs a request for the CISO writer agent, THE Agent_Service SHALL inject the `queryRegulatoryPrecedents` Tool_Definition into the request payload using Gemini function declarations format for Gemini calls and Groq tools format for Groq calls, with identical function semantics in both formats.
2. THE Tool_Definition for `queryRegulatoryPrecedents` SHALL include the function name `queryRegulatoryPrecedents`, a description stating that it queries regulatory enforcement precedents and penalty examples for a given regulation, and a parameter schema specifying a single required `regulation` parameter of type string.
3. WHEN the CISO system prompt is constructed, THE Agent_Service SHALL append an instruction directing the LLM to invoke `queryRegulatoryPrecedents` with the applicable regulation identifier when regulation data is present in the provided drift context.
4. WHEN the Agent_Service constructs a request for the SOC writer agent, THE Agent_Service SHALL NOT include the `queryRegulatoryPrecedents` Tool_Definition in the request payload.

### Requirement 5: Agentic Loop Implementation (ReAct Pattern)

**User Story:** As a developer, I want `callWriterLLM` to implement a ReAct-pattern agentic loop, so that the agents can invoke tools and incorporate tool results into the final briefing autonomously.

#### Acceptance Criteria

1. WHEN `callWriterLLM` receives a response from the LLM containing a Function_Call, THE Agentic_Loop SHALL extract the function name and arguments from the response, execute the corresponding local tool function from Tool_Service, append the Function_Response to the accumulated conversation history, and send a follow-up request to the LLM containing the full message sequence (system prompt, user prompt, assistant Function_Call, and Function_Response).
2. WHEN `callWriterLLM` receives a response from the LLM that does not contain a Function_Call, THE Agentic_Loop SHALL extract the text content from the response (from `candidates[0].content.parts[0].text` for Gemini or `choices[0].message.content` for Groq) and return it directly without additional LLM calls.
3. WHEN the LLM returns a Function_Call referencing a function name that is not registered in Tool_Service, THE Agentic_Loop SHALL construct a Function_Response containing an error message indicating the function is not available and send this error response back to the LLM so it can generate a text briefing without the unavailable tool data.
4. WHEN the follow-up request (containing the Function_Response) is sent to the LLM, THE Agentic_Loop SHALL return the text content from the LLM response as the final briefing output; IF the follow-up response still contains a Function_Call instead of text, THEN THE Agentic_Loop SHALL terminate the loop and return null to trigger the existing fallback chain.
5. WHEN `callWriterLLM` constructs Function_Call extraction and Function_Response payloads, THE Agentic_Loop SHALL use the Gemini format (`functionCall`/`functionResponse` fields within content parts) when calling Gemini and the Groq format (`tool_calls` array and `tool` role messages) when calling Groq.

### Requirement 6: Loop Iteration Limit (Safety Control)

**User Story:** As a system operator, I want the agentic loop to enforce a maximum iteration count, so that runaway tool-calling sequences cannot cause infinite loops or excessive API consumption.

#### Acceptance Criteria

1. THE Agentic_Loop SHALL enforce a configurable maximum of 2 LLM calls per single invocation of `callWriterLLM` (one initial call and one follow-up after tool execution), with the iteration counter scoped independently to each invocation so that parallel SOC and CISO agent calls each enforce their own limit.
2. IF the Agentic_Loop reaches the maximum iteration limit and the LLM response still contains a Function_Call, THEN THE Agentic_Loop SHALL terminate the loop and return a briefing using the following priority: first, any text content present in the current LLM response alongside the Function_Call; second, if no text content is present, the Deterministic_Fallback briefing from `driftComparator.ts`.
3. WHEN the Agentic_Loop terminates due to reaching the maximum iteration limit, THE Agentic_Loop SHALL log a warning to the console using `console.warn` that includes the function name `callWriterLLM` and the maximum iteration count value that was reached.

### Requirement 7: Tool Execution Error Handling

**User Story:** As a system operator, I want tool execution errors to be handled gracefully, so that a failing tool does not crash the briefing generation pipeline.

#### Acceptance Criteria

1. IF a tool function from Tool_Service throws an exception during execution, THEN THE Agentic_Loop SHALL catch the exception and construct a Function_Response containing an object with an `error` field set to true and a `message` field containing the text "Tool execution failed:" followed by a sanitized summary of the failure that excludes API keys, authentication tokens, and internal file paths.
2. WHEN a tool error Function_Response is sent to the LLM, THE Agentic_Loop SHALL continue the agentic loop by sending the error Function_Response as a follow-up request to the LLM and returning whatever text response the LLM produces, without terminating the application process.
3. IF a tool function throws an exception, THEN THE Agentic_Loop SHALL call `console.error` with the prefix "[AgentService]" followed by the tool function name and the error message, excluding API keys, authentication tokens, and raw stack traces from the logged output.
4. IF a tool function throws an exception and the LLM fails to produce a text response after receiving the error Function_Response, THEN THE Agentic_Loop SHALL fall back to the Deterministic_Fallback briefing rather than returning an empty or undefined result.

### Requirement 8: Graceful Degradation on API Tool Processing Failure

**User Story:** As a user, I want the system to produce a complete briefing even when the API cannot process tool calls, so that I always receive actionable intelligence regardless of external service state.

#### Acceptance Criteria

1. IF the LLM API returns an error or times out (within the 10-second per-call timeout) during the agentic loop (either the initial call or the follow-up call), THEN THE Agent_Service SHALL fall back to the next provider in the existing Gemini → Groq → Deterministic_Fallback chain, producing a briefing from static data.
2. IF the LLM API returns a malformed Function_Call response that cannot be parsed (missing function name, unparseable arguments, or unrecognized function name), THEN THE Agentic_Loop SHALL treat the response as a non-tool-call text response and extract any text content present in the response. IF no text content is present in the malformed response, THEN THE Agentic_Loop SHALL fall back to the Deterministic_Fallback briefing for that agent.
3. WHEN graceful degradation activates, THE Agent_Service SHALL log the fallback reason (including which provider failed and the error category) to the console and produce a complete result for the current invocation without propagating errors to the UI layer.
4. THE Agent_Service SHALL maintain the existing fallback behavior where the Deterministic_Fallback always produces a structurally complete Drift object with non-empty `socBriefing` and non-empty `cisoBriefing` fields regardless of all upstream failures.
5. IF graceful degradation activates for either writer agent, THEN THE Agent_Service SHALL include a `fallbackReason` string in the `AgentDriftResult` describing which provider failed and that deterministic output was used.

### Requirement 9: Tool Response Data Integration in Briefings

**User Story:** As a SOC analyst or CISO, I want tool-enriched data to appear naturally within the briefing text, so that intelligence context is seamlessly integrated rather than appended as raw data.

#### Acceptance Criteria

1. WHEN the SOC agent receives threat intelligence data via Function_Response, THE SOC agent SHALL produce a technical briefing narrative that contains the reputation assessment, campaign attribution, and recommended containment action as inline prose sentences referencing the specific data values provided.
2. WHEN the CISO agent receives regulatory precedent data via Function_Response, THE CISO agent SHALL produce an executive briefing narrative that contains the specific penalty amounts, enforcement examples, and notification deadline hours as inline prose sentences referencing the exact values provided.
3. THE Agent_Service SHALL pass tool results to the LLM as a structured JSON string within the user prompt, formatted with labeled fields and contextual descriptions, so the LLM can interpret and rephrase the data rather than echoing the raw structure.
4. THE Agent_Service SHALL produce briefing output that contains zero JSON syntax characters (curly braces, square brackets, or key-value colon pairs used as data formatting) in the final rendered briefing text displayed to the user.
5. IF the Function_Response data is malformed, empty, or missing expected fields, THEN THE Agent_Service SHALL fall back to the deterministic local engine briefing without displaying error artifacts or incomplete data placeholders in the final briefing text.
