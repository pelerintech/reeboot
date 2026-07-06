# Spec — Typed Events

## Capability: Define Typed Event System

The typed event system is defined in `reeboot/src/extensions/extension-api.ts` via `ExtensionEventMap` and individual event payload types. Each event has a clearly defined structure.

### Scenarios

#### S1: ExtensionEventMap contains all 15 events

**GIVEN** `ExtensionEventMap` is defined  
**WHEN** a module accesses it  
**THEN** it contains exactly these 15 event keys:
- `before_agent_start`
- `agent_start`
- `agent_end`
- `turn_start`
- `turn_end`
- `session_start`
- `session_shutdown`
- `session_before_switch`
- `session_before_fork`
- `session_before_compact`
- `tool_call`
- `tool_result`
- `user_bash`
- `after_provider_response`
- `resources_discover`

#### S2: BeforeAgentStartEvent has systemPrompt field

**GIVEN** `BeforeAgentStartEvent` type is defined  
**WHEN** an extension handles this event  
**THEN** the event has:
- `type: 'before_agent_start'`
- `systemPrompt: string`

#### S3: ToolCallEvent has tool metadata

**GIVEN** `ToolCallEvent` type is defined  
**WHEN** an extension handles this event  
**THEN** the event has:
- `type: 'tool_call'`
- `toolCallId: string`
- `toolName: string`
- `args: unknown`

#### S4: SessionShutdownEvent has reason field

**GIVEN** `SessionShutdownEvent` type is defined  
**WHEN** an extension handles this event  
**THEN** the event has:
- `type: 'session_shutdown'`
- `sessionId: string`
- `reason: 'new' | 'quit' | 'reload' | 'resume' | 'fork'` (the full set of shutdown causes; extensions handle the values they care about — alternative SDKs may introduce additional reasons, which is forward-compatible)

#### S5: TurnEndEvent has usage data

**GIVEN** `TurnEndEvent` type is defined  
**WHEN** an extension handles this event  
**THEN** the event has:
- `type: 'turn_end'`
- `turnId: string`
- `sessionId: string`
- `usage?: { inputTokens: number; outputTokens: number; cost?: number }`

#### S6: All event types have discriminant 'type' field

**GIVEN** all 15 event types are defined  
**WHEN** TypeScript infers event types  
**THEN** each event type has a `type` field matching the event name (discriminated union)

#### S7: Event types are exportable

**GIVEN** event types are defined in `extension-api.ts`  
**WHEN** a module imports them  
**THEN** all 15 event payload types are individually exportable:
- `BeforeAgentStartEvent`
- `AgentStartEvent`
- `AgentEndEvent`
- `TurnStartEvent`
- `TurnEndEvent`
- `SessionStartEvent`
- `SessionShutdownEvent`
- `SessionBeforeSwitchEvent`
- `SessionBeforeForkEvent`
- `SessionBeforeCompactEvent`
- `ToolCallEvent`
- `ToolResultEvent`
- `UserBashEvent`
- `AfterProviderResponseEvent`
- `ResourcesDiscoverEvent`
