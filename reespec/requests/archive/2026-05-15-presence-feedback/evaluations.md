# Evaluations — presence-feedback

---

## Evaluation — 2026-05-14 18:01

### PF-1 — ChannelAdapter presence interface
verdict:  ✅ SATISFIED
reason:  interface.ts contains `markRead?`, `startTyping?`, `stopTyping?` as optional methods. `tsc --noEmit` exits 0 confirming existing adapters compile unchanged. Contract stub test (`tier1.contract.test.ts`) passes with its load-bearing failures intact.

### PF-2 — WhatsApp presence implementation
verdict:  ⚠️ PARTIAL
reason:  PF-2-C (composing immediately), PF-2-D (8s refresh), PF-2-E (paused + interval cleanup), PF-2-F (error isolation), PF-2-G (markRead before publish) all have passing tests. However, **PF-2-B** ("markRead is a no-op when socket is not connected") has **no explicit test** — the guard `if (!this._socket) return` exists in code but is not verified by a test case.
focus:  tests/channels/whatsapp.test.ts — missing test for markRead no-op when `_socket` is null

### PF-3 — Signal presence implementation
verdict:  ⚠️ PARTIAL
reason:  PF-3-A (read receipt POST), PF-3-C (typing PUT), PF-3-D (typing DELETE), PF-3-E (error isolation), PF-3-F (markRead before publish) all have passing tests. However, **PF-3-B** ("markRead is a no-op when adapter is not connected") has **no explicit test** — the guard `if (this._status !== 'connected') return` exists but is not independently tested.
focus:  tests/channels/signal.test.ts — missing test for markRead/startTyping/stopTyping no-op when status is 'disconnected'

### PF-4 — Orchestrator presence wiring
verdict:  ⚠️ PARTIAL
reason:  **PF-4-C** ("stopTyping is called after a turn timeout") has **no direct test** — the timeout test ("journal remains open after turn timeout") from a prior request was not updated to verify `stopTyping`. The `try/finally` structure covers it in code, but it's untested. **PF-4-E** ("No presence calls for synthetic channel types") tests only `"scheduler"` — the spec requires `"heartbeat"`, `"recovery"`, and `"memory"` as well. PF-4-A (startTyping before prompt), PF-4-B (stopTyping after success), PF-4-D (stopTyping after error), PF-4-F (missing methods skipped) are all covered by passing tests.
focus:  tests/orchestrator.test.ts — (1) no timeout test for stopTyping, (2) synthetic channel test only covers 'scheduler'

## Triage

✅ Safe to skip:   PF-1

⚠️  Worth a look:
- PF-2 — markRead no-op when WhatsApp socket null: guard exists in code, test absent
- PF-3 — markRead/typing no-op when Signal not connected: guard exists in code, test absent
- PF-4 — (a) stopTyping after timeout untested; (b) synthetic channel test covers only 'scheduler' of 4 required types

---

## Evaluation — 2026-05-15 10:03

### PF-1-A: Optional methods are defined on the interface
verdict:  ✅ SATISFIED
reason:   src/channels/interface.ts defines `markRead?`, `startTyping?`, and
          `stopTyping?` — all typed as `(msg: IncomingMessage): Promise<void>`
          and all marked optional with `?`.

### PF-1-B: Adapters without presence methods remain valid
verdict:  ✅ SATISFIED
reason:   The orchestrator test "missing presence methods are silently skipped"
          (tests/orchestrator.test.ts:309) uses an adapter without `startTyping`
          or `stopTyping` and confirms no type or runtime error. TypeScript
          compiles cleanly (all 78 tests pass).

### PF-1-C: Broken Tier 1 contract stub still compiles and fails as designed
verdict:  ✅ SATISFIED
reason:   tests/channels/contract/tier1.contract.test.ts exists and uses the
          intentionally broken BrokenTier1Adapter stub. The test file passes in
          the suite (4 test files, 78 tests, 0 failures), confirming the stub
          still compiles without type errors and contract-violation tests behave
          as expected.

### PF-2-A: markRead sends a read receipt via Baileys
verdict:  ✅ SATISFIED
reason:   src/channels/whatsapp.ts implements markRead calling
          `sock.readMessages([rawKey])`. Test "markRead is called on incoming
          messages before bus publish" (whatsapp.test.ts:302) asserts
          `readMessages` is called and passes.

### PF-2-B: markRead is a no-op when socket is not connected
verdict:  ⚠️ PARTIAL
reason:   Spec requires "GIVEN a WhatsApp adapter that is not connected
          (`_socket` is null) WHEN markRead is called THEN sock.readMessages
          is NOT called AND no error is thrown." The implementation guards
          correctly (`if (!this._socket) return`) but no test exists for this
          path in whatsapp.test.ts.
focus:    tests/channels/whatsapp.test.ts — test for markRead no-op when
          _socket is null is absent.

### PF-2-C: startTyping sends composing presence immediately
verdict:  ✅ SATISFIED
reason:   Test "startTyping sends composing presence immediately"
          (whatsapp.test.ts) asserts `sendPresenceUpdate('composing', peerId)`
          is called on `startTyping`. Passes.

### PF-2-D: startTyping refreshes composing presence every 8 seconds
verdict:  ✅ SATISFIED
reason:   Test "startTyping refreshes composing presence every 8 seconds" uses
          `vi.useFakeTimers()` and advances by 8s twice, asserting 3 total
          calls. Passes.

### PF-2-E: stopTyping sends paused presence and clears the refresh interval
verdict:  ✅ SATISFIED
reason:   Test "stopTyping sends paused presence and stops the refresh interval"
          asserts `sendPresenceUpdate('paused', peerId)` and confirms no further
          composing updates fire after stopTyping. Passes.

### PF-2-F: startTyping errors do not propagate
verdict:  ✅ SATISFIED
reason:   Test "startTyping errors do not propagate" mocks `sendPresenceUpdate`
          to reject and asserts `startTyping` resolves without throwing. Passes.

### PF-2-G: markRead is called on incoming messages before bus publish
verdict:  ✅ SATISFIED
reason:   Test "markRead is called on incoming messages before bus publish"
          (whatsapp.test.ts:302) records call order and asserts `readMessages`
          precedes `publish`. Passes.

### PF-3-A: markRead posts a read receipt to the REST API
verdict:  ✅ SATISFIED
reason:   src/channels/signal.ts calls POST /v1/receipts/<encoded-number> with
          correct body. Test "markRead is called on incoming messages before bus
          publish (json-rpc)" (signal.test.ts:213) verifies the receipts call
          fires and precedes bus publish. Passes.

### PF-3-B: markRead is a no-op when adapter is not connected
verdict:  ⚠️ PARTIAL
reason:   Spec requires "GIVEN a Signal adapter with status() !== 'connected'
          WHEN markRead is called THEN no HTTP request is made AND no error is
          thrown." The implementation guards correctly
          (`if (this._status !== 'connected') return`) but no test covers this
          path in signal.test.ts.
focus:    tests/channels/signal.test.ts — test for markRead no-op when not
          connected is absent.

### PF-3-C: startTyping sends a PUT to the typing-indicator endpoint
verdict:  ✅ SATISFIED
reason:   Test "startTyping sends PUT to typing-indicator endpoint"
          (signal.test.ts) asserts method=PUT, correct URL with encoded phone,
          and body `{ recipient: peerId }`. Passes.

### PF-3-D: stopTyping sends a DELETE to the typing-indicator endpoint
verdict:  ✅ SATISFIED
reason:   Test "stopTyping sends DELETE to typing-indicator endpoint"
          (signal.test.ts) asserts method=DELETE, correct URL, correct body.
          Passes.

### PF-3-E: Presence errors do not propagate
verdict:  ✅ SATISFIED
reason:   Test "presence errors do not propagate" mocks fetch to reject and
          asserts all three methods (markRead, startTyping, stopTyping) resolve
          without throwing. Passes.

### PF-3-F: markRead is called on incoming messages before bus publish
verdict:  ✅ SATISFIED
reason:   Test "markRead is called on incoming messages before bus publish
          (json-rpc)" (signal.test.ts:213) records call order and asserts
          receipts POST precedes bus publish. Passes.

### PF-4-A: startTyping is called at the start of a real user turn
verdict:  ✅ SATISFIED
reason:   Test "startTyping is called before runner.prompt and stopTyping after
          response" (orchestrator.test.ts:263) asserts `adapter.startTyping`
          was called. Passes.

### PF-4-B: stopTyping is called after a successful turn
verdict:  ✅ SATISFIED
reason:   Same test as PF-4-A asserts `adapter.stopTyping` was called after
          a successful turn. Passes.

### PF-4-C: stopTyping is called after a turn timeout
verdict:  ⚠️ PARTIAL
reason:   Spec requires "GIVEN a very short turnTimeout AND a runner that never
          resolves WHEN the turn times out THEN adapter.stopTyping is called."
          The implementation is correct — `return` inside `try {}` triggers the
          `finally` block — but there is no test asserting `stopTyping` fires
          specifically on timeout. The only timeout test (orchestrator.test.ts:698
          "journal remains open after turn timeout") does not check presence.
focus:    tests/orchestrator.test.ts — stopTyping-on-timeout assertion is absent.

### PF-4-D: stopTyping is called after a turn error
verdict:  ✅ SATISFIED
reason:   Test "stopTyping is called after a turn that errors"
          (orchestrator.test.ts:276) uses a runner that rejects and asserts both
          startTyping and stopTyping were called. Passes.

### PF-4-E: No presence calls for synthetic channel types
verdict:  ⚠️ PARTIAL
reason:   Spec requires startTyping is NOT called for channelType "scheduler",
          "heartbeat", "recovery", or "memory". Only `scheduler` is exercised
          in test "no presence calls for synthetic channel types (scheduler)"
          (orchestrator.test.ts:296). `heartbeat`, `recovery`, and `memory`
          are not tested — per spec all four must be verified.
focus:    tests/orchestrator.test.ts — heartbeat, recovery, and memory channel
          types are untested for presence exclusion.

### PF-4-F: Missing presence methods are silently skipped
verdict:  ✅ SATISFIED
reason:   Test "missing presence methods are silently skipped"
          (orchestrator.test.ts:309) confirms no error is thrown and the
          runner's prompt is still called when the adapter has no startTyping
          or stopTyping. Passes.

## Triage

✅ Safe to skip:   PF-1-A, PF-1-B, PF-1-C, PF-2-A, PF-2-C, PF-2-D, PF-2-E, PF-2-F, PF-2-G, PF-3-A, PF-3-C, PF-3-D, PF-3-E, PF-3-F, PF-4-A, PF-4-B, PF-4-D, PF-4-F

⚠️  Worth a look:
- PF-2-B — markRead no-op when _socket is null: guard exists in code, test absent (tests/channels/whatsapp.test.ts)
- PF-3-B — markRead no-op when not connected: guard exists in code, test absent (tests/channels/signal.test.ts)
- PF-4-C — stopTyping after timeout: implementation correct (finally fires on return), no test asserts it (tests/orchestrator.test.ts)
- PF-4-E — Synthetic channel exclusion: only 'scheduler' tested; 'heartbeat', 'recovery', 'memory' absent (tests/orchestrator.test.ts)

---

## Evaluation — 2026-05-15 12:26

### PF-1-A: Optional methods defined on interface
verdict:  ✅ SATISFIED
reason:   src/channels/interface.ts lines 122–128 declare `markRead?`, `startTyping?`,
          `stopTyping?` all typed `(msg: IncomingMessage): Promise<void>` with `?`.

### PF-1-B: Adapters without presence methods remain valid
verdict:  ✅ SATISFIED
reason:   orchestrator.test.ts "missing presence methods are silently skipped" uses
          an adapter with no startTyping/stopTyping; TypeScript compiles and all
          84 tests pass.

### PF-1-C: Broken Tier 1 contract stub still compiles and fails as designed
verdict:  ✅ SATISFIED
reason:   tests/channels/contract/tier1.contract.test.ts passes in the full suite
          (84 tests, 0 failures), confirming the stub compiles without type errors
          and load-bearing failures remain unchanged.

### PF-2-A: markRead sends a read receipt via Baileys
verdict:  ✅ SATISFIED
reason:   WhatsAppAdapter.markRead calls `sock.readMessages([rawKey])`. Test
          "markRead is called on incoming messages before bus publish"
          (whatsapp.test.ts) asserts readMessages is called and passes.

### PF-2-B: markRead is a no-op when socket is not connected
verdict:  ✅ SATISFIED
reason:   Test "markRead is a no-op when socket is not connected (_socket is null)"
          (whatsapp.test.ts) asserts readMessages is NOT called and the call
          resolves without throwing. Passes.

### PF-2-C: startTyping sends composing presence immediately
verdict:  ✅ SATISFIED
reason:   Test "startTyping sends composing presence immediately" (whatsapp.test.ts)
          asserts `sendPresenceUpdate('composing', peerId)` on call. Passes.

### PF-2-D: startTyping refreshes composing presence every 8 seconds
verdict:  ✅ SATISFIED
reason:   Test "startTyping refreshes composing presence every 8 seconds" uses
          fake timers, advances 8s twice, and asserts 3 total calls. Passes.

### PF-2-E: stopTyping sends paused presence and clears interval
verdict:  ✅ SATISFIED
reason:   Test "stopTyping sends paused presence and stops the refresh interval"
          asserts `sendPresenceUpdate('paused', peerId)` and confirms no further
          composing updates fire after stop. Passes.

### PF-2-F: startTyping errors do not propagate
verdict:  ✅ SATISFIED
reason:   Test "startTyping errors do not propagate" mocks sendPresenceUpdate to
          reject; asserts the promise resolves without throwing. Passes.

### PF-2-G: markRead called before bus publish on WhatsApp
verdict:  ✅ SATISFIED
reason:   Test "markRead is called on incoming messages before bus publish"
          (whatsapp.test.ts) records call order and asserts readMessages precedes
          bus.publish. Passes.

### PF-3-A: markRead posts a read receipt to the REST API
verdict:  ⚠️ PARTIAL
reason:   Spec requires the POST body to contain `{ "recipient": "+15559876543",
          "receipt_type": "read", "timestamp": <msg.timestamp> }`. No test directly
          calls `adapter.markRead(msg)` and asserts the body fields. PF-3-F verifies
          ordering only; PF-3-E verifies error suppression only. The full body
          contract from PF-3-A is untested.
focus:    tests/channels/signal.test.ts — a test calling adapter.markRead() and
          asserting the POST body fields (recipient, receipt_type: "read",
          timestamp) is absent.

### PF-3-B: markRead is a no-op when adapter is not connected
verdict:  ✅ SATISFIED
reason:   Test "markRead is a no-op when adapter is not connected" (signal.test.ts,
          send() status guard describe block) asserts no /v1/receipts call is made
          and the call resolves without throwing. Passes.

### PF-3-C: startTyping sends PUT to typing-indicator endpoint
verdict:  ✅ SATISFIED
reason:   Test "startTyping sends PUT to typing-indicator endpoint" asserts
          method=PUT, URL contains encoded phone, body `{ recipient: peerId }`. Passes.

### PF-3-D: stopTyping sends DELETE to typing-indicator endpoint
verdict:  ✅ SATISFIED
reason:   Test "stopTyping sends DELETE to typing-indicator endpoint" asserts
          method=DELETE, correct URL, body `{ recipient: peerId }`. Passes.

### PF-3-E: Presence errors do not propagate
verdict:  ✅ SATISFIED
reason:   Test "presence errors do not propagate" mocks fetch to reject and asserts
          markRead, startTyping, stopTyping all resolve without throwing. Passes.

### PF-3-F: markRead called before bus publish on Signal
verdict:  ✅ SATISFIED
reason:   Test "markRead is called on incoming messages before bus publish (json-rpc)"
          records call order and asserts receipts POST precedes bus.publish. Passes.

### PF-4-A: startTyping called before runner.prompt
verdict:  ⚠️ PARTIAL
reason:   Spec requires `adapter.startTyping(msg)` is called "before runner.prompt()".
          The test "startTyping is called before runner.prompt and stopTyping after
          response" (orchestrator.test.ts) asserts both were called but does not verify
          call ordering — no invocationCallOrder or sequence check is present. The
          implementation satisfies the ordering structurally but the test does not
          assert the before-constraint.
focus:    tests/orchestrator.test.ts — ordering assertion (startTyping before
          runner.prompt) is not verified, only presence of both calls.

### PF-4-B: stopTyping called after successful turn
verdict:  ✅ SATISFIED
reason:   Same test as PF-4-A asserts adapter.stopTyping was called after a
          successful turn. Passes.

### PF-4-C: stopTyping called after turn timeout
verdict:  ✅ SATISFIED
reason:   Test "stopTyping is called after a turn timeout" (orchestrator.test.ts)
          uses a 30ms timeout, a runner that never resolves, and asserts both
          startTyping and stopTyping were called. Passes.

### PF-4-D: stopTyping called after turn error
verdict:  ✅ SATISFIED
reason:   Test "stopTyping is called after a turn that errors" uses a runner that
          rejects and asserts both startTyping and stopTyping were called. Passes.

### PF-4-E: No presence calls for synthetic channel types
verdict:  ✅ SATISFIED
reason:   Four separate tests cover all required synthetic types: scheduler, heartbeat,
          recovery, memory — all assert startTyping and stopTyping not called. All pass.

### PF-4-F: Missing presence methods silently skipped
verdict:  ✅ SATISFIED
reason:   Test "missing presence methods are silently skipped" (orchestrator.test.ts)
          uses an adapter with no startTyping/stopTyping; confirms no error and
          runner.prompt still runs. Passes.

## Triage

✅ Safe to skip:   PF-1-A, PF-1-B, PF-1-C, PF-2-A, PF-2-B, PF-2-C, PF-2-D, PF-2-E, PF-2-F, PF-2-G, PF-3-B, PF-3-C, PF-3-D, PF-3-E, PF-3-F, PF-4-B, PF-4-C, PF-4-D, PF-4-E, PF-4-F

⚠️  Worth a look:
- PF-3-A — No test calls adapter.markRead() directly and checks POST body fields (recipient, receipt_type, timestamp); body contract unverified
- PF-4-A — Test asserts startTyping was called but not that it was called before runner.prompt; ordering requirement unverified

---

## Evaluation — 2026-05-15 14:26

### PF-1-A: Optional methods are defined on the interface
verdict:  ✅ SATISFIED
reason:   `src/channels/interface.ts` lines 122, 125, 128 declare `markRead?`, `startTyping?`, and `stopTyping?` all typed `(msg: IncomingMessage): Promise<void>` with `?` making them optional. `npx tsc --noEmit` exits 0.

### PF-1-B: Adapters without presence methods remain valid
verdict:  ✅ SATISFIED
reason:   `tests/orchestrator.test.ts` "missing presence methods are silently skipped" uses an adapter with no `startTyping` or `stopTyping`; TypeScript compiles cleanly and the test passes. 147 test files pass with 0 failures.

### PF-1-C: Broken Tier 1 contract stub still compiles and fails as designed
verdict:  ✅ SATISFIED
reason:   `tests/channels/contract/tier1.contract.test.ts` passes in the full suite (1062 tests, 0 failures), confirming the intentionally-broken stub still compiles and the load-bearing contract violations are unchanged.

### PF-2-A: markRead sends a read receipt via Baileys
verdict:  ✅ SATISFIED
reason:   `src/channels/whatsapp.ts` line 258 calls `this._socket.readMessages([rawKey])` wrapped in try/catch. Test "markRead is called on incoming messages before bus publish" passes, asserting `readMessages` is called.

### PF-2-B: markRead is a no-op when socket is not connected
verdict:  ✅ SATISFIED
reason:   Test "markRead is a no-op when socket is not connected (_socket is null)" (whatsapp.test.ts:414) asserts `readMessages` is NOT called and the call resolves without throwing. Passes.

### PF-2-C: startTyping sends composing presence immediately
verdict:  ✅ SATISFIED
reason:   Test "startTyping sends composing presence immediately" asserts `sendPresenceUpdate('composing', peerId)` on the initial call. `src/channels/whatsapp.ts` line 269 confirms immediate invocation. Passes.

### PF-2-D: startTyping refreshes composing presence every 8 seconds
verdict:  ✅ SATISFIED
reason:   Test "startTyping refreshes composing presence every 8 seconds" uses fake timers, advances 8s twice, and asserts 3 total calls. `TYPING_REFRESH_MS = 8_000` constant at line 20. Passes.

### PF-2-E: stopTyping sends paused presence and clears the refresh interval
verdict:  ✅ SATISFIED
reason:   Test "stopTyping sends paused presence and stops the refresh interval" asserts `sendPresenceUpdate('paused', peerId)` and confirms no further composing updates fire. `clearInterval` + `_typingIntervals.delete` in `src/channels/whatsapp.ts` lines 282–284. Passes.

### PF-2-F: startTyping errors do not propagate
verdict:  ✅ SATISFIED
reason:   Test "startTyping errors do not propagate" mocks `sendPresenceUpdate` to reject and asserts the promise resolves without throwing. Passes.

### PF-2-G: markRead is called on incoming messages before bus publish
verdict:  ✅ SATISFIED
reason:   Test "markRead is called on incoming messages before bus publish" (whatsapp.test.ts) tracks call order and asserts `readMessages` precedes `bus.publish`. `src/channels/whatsapp.ts` line 183 confirms ordering in `messages.upsert` handler. Passes.

### PF-3-A: markRead posts a read receipt to the REST API
verdict:  ⚠️ PARTIAL
reason:   Test "markRead posts a read receipt with correct body (PF-3-A)" verifies `method=POST`, `recipient`, and `receipt_type: "read"` — but asserts `body.timestamp === 1700000000` (seconds), while the spec says `"timestamp": <msg.timestamp>` and `IncomingMessage.timestamp` is explicitly documented as "Unix timestamp (ms)" in `src/channels/interface.ts` line 35. The implementation converts `Math.floor(msg.timestamp / 1000)` before sending. The test was written to match the implementation rather than the contract. Either the spec should say "in seconds" or the implementation diverges — the contract is silent on the unit.
focus:    `src/channels/signal.ts` line 389 (`Math.floor(msg.timestamp / 1000)`), `tests/channels/signal.test.ts` line 367 — the timestamp unit is unresolved between contract and code.

### PF-3-B: markRead is a no-op when adapter is not connected
verdict:  ✅ SATISFIED
reason:   Test "markRead is a no-op when adapter is not connected" (signal.test.ts:676) asserts no `/v1/receipts` call is made when `status() !== 'connected'` and the call resolves without throwing. Passes.

### PF-3-C: startTyping sends a PUT to the typing-indicator endpoint
verdict:  ✅ SATISFIED
reason:   Test "startTyping sends PUT to typing-indicator endpoint" asserts `method=PUT`, URL contains encoded phone (`%2B1234567890`), and body `{ recipient: peerId }`. Passes.

### PF-3-D: stopTyping sends a DELETE to the typing-indicator endpoint
verdict:  ✅ SATISFIED
reason:   Test "stopTyping sends DELETE to typing-indicator endpoint" asserts `method=DELETE`, correct URL, and correct body. Passes.

### PF-3-E: Presence errors do not propagate
verdict:  ✅ SATISFIED
reason:   Test "presence errors do not propagate" mocks fetch to reject and asserts all three of `markRead`, `startTyping`, and `stopTyping` resolve without throwing. Passes.

### PF-3-F: markRead is called on incoming messages before bus publish
verdict:  ⚠️ PARTIAL
reason:   The spec requires "WHEN a message arrives via WebSocket or polling" — only the WebSocket (json-rpc) path has an ordering test ("markRead is called on incoming messages before bus publish (json-rpc)", signal.test.ts:213). The HTTP polling path ("normal mode") has tests that verify messages are published (signal.test.ts:432) but no test asserts that the receipts POST precedes bus publish in that path. The implementation at line 207 uses the same `_handleIncomingMessage` handler and is structurally correct, but the polling path is untested for ordering.
focus:    `tests/channels/signal.test.ts` — "normal mode (HTTP polling)" describe block has no ordering assertion for `markRead` before `bus.publish`.

### PF-4-A: startTyping is called at the start of a real user turn
verdict:  ✅ SATISFIED
reason:   Test "startTyping is called before runner.prompt and stopTyping after response" (orchestrator.test.ts:263) now tracks `callOrder` and asserts `callOrder.indexOf('startTyping') < callOrder.indexOf('prompt')`. The ordering requirement is explicitly verified. Passes.

### PF-4-B: stopTyping is called after a successful turn
verdict:  ✅ SATISFIED
reason:   Same test asserts `adapter.stopTyping` was called after the runner resolves. The `finally` block at `src/orchestrator.ts` line 464–467 guarantees execution. Passes.

### PF-4-C: stopTyping is called after a turn timeout
verdict:  ✅ SATISFIED
reason:   Test "stopTyping is called after a turn timeout" (orchestrator.test.ts:312) uses a 30ms `turnTimeout`, a runner that never resolves, and asserts both `startTyping` and `stopTyping` were called. The `return` inside `try {}` triggers the `finally` block. Passes.

### PF-4-D: stopTyping is called after a turn error
verdict:  ✅ SATISFIED
reason:   Test "stopTyping is called after a turn that errors" uses a runner that rejects and asserts both `startTyping` and `stopTyping` were called. `return` inside `try {}` triggers the `finally` block. Passes.

### PF-4-E: No presence calls for synthetic channel types
verdict:  ✅ SATISFIED
reason:   Four separate tests cover all four required synthetic types — "scheduler", "heartbeat", "recovery", "memory" — each asserting `adapter.startTyping` was not called. `SKIP_PRESENCE_CHANNELS` set at `src/orchestrator.ts` line 303 includes all four. All pass.

### PF-4-F: Missing presence methods are silently skipped
verdict:  ✅ SATISFIED
reason:   Test "missing presence methods are silently skipped" (orchestrator.test.ts) uses an adapter with no `startTyping` or `stopTyping`; confirms no error is thrown and `runner.prompt` is still called. Optional chaining `?.` at lines 308 and 466. Passes.

## Triage

✅ Safe to skip:   PF-1-A, PF-1-B, PF-1-C, PF-2-A, PF-2-B, PF-2-C, PF-2-D, PF-2-E, PF-2-F, PF-2-G, PF-3-B, PF-3-C, PF-3-D, PF-3-E, PF-4-A, PF-4-B, PF-4-C, PF-4-D, PF-4-E, PF-4-F

⚠️  Worth a look:
- PF-3-A — Timestamp unit ambiguity: spec says `"timestamp": <msg.timestamp>` (ms per interface.ts:35), implementation sends `Math.floor(ms/1000)` (seconds), test was written to match the implementation rather than the spec literal. Human call: does Signal's API require seconds? If yes, the spec should say so.
- PF-3-F — `markRead`-before-publish ordering is only tested for the WebSocket (json-rpc) path; the HTTP polling ("normal mode") path has no ordering assertion, despite the spec saying "via WebSocket or polling".

---

## Evaluation — 2026-05-15 16:15

### PF-3-A: markRead posts a read receipt to the REST API
verdict:  ❌ UNSATISFIED
reason:   The spec says `"timestamp": <msg.timestamp>`. `IncomingMessage.timestamp` is
          documented as Unix milliseconds (`interface.ts:35`). Source research confirms
          signal-cli-rest-api's `SendReceipt` in `client.go` passes the timestamp
          **as-is** to `signal-cli sendReceipt -t`, and signal-cli's `DateUtils.java`
          uses `new Date(timestamp)` (Java ms). No conversion occurs anywhere in the
          chain. The implementation at `src/channels/signal.ts:389` sends
          `Math.floor(msg.timestamp / 1000)` (seconds), which signal-cli interprets
          as a millisecond timestamp around January 1970 — the receipt silently
          targets the wrong message or is ignored. The test (`signal.test.ts:367`)
          was written to assert `msgTimestampSec` (1700000000) rather than
          `msgTimestampMs` (1700000000000), accepting the bug as correct behaviour.
focus:    `src/channels/signal.ts:389` — remove `Math.floor(.../ 1000)`, send
          `msg.timestamp` directly. `tests/channels/signal.test.ts:367` — assert
          `msgTimestampMs` not `msgTimestampSec`. Both must change together.

## Triage

⚠️  Worth a look:
- PF-3-A — **Bug**: `Math.floor(msg.timestamp / 1000)` sends seconds; signal-cli
  expects milliseconds. Receipt silently targets wrong message. Fix:
  `src/channels/signal.ts:389` send `msg.timestamp` directly, update test assertion
  at `signal.test.ts:367` from `msgTimestampSec` to `msgTimestampMs`.
- PF-3-F — `markRead`-before-publish ordering untested for HTTP polling path
  (normal mode); only json-rpc WebSocket path has an ordering assertion.

---

## Evaluation — 2026-05-15 16:23

### PF-1 — ChannelAdapter presence interface
verdict:  ✅ SATISFIED
reason:   `src/channels/interface.ts` lines 122–128 declare `markRead?`, `startTyping?`,
          `stopTyping?` all typed `(msg: IncomingMessage): Promise<void>` with `?`.
          `tsc --noEmit` exits 0. Tests for PF-1-B (adapter without presence methods
          compiles) and PF-1-C (broken contract stub unchanged) both pass.

### PF-2 — WhatsApp presence implementation
verdict:  ✅ SATISFIED
reason:   All seven scenarios (PF-2-A through PF-2-G) have passing tests. `markRead`
          calls `sock.readMessages([rawKey])` (PF-2-A); no-op when `_socket` is null
          (PF-2-B); `sendPresenceUpdate('composing', peerId)` fires immediately (PF-2-C);
          fake-timer test confirms 3 calls over 16s (PF-2-D); `stopTyping` sends
          `'paused'` and clears interval (PF-2-E); rejected `sendPresenceUpdate` does
          not propagate (PF-2-F); `readMessages` precedes `bus.publish` in call-order
          tracking (PF-2-G). `TYPING_REFRESH_MS = 8_000` constant present at
          `whatsapp.ts:20`.

### PF-3 — Signal presence implementation
verdict:  ⚠️ PARTIAL
reason:   PF-3-A spec states the URL is `POST /v1/receipts/+15550001234` (literal `+`),
          but the implementation sends `POST /v1/receipts/%2B15550001234` (percent-encoded
          via `encodeURIComponent`). The test asserts `%2B`, aligning with the
          implementation. The spec for PF-3-C/D explicitly requires `%2B` for the
          typing-indicator endpoint, making the `+` in PF-3-A appear to be a spec
          authoring inconsistency — but as written the contract says `+` and the output
          delivers `%2B`. All other scenarios (PF-3-B through PF-3-F) are fully covered
          including the polling-path ordering test added for PF-3-F.
focus:    `src/channels/signal.ts:397` and `tests/channels/signal.test.ts:368` — receipts
          URL uses `%2B`, spec says `+`. Human call: is the literal `+` in PF-3-A
          intentional or a typo? If intentional the implementation has a URL encoding
          bug; if a typo the spec should be corrected to `%2B`.

### PF-4 — Orchestrator presence wiring
verdict:  ✅ SATISFIED
reason:   All six scenarios (PF-4-A through PF-4-F) are covered. PF-4-A: `callOrder`
          tracking asserts `indexOf('startTyping') < indexOf('prompt')`. PF-4-B:
          `stopTyping` asserted after successful turn. PF-4-C: 30ms timeout test with
          never-resolving runner asserts `stopTyping` called. PF-4-D: rejecting runner
          asserts `stopTyping` called. PF-4-E: four separate tests cover `"scheduler"`,
          `"heartbeat"`, `"recovery"`, `"memory"` — all assert `startTyping` NOT called.
          PF-4-F: adapter without presence methods runs without error. The
          `try { while(true) {} } finally { stopTyping }` structure at
          `orchestrator.ts:327–466` covers all exit paths including `return` inside
          `try {}`.

## Triage

✅ Safe to skip:   PF-1, PF-2, PF-4

⚠️  Worth a look:
- PF-3 — URL encoding in receipts endpoint: spec PF-3-A says `POST /v1/receipts/+15550001234`
  (literal `+`), implementation sends `%2B` (percent-encoded). PF-3-C/D explicitly require
  `%2B` for typing-indicator, suggesting the `+` in PF-3-A is a spec typo — but it is a
  human call whether the receipts endpoint behaves differently.

❓  Human call:
- PF-3-A URL literal: does signal-cli-rest-api's `/v1/receipts/<number>` route require the
  literal `+` (unusual for HTTP path params) or `%2B`? If `%2B` is correct, update the spec
  text. If `+` is required, the implementation is wrong.

---
