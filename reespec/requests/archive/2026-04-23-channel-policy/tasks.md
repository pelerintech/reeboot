# Tasks: Channel Policy Layer

---

### 1. Add fromSelf to IncomingMessage and extend ChannelAdapter with selfAddress()

- [x] **RED** — In `tests/channels/interface.test.ts`, add assertions: `IncomingMessage`
      accepts a `fromSelf?: boolean` field without TypeScript error; `ChannelAdapter`
      interface has a `selfAddress(): string | null` method. Run `npm run build` → fails
      (fields/method absent).

- [x] **ACTION** — In `src/channels/interface.ts`: add `fromSelf?: boolean` to
      `IncomingMessage`; add `selfAddress(): string | null` to `ChannelAdapter` interface.
      Add stub implementations to `WebAdapter` (returns `null`) and both existing adapters.

- [x] **GREEN** — Run `npm run build` → exits 0. Run `npx vitest run tests/channels/interface.test.ts` → passes.

---

### 2. Write the shared Tier 1 contract test suite

- [x] **RED** — Create `tests/channels/contract/runContractTests.ts` exporting
      `runChannelContractTests(factory)`. Create `tests/channels/contract/tier1.contract.test.ts`
      that calls it with a minimal stub adapter that intentionally violates every clause
      (throws on send, never sets fromSelf, etc.). Run `npx vitest run tests/channels/contract/` →
      all contract assertions fail against the stub.

- [x] **ACTION** — Implement all Tier 1 assertions in `runContractTests.ts` per
      `specs/channel-contract.spec.md`: send() silent drop, init() → 'initialising',
      stop() cleans up, fromSelf set, echo dedup suppresses echoes.

- [x] **GREEN** — Run `npx vitest run tests/channels/contract/tier1.contract.test.ts` →
      all assertions fail on the stub (confirms suite is exercising the right things).

---

### 3. Write the shared Tier 2 contract test suite

- [x] **RED** — Create `tests/channels/contract/runLiteContractTests.ts` exporting
      `runLiteContractTests(factory)`. Create `tests/channels/contract/tier2.contract.test.ts`
      calling it with a stub that drops `__system__` silently and throws on send. Run
      `npx vitest run tests/channels/contract/tier2.contract.test.ts` → assertions fail on stub.

- [x] **ACTION** — Implement all Tier 2 assertions per `specs/channel-contract.spec.md`:
      send() silent drop, `__system__` broadcasts to all peers, tolerates peer send errors,
      init() → 'initialising', stop() → 'disconnected'.

- [x] **GREEN** — Run `npx vitest run tests/channels/contract/tier2.contract.test.ts` →
      assertions fail on stub (suite is live and exercising real behaviour).

---

### 4. Fix web adapter: __system__ broadcasts to all peers

- [x] **RED** — Create `tests/channels/web.contract.test.ts` calling
      `runLiteContractTests(webAdapterFactory)`. Run
      `npx vitest run tests/channels/web.contract.test.ts` → `__system__` broadcast
      assertions fail (current impl silently drops).

- [x] **ACTION** — In `src/channels/web.ts` `send()`: when `peerId === '__system__'`,
      iterate all `_senders` values, call each with content, catch errors per-sender.
      Return after broadcasting.

- [x] **GREEN** — Run `npx vitest run tests/channels/web.contract.test.ts` → all
      Tier 2 contract assertions pass.

---

### 5. Fix Signal: send() status guard and observability logging

- [x] **RED** — In `tests/channels/signal.test.ts` add: (a) test that `send()` on a
      non-started adapter returns without throwing and makes no fetch call; (b) tests
      that `console.log` is called with `[Signal] Received message` on a valid inbound
      message and `[Signal] Skipping empty` on an empty-text envelope. Run
      `npx vitest run tests/channels/signal.test.ts` → new tests fail.

- [x] **ACTION** — In `src/channels/signal.ts`: add `if (this._status !== 'connected') return;`
      at the top of `send()`; add `console.log('[Signal] Received message ...')` after
      text extraction succeeds; add `console.log('[Signal] Skipping empty ...')` when
      text is empty.

- [x] **GREEN** — Run `npx vitest run tests/channels/signal.test.ts` → all pass.

---

### 6. Fix Signal: syncMessage self-destination filter

- [x] **RED** — In `tests/channels/signal.test.ts` add: (a) test that a `syncMessage`
      with `destinationNumber === phoneNumber` IS published to the bus; (b) test that
      a `syncMessage` with `destinationNumber !== phoneNumber` is NOT published.
      Run `npx vitest run tests/channels/signal.test.ts` → test (b) fails (currently
      publishes all syncMessages).

- [x] **ACTION** — In `src/channels/signal.ts` `_handleIncomingMessage()`: in the
      `syncMessage.sentMessage` branch, check
      `sent.destinationNumber === this._phoneNumber || sent.destination === this._phoneNumber`.
      If destination is a third party, return without publishing.

- [x] **GREEN** — Run `npx vitest run tests/channels/signal.test.ts` → all pass.

---

### 7. Fix Signal: echo deduplication

- [x] **RED** — In `tests/channels/signal.test.ts` add: a test that calls `send()` on
      the adapter and then delivers the same message back as a `syncMessage`; assert
      nothing is published to the bus within 10 seconds. Run
      `npx vitest run tests/channels/signal.test.ts` → test fails (message is published).

- [x] **ACTION** — In `src/channels/signal.ts`: add a `_sentKeys = new Set<string>()`
      field. In `send()`, after a successful POST, record a key of
      `${peerId}::${text.slice(0, 64)}` with a 10-second TTL (use `setTimeout` to delete).
      In `_handleIncomingMessage()` for syncMessage, check the same key; if present,
      skip and delete.

- [x] **GREEN** — Run `npx vitest run tests/channels/signal.test.ts` → all pass.

---

### 8. Run Signal adapter against Tier 1 contract suite

- [x] **RED** — Create `tests/channels/signal.contract.test.ts` calling
      `runChannelContractTests(signalAdapterFactory)` with a mock transport.
      Run `npx vitest run tests/channels/signal.contract.test.ts` → any remaining
      contract gaps surface as failures.

- [x] **ACTION** — Fixed remaining Signal gaps revealed by the contract suite:
      `init()` status was `'disconnected'` not `'initializing'`; `fromSelf` was not
      set on published messages. Both fixed.

- [x] **GREEN** — Run `npx vitest run tests/channels/signal.contract.test.ts` →
      all Tier 1 contract assertions pass.

---

### 9. Run WhatsApp adapter against Tier 1 contract suite

- [x] **RED** — Create `tests/channels/whatsapp.contract.test.ts` calling
      `runChannelContractTests(whatsappAdapterFactory)` with a mock baileys transport.
      Run `npx vitest run tests/channels/whatsapp.contract.test.ts` → any gaps surface.

- [x] **ACTION** — Added `setup()` hook to WA factory (calls `start()` + simulates
      connection-open for inbound tests). Added `fromSelf: !!fromMe` to WA published
      messages. Updated contract suite to call optional `setup()` before inbound tests.
      Fixed 3 existing send tests to simulate connection-open before sending.

- [x] **GREEN** — Run `npx vitest run tests/channels/whatsapp.contract.test.ts` →
      all Tier 1 contract assertions pass.

---

### 10. Implement ChannelPolicyLayer

- [x] **RED** — Create `tests/channels/policy.test.ts`. Add tests per
      `specs/policy-layer.spec.md`: Mode 1 owner resolution (fromSelf + no owner_id),
      Mode 2 owner resolution (peerId matches owner_id), non-owner dropped when
      owner_only, owner_only false passes all, `__system__` resolves to owner_id,
      `__system__` resolves via selfAddress() when no owner_id, lifecycle delegation.
      Run `npx vitest run tests/channels/policy.test.ts` → all fail (class does not exist).

- [x] **ACTION** — Created `src/channels/policy.ts` implementing `ChannelPolicyLayer`.
      Constructor takes inner adapter. `init()` reads `owner_id`, `owner_only` from config
      and wraps the bus with an interceptor that applies the owner gate before forwarding
      to the real bus. `send()` resolves `__system__` to `owner_id ?? inner.selfAddress()`
      and delegates. All other methods delegate directly.

- [x] **GREEN** — Run `npx vitest run tests/channels/policy.test.ts` → all pass.

---

### 11. Wire ChannelPolicyLayer into server channel init

- [x] **RED** — Added assertion to `tests/channels/registry.test.ts` that after
      `initChannels`, 'whatsapp' and 'signal' entries are `ChannelPolicyLayer` instances
      and 'web' is not. Run → fails (no wrapping occurs yet).

- [x] **ACTION** — In `src/channels/registry.ts`: import `ChannelPolicyLayer`, define
      `TIER1_CHANNEL_TYPES` set, wrap Tier 1 adapters before `init()`/`start()`. Removed
      now-redundant `owner_only` / `__system__` handling from WhatsApp and Signal adapters.

- [x] **GREEN** — Registry test passes. Full suite `npx vitest run` → 806 real tests
      pass (10 intentional broken-stub failures only). `npm run build` → exits 0.

---

### 12. Write CHANNEL_CONTRACT.md and update ChannelAdapter JSDoc

- [x] **RED** — Confirmed `src/channels/CHANNEL_CONTRACT.md` does not exist.

- [x] **ACTION** — Wrote `src/channels/CHANNEL_CONTRACT.md` covering both tiers with
      all clauses from `design.md`. `ChannelAdapter` interface JSDoc (added in Task 1)
      references the contract file and states the tier classification requirement.

- [x] **GREEN** — `CHANNEL_CONTRACT.md` exists, contains "Tier 1", "Tier 2",
      inbound/outbound/lifecycle sections, and the policy must-NOT list.
      `interface.ts` JSDoc references `CHANNEL_CONTRACT.md`. `npm run build` → exits 0.

---

### 13. Update config schema with owner_id and run full test suite

- [x] **RED** — Created `tests/channel-policy-config.test.ts` asserting
      `WhatsAppChannelSchema` and `SignalChannelSchema` accept `owner_id`. Run → 4 tests
      fail (field absent from schema).

- [x] **ACTION** — Added `owner_id: z.string().default('')` to `WhatsAppChannelSchema`
      and `SignalChannelSchema` in `src/config.ts`.

- [x] **GREEN** — Config tests pass. Full suite → 806 real tests pass, build clean.
