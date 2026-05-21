# Tasks — presence-feedback

## Task list

- [x] Task 1 — Extend ChannelAdapter interface with optional presence methods
- [x] Task 2 — WhatsApp: markRead on incoming messages
- [x] Task 3 — WhatsApp: startTyping / stopTyping with refresh loop
- [x] Task 4 — Signal: markRead on incoming messages
- [x] Task 5 — Signal: startTyping / stopTyping
- [x] Task 6 — Orchestrator: wire startTyping / stopTyping around runner.prompt
- [x] Task 7 — Update CHANGELOG.md
- [x] Task 8 — Add missing evaluation gap tests (PF-2-B, PF-3-B, PF-4-C, PF-4-E)

---

### 1. Extend ChannelAdapter interface with optional presence methods

- [x] **RED** — In `tests/channels/interface.test.ts`, add a test: create a minimal
      object implementing only the current required `ChannelAdapter` methods (no
      `markRead`, `startTyping`, `stopTyping`), assert TypeScript accepts it as
      `ChannelAdapter` by calling a function typed `(a: ChannelAdapter) => void`.
      Run `npx tsc --noEmit` from `reeboot/` → passes (baseline). Then add
      a separate assertion comment noting the three optional methods are absent;
      confirm `grep -c "markRead\|startTyping\|stopTyping" src/channels/interface.ts`
      returns `0` → assertion fails (methods not yet on interface).
- [x] **ACTION** — Add to `ChannelAdapter` in `src/channels/interface.ts`:
      `markRead?(msg: IncomingMessage): Promise<void>;`
      `startTyping?(msg: IncomingMessage): Promise<void>;`
      `stopTyping?(msg: IncomingMessage): Promise<void>;`
      all optional. No changes to any adapter.
- [x] **GREEN** — Run `grep -c "markRead\|startTyping\|stopTyping" src/channels/interface.ts`
      returns `3`. Run `npx tsc --noEmit` → exits 0 (no regressions on existing
      adapters). Run `npx vitest run tests/channels/interface.test.ts` → passes.

---

### 2. WhatsApp: markRead on incoming messages

- [x] **RED** — In `tests/channels/whatsapp.test.ts`, add a test in the existing
      describe block: after `adapter.start()`, attach a listener to the bus, emit
      a `messages.upsert` notify event with a valid text message including a `key`
      field. Assert `mockSocket.readMessages` was called with `[msg.key]` and was
      called **before** the bus published the message (use call order tracking via
      a spy on `bus.publish` or a flag set in the bus listener).
      Run `npx vitest run tests/channels/whatsapp.test.ts` → new test fails
      (`readMessages` not called).
- [x] **ACTION** — Add `readMessages: vi.fn().mockResolvedValue(undefined)` to
      `mockSocket` in the test file. In `WhatsAppAdapter._connect()`, add
      `sock.readMessages` to the socket type. In the `messages.upsert` handler,
      call `sock.readMessages([msg.key]).catch(() => {})` immediately after the
      message passes validation and before `this._bus?.publish(...)`.
- [x] **GREEN** — Run `npx vitest run tests/channels/whatsapp.test.ts` → all tests
      pass including the new read-receipt test.

---

### 3. WhatsApp: startTyping / stopTyping with refresh loop

- [x] **RED** — In `tests/channels/whatsapp.test.ts`, add tests using `vi.useFakeTimers()`:       (a) `startTyping` calls `sock.sendPresenceUpdate('composing', peerId)` immediately;
      (b) after 8s `sendPresenceUpdate` is called again;
      (c) `stopTyping` calls `sock.sendPresenceUpdate('paused', peerId)` and no further
      composing updates fire after the next 8s interval.
      Add `sendPresenceUpdate: vi.fn().mockResolvedValue(undefined)` to `mockSocket`.
      Run `npx vitest run tests/channels/whatsapp.test.ts` → new tests fail
      (`startTyping` / `stopTyping` not defined on adapter).
- [x] **ACTION** — Add `TYPING_REFRESH_MS = 8_000` constant to `whatsapp.ts`.
      Add `private _typingIntervals = new Map<string, ReturnType<typeof setInterval>>()`.
      Implement `async startTyping(msg: IncomingMessage)`: call
      `sock.sendPresenceUpdate('composing', peerId)` immediately, then set an
      interval calling it every `TYPING_REFRESH_MS`, stored in `_typingIntervals` keyed
      by `msg.peerId`. Wrap in try/catch.
      Implement `async stopTyping(msg: IncomingMessage)`: clear the interval for
      `msg.peerId`, call `sock.sendPresenceUpdate('paused', msg.peerId)`. Wrap in
      try/catch. Guard both methods with `if (!this._socket) return`.
- [x] **GREEN** — Run `npx vitest run tests/channels/whatsapp.test.ts` → all tests
      pass. Run `npx tsc --noEmit` → exits 0.

---

### 4. Signal: markRead on incoming messages

- [x] **RED** — In `tests/channels/signal.test.ts`, add a test: after connecting the
      adapter (mock fetch for `/v1/about` returning normal mode), simulate an incoming
      poll message from `"+15559876543"` with a known timestamp. Assert that `fetch`
      was called with `POST /v1/receipts/...` containing `receipt_type: "read"` and
      the message timestamp **before** the bus publish.
      Run `npx vitest run tests/channels/signal.test.ts` → new test fails (receipts
      endpoint not called).
- [x] **ACTION** — In `SignalAdapter._handleIncomingMessage()`, after the message
      passes validation (text extracted, not a self-echo) and before
      `this._bus?.publish(...)`, call `this._markReadInternal(peerId, msg.timestamp)`
      (a private async helper). Implement `markRead(msg)` as the public method calling
      the same helper. The helper: `POST /v1/receipts/${encoded}` with body
      `{ recipient, receipt_type: 'read', timestamp }`. Wrap in try/catch. Guard
      with `if (this._status !== 'connected') return`.
- [x] **GREEN** — Run `npx vitest run tests/channels/signal.test.ts` → all tests
      pass. Run `npx tsc --noEmit` → exits 0.

---

### 5. Signal: startTyping / stopTyping

- [x] **RED** — In `tests/channels/signal.test.ts`, add tests:
      (a) `startTyping` calls `PUT /v1/typing-indicator/<encoded-number>` with body
      `{ "recipient": peerId }`;
      (b) `stopTyping` calls `DELETE /v1/typing-indicator/<encoded-number>` with
      body `{ "recipient": peerId }`;
      (c) errors from fetch do not throw.
      Run `npx vitest run tests/channels/signal.test.ts` → new tests fail
      (`startTyping` / `stopTyping` not defined).
- [x] **ACTION** — In `SignalAdapter`, implement:
      `async startTyping(msg)`: `PUT ${this._baseUrl}/v1/typing-indicator/${encoded}`
      with JSON body `{ recipient: msg.peerId }`. Wrap in try/catch. Guard with
      `if (this._status !== 'connected') return`.
      `async stopTyping(msg)`: same endpoint, `DELETE` method. Wrap in try/catch.
      Guard similarly. No refresh interval — Signal handles expiry natively.
- [x] **GREEN** — Run `npx vitest run tests/channels/signal.test.ts` → all tests
      pass. Run `npx tsc --noEmit` → exits 0.

---

### 6. Orchestrator: wire startTyping / stopTyping around runner.prompt

- [x] **RED** — In `tests/orchestrator.test.ts`, add tests:
      (a) `makeAdapter()` gains optional `startTyping` and `stopTyping` vi.fn() mocks;
      test that on a `"whatsapp"` turn, `startTyping` is called before
      `runner.prompt` and `stopTyping` is called after;
      (b) on a turn that times out (runner never resolves, short timeout config),
      `stopTyping` is still called;
      (c) on a turn that errors, `stopTyping` is still called;
      (d) for channelType `"scheduler"`, `startTyping` is NOT called.
      Run `npx vitest run tests/orchestrator.test.ts` → new tests fail
      (`startTyping` / `stopTyping` not called by orchestrator).
- [x] **ACTION** — In `Orchestrator._runTurn()`:
      Add `const SKIP_PRESENCE_CHANNELS = new Set(['scheduler','recovery','heartbeat','memory'])`.
      After the budget/disk checks and before the runner loop, add:
      ```
      const skipPresence = SKIP_PRESENCE_CHANNELS.has(msg.channelType);
      const presenceAdapter = this._adapters.get(msg.channelType);
      if (!skipPresence) {
        await presenceAdapter?.startTyping?.(msg).catch(() => {});
      }
      ```
      Wrap the entire `while(true)` retry loop in a `try/finally`:
      ```
      try {
        while (true) { /* existing loop */ }
      } finally {
        if (!skipPresence) {
          await presenceAdapter?.stopTyping?.(msg).catch(() => {});
        }
      }
      ```
      Ensure the existing timeout/error returns inside the loop become either
      `return` after `break` or rely on `finally` — adjust flow so `finally`
      fires on all paths including `return` inside the loop.
- [x] **GREEN** — Run `npx vitest run tests/orchestrator.test.ts` → all tests pass
      including new presence-wiring tests. Run `npx vitest run` (full suite) → no
      regressions. Run `npx tsc --noEmit` → exits 0.

---

### 7. Update CHANGELOG.md

- [x] **RED** — Check: `agent/CHANGELOG.md` `[Unreleased]` section does not contain
      any entry mentioning read receipts or typing indicators.
      Run `grep -i "read receipt\|typing indicator\|presence" agent/CHANGELOG.md` → no matches.
- [x] **ACTION** — Add under `## [Unreleased]` → `### Added`:
      - Read receipts on WhatsApp and Signal — incoming messages are marked as read
        (blue ticks / read receipt) immediately on arrival, before the agent turn begins.
      - Typing indicator on WhatsApp and Signal — three-dot typing indicator is shown
        for the full duration of an agent turn. WhatsApp indicator refreshes every 8 seconds
        to stay alive during long-running tasks (research, multi-step planning).
        Disappearing dots with no reply serve as an implicit signal that the agent
        encountered a problem.
- [x] **GREEN** — Run `grep -i "read receipt\|typing indicator" agent/CHANGELOG.md` → matches
      both entries under `[Unreleased]`.
