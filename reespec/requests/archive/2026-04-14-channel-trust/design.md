# Design: Channel Trust

## Architecture Overview

```
config.json
  channels.web.trust / .trusted_senders
  channels.whatsapp.trust / .trusted_senders
  channels.signal.trust / .trusted_senders
  contexts[].name / .tools.whitelist

src/trust.ts  (extended from permission-tiers)
  + MessageTrust type ('owner' | 'end-user')
  + resolveMessageTrust(channelType, peerId, config) → MessageTrust

channels/interface.ts
  IncomingMessage + trust?: MessageTrust   ← new field

orchestrator.ts
  _handleMessage() resolves trust from message
  attaches trust to IncomingMessage before dispatch

agent-runner/interface.ts
  prompt(content, onEvent, options?: { trust?: MessageTrust })  ← new optional param

agent-runner/pi-runner.ts
  stores _currentTrust per prompt call
  tool_call hook enforces whitelist against _currentTrust

src/extensions/trust-enforcer.ts  (new bundled extension)
  registered when context has a tools.whitelist
  tool_call hook: blocks tools not in whitelist for end-user sessions
```

---

## Trust Resolution

Trust resolution is a two-step lookup: sender override first, channel default second.

```typescript
// src/trust.ts additions

export type MessageTrust = 'owner' | 'end-user';

export function resolveMessageTrust(
  channelType: string,
  peerId: string,
  config: Config,
): MessageTrust {
  const ch = config.channels[channelType as keyof typeof config.channels] as any;
  if (!ch) return 'owner';                          // unknown channel → conservative default

  const trustedSenders: string[] = ch.trusted_senders ?? [];
  if (trustedSenders.includes(peerId)) return 'owner';  // sender override wins

  return (ch.trust as MessageTrust) ?? 'owner';     // channel default
}
```

Default is `'owner'` throughout. This preserves existing behavior — all current deployments with no trust config continue to work exactly as before.

---

## IncomingMessage Extension

```typescript
// channels/interface.ts
export interface IncomingMessage {
  channelType: string;
  peerId: string;
  content: string;
  timestamp: number;
  raw: unknown;
  trust?: MessageTrust;    // ← new optional field; absent = 'owner' (no restriction)
}
```

The field is optional so existing call sites creating `IncomingMessage` objects do not break.

---

## Orchestrator Change

In `_handleMessage()`, after routing is resolved and before dispatching to the runner, resolve and attach trust:

```typescript
private _handleMessage(msg: IncomingMessage): void {
  // Resolve trust if config available
  if (this._config.channels && msg.trust === undefined) {
    msg = { ...msg, trust: resolveMessageTrust(msg.channelType, msg.peerId, this._fullConfig) };
  }
  // ... existing routing + dispatch
}
```

The orchestrator needs access to the full config to call `resolveMessageTrust`. It currently receives an `OrchestratorConfig` (partial). The full `Config` is passed alongside or `OrchestratorConfig` is extended with the channel trust fields.

---

## Runner — Per-Turn Trust Context

`AgentRunner.prompt()` gets an optional third parameter:

```typescript
// agent-runner/interface.ts
prompt(
  content: string,
  onEvent: (event: RunnerEvent) => void,
  options?: { trust?: MessageTrust }
): Promise<void>;
```

`PiAgentRunner` stores the current trust level and a reference to the context whitelist:

```typescript
private _currentTrust: MessageTrust = 'owner';
private _toolWhitelist: string[] = [];

async prompt(content, onEvent, options?) {
  this._currentTrust = options?.trust ?? 'owner';
  // ... existing session + prompt logic
}
```

A `tool_call` hook registered once at session creation reads `_currentTrust`:

```typescript
session.on('tool_call', async (event) => {
  if (this._currentTrust === 'owner') return undefined;      // no restriction
  if (this._toolWhitelist.length === 0) return undefined;    // no whitelist = no restriction
  if (this._toolWhitelist.includes(event.toolName)) return undefined; // allowed
  return { block: true, reason: `Tool "${event.toolName}" is not available in this context` };
});
```

The whitelist is loaded from `config.contexts` by matching the context ID that the runner is associated with.

---

## Config Schema Changes

### Channel trust fields (added to each existing channel schema)

```typescript
// Added to WebChannelSchema, WhatsAppChannelSchema, SignalChannelSchema:
trust: z.enum(['owner', 'end-user']).default('owner'),
trusted_senders: z.array(z.string()).default([]),
```

Default `'owner'` means all existing configs continue to work without modification.

### New `contexts` config array

```typescript
const ContextToolsSchema = z.object({
  whitelist: z.array(z.string()).default([]),
});

const ContextConfigEntrySchema = z.object({
  name: z.string(),
  tools: ContextToolsSchema.default({}),
});

// Added to ConfigSchema:
contexts: z.array(ContextConfigEntrySchema).default([]),
```

An empty `whitelist` means no restriction — all tools available. This preserves existing behavior when the field is absent.

---

## Tool Whitelist Enforcement

The whitelist is enforced at the `tool_call` hook level inside `PiAgentRunner`. Key behaviors:

- **`trust === 'owner'`**: no restriction regardless of whitelist
- **`trust === 'end-user'` + empty whitelist**: no restriction (opt-in model)
- **`trust === 'end-user'` + non-empty whitelist**: only listed tools are callable
- **Blocked call**: returns `{ block: true, reason: ... }` — tool call is not executed, agent receives the reason as tool output and can respond to the user accordingly

The whitelist applies to all tool names: both pi built-in tools (read, write, bash, etc.) and extension-registered tools (mcp, web_search, etc.).

---

## Backward Compatibility

All changes are additive and default to existing behavior:
- `IncomingMessage.trust` is optional — existing code creating messages without trust continues to work
- Channel config trust defaults to `'owner'` — existing channels are unrestricted
- `trusted_senders` defaults to `[]` — no sender-level overrides unless configured
- Context whitelist defaults to `[]` (empty = no restriction)
- `prompt()` options is optional — existing callers not passing it get `trust === 'owner'`

---

## Risks

**Schema collision with existing `contexts` concept**: reeboot uses `contexts` as a DB concept (context rows in SQLite). Adding a `contexts` key to `config.json` introduces a naming overlap. The config `contexts` is declarative (tool permissions); the DB `contexts` is runtime state (sessions, workspace). They are separate — but this could confuse users. Mitigated by clear documentation in the config schema comments.

**Multi-instance channels**: the current config supports one instance per channel type (one whatsapp, one signal). The brief's aspirational config shows multiple instances (personal + business whatsapp). This is not addressed in v1 — a single set of trust settings per channel type is sufficient for now.
