# Tasks: Channel Trust

## 1. Trust resolution function

- [x] **RED** — Write `tests/trust.test.ts` (extend from permission-tiers task): add cases for `resolveMessageTrust()` — channel default owner, channel default end-user, sender override, unknown channel fallback. Run `npx vitest run tests/trust.test.ts` → fails (`resolveMessageTrust` not exported from `src/trust.ts`).
- [x] **ACTION** — Add `MessageTrust` type and `resolveMessageTrust(channelType, peerId, config)` to `src/trust.ts`.
- [x] **GREEN** — Run `npx vitest run tests/trust.test.ts` → passes.

---

## 2. Config schema — channel trust fields

- [x] **RED** — Write `tests/channel-trust-config.test.ts`: assert `loadConfig()` with `channels.web.trust = 'end-user'` parses correctly; assert config without trust fields defaults to `'owner'`; assert `trusted_senders` parses and defaults to `[]`. Run `npx vitest run tests/channel-trust-config.test.ts` → fails (fields not in schema).
- [x] **ACTION** — Add `trust: z.enum(['owner', 'end-user']).default('owner')` and `trusted_senders: z.array(z.string()).default([])` to `WebChannelSchema`, `WhatsAppChannelSchema`, and `SignalChannelSchema` in `src/config.ts`.
- [x] **GREEN** — Run `npx vitest run tests/channel-trust-config.test.ts` → passes.

---

## 3. Config schema — contexts tool whitelist

- [x] **RED** — Add to `tests/channel-trust-config.test.ts`: assert `loadConfig()` with `contexts: [{ name: 'support', tools: { whitelist: ['send_message'] } }]` parses correctly; assert missing `contexts` defaults to `[]`. Run → fails (field not in schema).
- [x] **ACTION** — Add `ContextConfigEntrySchema` and `contexts: z.array(ContextConfigEntrySchema).default([])` to `ConfigSchema` in `src/config.ts`.
- [x] **GREEN** — Run `npx vitest run tests/channel-trust-config.test.ts` → passes.

---

## 4. IncomingMessage trust field

- [x] **RED** — Write `tests/channel-trust.test.ts`: construct an `IncomingMessage` with `trust: 'end-user'`; assert the field is preserved through `createIncomingMessage()`; construct one without `trust` and assert it is `undefined`. Run `npx vitest run tests/channel-trust.test.ts` → fails (field not in interface).
- [x] **ACTION** — Add `trust?: MessageTrust` to the `IncomingMessage` interface in `src/channels/interface.ts`.
- [x] **GREEN** — Run `npx vitest run tests/channel-trust.test.ts` → passes.

---

## 5. Orchestrator attaches trust to messages

- [x] **RED** — Add to `tests/channel-trust.test.ts`: instantiate `Orchestrator` with a config having `channels.web.trust = 'end-user'`; publish a message with `channelType: 'web'` and no `trust`; capture what the runner receives; assert `runner.lastPromptOptions.trust === 'end-user'`. Run → fails (orchestrator does not resolve or attach trust).
- [x] **ACTION** — In `Orchestrator._handleMessage()`, call `resolveMessageTrust(msg.channelType, msg.peerId, fullConfig)` and attach result to message before dispatch. Pass the resolved trust through to `runner.prompt()` via the new options parameter.
- [x] **GREEN** — Run `npx vitest run tests/channel-trust.test.ts` → passes.

---

## 6. Runner stores per-turn trust

- [x] **RED** — Add to `tests/channel-trust.test.ts`: call `runner.prompt(content, onEvent, { trust: 'end-user' })` on a `PiAgentRunner`; assert the runner's internal `_currentTrust` reflects `'end-user'`; call again with `{ trust: 'owner' }`; assert it updates to `'owner'`. Run → fails (interface doesn't accept options; runner ignores trust).
- [x] **ACTION** — Add optional `options?: { trust?: MessageTrust }` to `AgentRunner.prompt()` interface and `PiAgentRunner.prompt()` implementation. Store `this._currentTrust = options?.trust ?? 'owner'`.
- [x] **GREEN** — Run `npx vitest run tests/channel-trust.test.ts` → passes.

---

## 7. Tool whitelist enforcement — end-user blocked

- [x] **RED** — Add to `tests/channel-trust.test.ts`: set up a `PiAgentRunner` with a context config `tools.whitelist = ['send_message']`; mock the pi session `tool_call` hook; call `prompt()` with `trust: 'end-user'`; trigger a tool call for `bash`; assert the hook returns `{ block: true }`. Run → fails (no whitelist enforcement hook).
- [x] **ACTION** — In `PiAgentRunner._getOrCreateSession()`, register a `tool_call` hook that reads `this._currentTrust` and `this._toolWhitelist`; returns `{ block: true, reason: ... }` if trust is `'end-user'`, whitelist is non-empty, and tool name is not in whitelist.
- [x] **GREEN** — Run `npx vitest run tests/channel-trust.test.ts` → passes.

---

## 8. Tool whitelist enforcement — owner unrestricted and empty whitelist

- [x] **RED** — Add to `tests/channel-trust.test.ts`: same setup with `trust: 'owner'` — assert `bash` tool call is NOT blocked; repeat with `trust: 'end-user'` and empty whitelist `[]` — assert NOT blocked. Run → fails (edge cases not yet handled).
- [x] **ACTION** — In the `tool_call` hook: short-circuit and return `undefined` if `_currentTrust === 'owner'` or `_toolWhitelist.length === 0`.
- [x] **GREEN** — Run `npx vitest run tests/channel-trust.test.ts` → passes.

---

## 9. Full test suite green

- [x] **RED** — Check: `npx vitest run` exits non-zero or has failures from schema additions or interface changes.
- [x] **ACTION** — Fix any existing tests broken by `IncomingMessage` interface extension, `ConfigSchema` additions, or `AgentRunner` interface change.
- [x] **GREEN** — Run `npx vitest run` → all tests pass, exit 0.
