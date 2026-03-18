## ADDED Requirements

### Requirement: AgentRunner interface is defined
`src/agent-runner/interface.ts` SHALL export `RunnerEvent` (discriminated union), `AgentRunner` interface, and `AgentRunnerFactory` interface. The orchestrator and WebSocket handler SHALL only depend on these interfaces, never on pi SDK types directly.

#### Scenario: Interface types are importable
- **WHEN** another module imports from `reeboot/agent-runner`
- **THEN** the types `AgentRunner`, `AgentRunnerFactory`, `RunnerEvent` are available with no pi SDK transitive types exposed

### Requirement: PiAgentRunner translates pi SDK events to RunnerEvent
`PiAgentRunner` SHALL subscribe to the pi `AgentSession` event stream and translate each event to the corresponding `RunnerEvent` type: `text_delta` → `text_delta`, tool execution start → `tool_call_start`, tool execution end → `tool_call_end`, `agent_end` → `message_end`. Unrecognised pi events SHALL be silently ignored.

#### Scenario: Text delta events are forwarded
- **WHEN** pi session emits a text delta event during a prompt
- **THEN** the `onEvent` callback receives `{ type: "text_delta", delta: "<text>" }`

#### Scenario: Tool call events are forwarded
- **WHEN** pi session executes a tool
- **THEN** `onEvent` receives `tool_call_start` followed by `tool_call_end` with the result

#### Scenario: Message end resolves the prompt promise
- **WHEN** pi session emits `agent_end`
- **THEN** `onEvent` receives `{ type: "message_end", usage: { input, output } }` and the `prompt()` promise resolves

### Requirement: AgentRunnerFactory reads config to select implementation
`src/agent-runner/index.ts` SHALL export a factory function `createRunner(context, config)` that reads `config.agent.runner` and instantiates the matching implementation. For Phase 1 the only valid value is `"pi"`. An unknown runner value SHALL throw a descriptive error.

#### Scenario: "pi" runner config creates PiAgentRunner
- **WHEN** `createRunner(context, { agent: { runner: "pi" } })` is called
- **THEN** the returned runner is an instance of `PiAgentRunner`

#### Scenario: Unknown runner value throws
- **WHEN** `createRunner(context, { agent: { runner: "unknown" } })` is called
- **THEN** an error is thrown with message "Unknown agent runner: unknown"

### Requirement: abort() cancels in-flight prompt
Calling `abort()` on an active `PiAgentRunner` SHALL call the pi session's abort method. The `prompt()` promise SHALL reject with an `AbortError` or resolve with an `error` RunnerEvent.

#### Scenario: Abort cancels the running turn
- **WHEN** `runner.abort()` is called while `runner.prompt()` is in-flight
- **THEN** the pi session abort is triggered and the prompt promise settles

### Requirement: dispose() cleans up the pi session
Calling `dispose()` on a `PiAgentRunner` SHALL call the pi session's dispose/cleanup method, persisting any session state and releasing resources.

#### Scenario: Dispose is idempotent
- **WHEN** `runner.dispose()` is called twice
- **THEN** no error is thrown on the second call

### Requirement: PiAgentRunner supports reload() for hot-reloading extensions
`PiAgentRunner` SHALL expose a `reload()` method that calls `loader.reload()` on the underlying `DefaultResourceLoader`. This is called when `reeboot reload` is invoked without restarting the process.

#### Scenario: reload() triggers loader reload
- **WHEN** `runner.reload()` is called
- **THEN** `DefaultResourceLoader.reload()` is invoked on the runner's loader instance
