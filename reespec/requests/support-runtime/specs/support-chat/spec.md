# Spec — SupportChat

## Capability: Per-Chat Isolation and Event Emission

The `SupportChat` class represents one conversation's state. Each chat has isolated message history, its own tool registry, its own event emitter, and its own abort controller. Chats emit reeboot-defined events in reeboot's own shapes (not pi-shaped payloads).

### Scenarios

#### S1: SupportChat holds isolated state

**GIVEN** two `SupportChat` instances (chatA, chatB)
**WHEN** a tool is registered on chatA's adapter
**THEN** chatA's tool registry contains the tool

**AND** chatB's tool registry does NOT contain the tool

**AND** chatA's message history is independent of chatB's (appending to one does not affect the other)

#### S2: SupportChat emits before_agent_start in reeboot shape

**GIVEN** a `SupportChat` with a registered `before_agent_start` handler
**WHEN** the chat emits a `before_agent_start` event
**THEN** the handler receives a `BeforeAgentStartEvent` with `type: 'before_agent_start'`, `prompt: string`, `systemPrompt: string`, `systemPromptOptions`

**AND** the event is constructed by the chat/runtime in reeboot's shape (not forwarded from an external SDK)

#### S3: SupportChat emits turn_end in reeboot shape

**GIVEN** a `SupportChat` with a registered `turn_end` handler
**WHEN** the chat emits a `turn_end` event
**THEN** the handler receives a `TurnEndEvent` with `type: 'turn_end'`, `turnId: string`, `sessionId: string`, `turnIndex: number`, `message`, `toolResults`, and optional `usage?: TurnUsage`

#### S4: SupportChat emits session_shutdown in reeboot shape

**GIVEN** a `SupportChat` with a registered `session_shutdown` handler
**WHEN** the chat is disposed (emitting `session_shutdown`)
**THEN** the handler receives a `SessionShutdownEvent` with `type: 'session_shutdown'`, `sessionId: string`, `reason: 'quit' | 'reload' | 'new' | 'resume' | 'fork'`

#### S5: SupportChat emits tool_call and tool_result in reeboot shape

**GIVEN** a `SupportChat` with registered `tool_call` and `tool_result` handlers
**WHEN** a tool is invoked by the agent loop
**THEN** the `tool_call` handler receives a `ToolCallEvent` with `type`, `toolCallId`, `toolName`, `args`

**AND** the `tool_result` handler receives a `ToolResultEvent` with `type`, `toolCallId`, `toolName`, `input` (the original args), `content`, `isError`

#### S6: SupportChat emits after_provider_response in reeboot shape

**GIVEN** a `SupportChat` with a registered `after_provider_response` handler
**WHEN** the LLM provider responds
**THEN** the handler receives an `AfterProviderResponseEvent` with `type`, `contextId: string`, `provider: string`, `status: number`, `headers: Record<string, string>`

#### S7: Message history is bounded

**GIVEN** a `SupportChat` with `maxHistory: 5`
**WHEN** 10 messages are appended to the history
**THEN** the history contains only the 5 most recent messages (FIFO eviction)

#### S8: AbortController is per-chat

**GIVEN** two `SupportChat` instances (chatA, chatB)
**WHEN** chatA's abort controller is triggered
**THEN** chatB's abort controller is NOT triggered

**AND** chatB's in-flight operations continue unaffected

#### S9: Chat ID and session ID are stable

**GIVEN** a `SupportChat` created with chatId `'support-chat-42'`
**WHEN** `chat.sessionId` is accessed
**THEN** it returns `'support-chat-42'` (stable for the chat's lifetime)

**AND** after `reset()`, the chat retains the same `chatId` but signals a new session via `session_shutdown` reason `'new'`
