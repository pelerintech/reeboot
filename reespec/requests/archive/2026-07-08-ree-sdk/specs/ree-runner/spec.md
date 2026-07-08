# Spec — ReeAgentRunner

## Capability: Implements AgentRunner

The `ReeAgentRunner` implements the existing `AgentRunner` interface (`prompt`, `abort`, `dispose`, `reset`) and is selected by `config.sdk = "ree"` (or `config.agent.runner = "ree"`) in the `createRunner` factory. It manages chats internally via a `ReeRuntime`.

### Scenarios

#### S1: ReeAgentRunner implements AgentRunner

**GIVEN** `ReeAgentRunner` is defined in `reeboot/src/agent-runner/ree-runner.ts`
**WHEN** an instance is created with `(runtime: ReeRuntime, context: ContextConfig, config: Config)`
**THEN** it has `prompt`, `abort`, `dispose`, `reset` methods (the `AgentRunner` interface)

#### S2: createRunner returns a ReeAgentRunner for config.sdk = "ree"

**GIVEN** the `createRunner` factory in `reeboot/src/agent-runner/index.ts`
**WHEN** `createRunner(context, { sdk: 'ree' } as any)` is called
**THEN** the returned instance is a `ReeAgentRunner` (not a `PiAgentRunner`)

#### S3: createRunner returns a ReeAgentRunner for config.agent.runner = "ree"

**GIVEN** the `createRunner` factory
**WHEN** `createRunner(context, { agent: { runner: 'ree' } } as any)` is called
**THEN** the returned instance is a `ReeAgentRunner`

## Capability: TanStack-AI-backed agent loop

`ReeAgentRunner.prompt()` consumes a TanStack AI `chat()` async iterable and translates `StreamChunk`s into `RunnerEvent`s and reeboot-shaped extension events.

### Scenarios

#### S4: prompt() with a text response emits the full event sequence

**GIVEN** a `ReeAgentRunner` with a mock TanStack client that returns a text response (no tool calls)
**WHEN** `runner.prompt('hello', onEvent)` is called
**THEN** the chat emits `before_agent_start`, `after_provider_response`, `turn_end`, `agent_end` (in order)

**AND** `onEvent` receives a `text_delta` RunnerEvent and a `message_end` RunnerEvent

#### S5: prompt() with a tool call executes the tool and feeds the result back

**GIVEN** a `ReeAgentRunner` with a mock TanStack client that returns a tool call on the first iteration and a text response on the second
**WHEN** `runner.prompt('use the tool', onEvent)` is called
**THEN** `tool_call` and `tool_result` events fire

**AND** the tool's `execute()` was called with the chat's `AbortSignal`

**AND** `onEvent` receives `tool_call_start` and `tool_call_end` RunnerEvents

**AND** a second LLM iteration occurs (the tool result was fed back)

#### S6: text_delta events stream as chunks arrive

**GIVEN** a `ReeAgentRunner` with a mock TanStack client that yields 3 text chunks
**WHEN** `runner.prompt('stream me a story', onEvent)` is called
**THEN** `onEvent` receives 3 distinct `text_delta` RunnerEvents (in order)

**AND** a single `message_end` RunnerEvent at the end

## Capability: Cancellation

`abort()` triggers the chat's `AbortController`, which is threaded into the TanStack `chat()` call and every `tool.execute()`. Cancellation is per-chat.

### Scenarios

#### S7: abort() cancels an in-flight prompt

**GIVEN** a `ReeAgentRunner` with a mock TanStack client that hangs (never resolves)
**WHEN** `runner.prompt('hang', onEvent)` is started, then `runner.abort()` is called
**THEN** the prompt rejects with an `AbortError`

**AND** the `AbortSignal` passed to the TanStack `chat()` call was aborted

#### S8: abort is per-chat (does not affect other chats)

**GIVEN** two `ReeAgentRunner`s (runnerA, runnerB) with hanging mock clients, sharing a `ReeRuntime`
**WHEN** runnerA's `abort()` is called while both have pending prompts
**THEN** runnerA's prompt rejects with `AbortError`

**AND** runnerB's signal is NOT aborted and its prompt is still pending (not rejected)

## Capability: Lifecycle

`dispose()` permanently tears down the chat; `reset()` clears history and emits `session_shutdown` so the chat is reusable.

### Scenarios

#### S9: dispose() tears down the chat

**GIVEN** a `ReeAgentRunner` with an active chat
**WHEN** `runner.dispose()` is called
**THEN** the chat's `session_shutdown` is emitted (reason `'quit'`)

**AND** listeners are removed

**AND** a subsequent `prompt()` throws (disposed)

#### S10: reset() clears history and keeps the chat reusable

**GIVEN** a `ReeAgentRunner` with messages in the chat's history
**WHEN** `runner.reset()` is called
**THEN** `session_shutdown` is emitted (reason `'new'`)

**AND** the chat's history is cleared

**AND** a subsequent `prompt()` works (does not throw)
