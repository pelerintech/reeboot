# Spec — SupportAgentRunner

## Capability: AgentRunner Implementation with Cancellation

The `SupportAgentRunner` implements the `AgentRunner` interface (`prompt`, `abort`, `dispose`, `reset`) by wrapping a `SupportChat` and running a minimal agent loop. It threads `AbortSignal` through every tool execution and LLM call — the critical difference from pi, where `abort()` does not cancel in-flight tools.

### Scenarios

#### S1: SupportAgentRunner implements AgentRunner

**GIVEN** `SupportAgentRunner` is defined in `reeboot/src/agent-runner/support-runner.ts`
**WHEN** a module imports it
**THEN** it implements `AgentRunner` (all required methods: `prompt`, `abort`, `dispose`, `reset`)

**AND** the constructor accepts `(runtime: SupportRuntime, context: ContextConfig, config: Config)`

#### S2: prompt() runs a turn and emits events

**GIVEN** a `SupportAgentRunner` with a mock LLM that returns a text response (no tool calls)
**WHEN** `runner.prompt('hello', onEvent)` is called
**THEN** the runner emits `before_agent_start`, `after_provider_response`, `turn_end`, and `agent_end` events on the chat

**AND** `onEvent` receives at least one `text_delta` RunnerEvent with the response text

**AND** `onEvent` receives a `message_end` RunnerEvent with usage data

**AND** the promise resolves after the turn completes

#### S3: prompt() executes tools and feeds results back

**GIVEN** a `SupportAgentRunner` with a mock LLM that returns a tool call, then a text response
**WHEN** `runner.prompt('use the tool', onEvent)` is called
**THEN** the runner emits `tool_call` and `tool_result` events for the tool execution

**AND** the tool's `execute()` is called with the chat's `AbortSignal` (non-aborted)

**AND** the tool result is fed back to the LLM for a second call

**AND** `onEvent` receives `tool_call_start` and `tool_call_end` RunnerEvents

#### S4: abort() cancels an in-flight prompt

**GIVEN** a `SupportAgentRunner` with an in-flight `prompt()` (mock LLM that hangs)
**WHEN** `runner.abort()` is called
**THEN** the prompt's `AbortSignal` is aborted

**AND** the `prompt()` promise rejects with an `AbortError`

**AND** any in-flight tool `execute()` receives the aborted signal and can stop

#### S5: abort() does not affect other chats

**GIVEN** two `SupportAgentRunner` instances (runnerA, runnerB) with in-flight prompts
**WHEN** `runnerA.abort()` is called
**THEN** runnerA's prompt rejects with `AbortError`

**AND** runnerB's prompt continues unaffected (its AbortSignal is not aborted)

#### S6: dispose() cleans up the chat permanently

**GIVEN** a `SupportAgentRunner` with an active chat
**WHEN** `runner.dispose()` is called
**THEN** the chat is disposed (all listeners removed, `session_shutdown` emitted with reason `'quit'`)

**AND** a subsequent `prompt()` call throws (runner is disposed)

#### S7: reset() clears the chat for reuse

**GIVEN** a `SupportAgentRunner` with an active chat
**WHEN** `runner.reset()` is called
**THEN** the chat emits `session_shutdown` with reason `'new'`

**AND** the chat's message history is cleared

**AND** the next `prompt()` call works (runner is still usable)

#### S8: createRunner factory selects support mode

**GIVEN** a `Config` with `config.agent.runner = 'support'`
**WHEN** `createRunner(context, config)` is called
**THEN** a `SupportAgentRunner` is returned (not a `PiAgentRunner`)

**AND** the runner's extensions are loaded from the support subset (observability, session-name, token-meter, capabilities), not the full pi loader
