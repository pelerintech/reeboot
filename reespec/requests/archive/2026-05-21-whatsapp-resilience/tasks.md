# Tasks — whatsapp-resilience

## Progress

- [x] Task 1 — `_connect()` resolves/rejects on connection outcome
- [x] Task 2 — Persistent reconnect loop with `_stopping` sentinel
- [x] Task 3 — Close during active reconnect does not spawn second loop
- [x] Task 4 — Connect timeout watchdog
- [x] Task 5 — Dropped `send()` logged at warn
- [x] Task 6 — Reconnect failure logged with reason
- [x] Task 7 — Connect timeout emits `channel_stalled` DB event
- [x] Task 8 — Extended downtime (>5 min) emits `channel_stalled`
- [x] Task 9 — Track last active peer + disconnected timestamp
- [x] Task 10 — "I'm back" notification on reconnect after >5 min
- [x] Task 11 — systemd unit `Restart=always` + burst protection
- [x] Task 12 — Deploy updated unit to production
- [x] Task 13 — WR-1-F coverage: test `stop()` terminates reconnect loop mid-flight
- [x] Task 14 — WR-2-E coverage: test `statusCode` logged on reconnect loop start

---

### 1. `_connect()` resolves/rejects on connection outcome

Specs: WR-1-B, WR-1-C

- [x] **RED** — In `tests/channels/whatsapp-resilience.test.ts`, write two tests (plus regression test):
  (a) `_connect() resolves when 'open' fires` — call `adapter.start()`, emit
  `connection.update { connection: 'open' }` after a tick, assert `start()`
  resolves and `adapter.status() === 'connected'`;
  (b) `_connect() causes retry when 'close' fires before 'open'` — call
  `adapter.start()`, emit `connection.update { connection: 'close', lastDisconnect:
  { error: { output: { statusCode: 428 } } } }`, advance timers past backoff (2.1s),
  assert `mockMakeWASocket` was called twice.
  Run `vitest run tests/channels/whatsapp-resilience.test.ts` → fails (tests don't
  exist yet / old logic doesn't satisfy them).

- [x] **ACTION** — Rewrite `_connect()` in `whatsapp.ts` to return a `Promise<void>`
  that resolves on `connection.update { connection: 'open' }` and rejects on
  `connection.update { connection: 'close' }`. Remove the inline reconnect call
  from inside the `connection.update` close handler (reconnect logic moves to Task 2).
  Keep all other behaviour (QR, message handling, sentIds, etc.) unchanged.

- [x] **GREEN** — Run `vitest run tests/channels/whatsapp-resilience.test.ts` → both
  tests pass. Run `vitest run tests/channels/whatsapp.test.ts` → existing tests still
  pass.

---

### 2. Persistent reconnect loop with `_stopping` sentinel

Specs: WR-1-A, WR-1-F, WR-1-G, WR-1-H

- [x] **RED** — In `whatsapp-resilience.test.ts`, add three tests:
  (a) `reconnect loop retries after rejection` — simulate close, advance timers ×2,
  assert `makeWASocket` called 3+ times;
  (b) `stop() terminates reconnect loop` — start reconnect loop, call `adapter.stop()`,
  advance timers, assert no further `makeWASocket` calls after stop;
  (c) `loggedOut sets status to error and no reconnect` — emit close with `statusCode
  === 401`, assert `status() === 'error'` and `makeWASocket` not called again.
  Run → fails.

- [x] **ACTION** — Add `_stopping: boolean` field. Implement `_reconnectLoop()` as a
  `while (!this._stopping)` loop that calls `await this._connect()` with try/catch,
  applies exponential backoff between retries. Update `stop()` to set `_stopping =
  true` (remove `_reconnecting = true` from stop). Update the `connection.update`
  close handler to call `this._reconnectLoop()` when not stopping and not already
  reconnecting. `_reconnecting` is set true at loop entry, false at loop exit
  (`.finally()`). Reset `_reconnectAttempt = 0` on successful `'open'`.

- [x] **GREEN** — Run `vitest run tests/channels/whatsapp-resilience.test.ts` → all
  new tests pass. Run `vitest run tests/channels/whatsapp.test.ts` → all pass. Run
  `vitest run tests/channels/` → full suite green.

---

### 3. Close during active reconnect does not spawn second loop

Spec: WR-1-E

- [x] **RED** — In `whatsapp-resilience.test.ts`, add test: `second close during
  reconnect does not start another loop` — start adapter, emit `close` (starts loop),
  while loop is in backoff emit `close` again, advance timers, assert `makeWASocket`
  call count matches a single retry sequence (not doubled).
  Run → fails or behaviour is not guaranteed.

- [x] **ACTION** — Verify the `_reconnecting` guard in the `connection.update` close
  handler correctly blocks re-entry. The `_reconnecting` flag must be checked before
  calling `_reconnectLoop()`. No change needed if Task 2's implementation already
  handles this — confirm with test.

- [x] **GREEN** — Run `vitest run tests/channels/whatsapp-resilience.test.ts` → test
  passes. Verify `makeWASocket` call count is exactly 2 (initial + one retry).

---

### 4. Connect timeout watchdog

Spec: WR-1-D

- [x] **RED** — In `whatsapp-resilience.test.ts`, add test: `stalled socket (no
  events) causes retry after CONNECT_TIMEOUT_MS` — use fake timers, start adapter,
  do NOT emit any `connection.update` event, advance timers past `CONNECT_TIMEOUT_MS`
  (e.g. 31s), assert `makeWASocket` was called a second time (timeout triggered retry).
  Run → fails (current code has no timeout inside `_connect()`).

- [x] **ACTION** — Inside `_connect()`'s Promise body, add `setTimeout(() =>
  reject(new Error('connect timeout')), CONNECT_TIMEOUT_MS)`. Add constant
  `CONNECT_TIMEOUT_MS = 30_000` at module top. Clear the timer in both the resolve
  and reject paths. Call `sock.end()` on timeout to clean up the stalled socket.

- [x] **GREEN** — Run `vitest run tests/channels/whatsapp-resilience.test.ts` →
  test passes. Run full channel suite → green.

---

### 5. Dropped `send()` logged at warn

Spec: WR-2-A

- [x] **RED** — In `whatsapp-resilience.test.ts`, add test: `send() while
  disconnected logs warn` — mock `getLogger()` to capture log calls, call
  `adapter.send('1234@s.whatsapp.net', { type: 'text', text: 'hello' })` without
  starting the adapter (status is not `'connected'`), assert logger `.warn()` was
  called with an object containing `component: 'whatsapp'` and a message string
  containing `'dropped'`.
  Run → fails (current code returns silently with no log).

- [x] **ACTION** — In `whatsapp.ts` `send()`: change the early return to:
  ```typescript
  if (!this._socket || this._status !== 'connected') {
    getLogger().warn({ component: 'whatsapp', peerId, status: this._status },
      '[WhatsApp] send() called while not connected — message dropped');
    return;
  }
  ```

- [x] **GREEN** — Run `vitest run tests/channels/whatsapp-resilience.test.ts` →
  test passes. Run `vitest run tests/channels/whatsapp.test.ts` → passes.

---

### 6. Reconnect failure logged with reason

Spec: WR-2-B, WR-2-E

- [x] **RED** — In `whatsapp-resilience.test.ts`, add test: `reconnect rejection
  logged with attempt and statusCode` — mock logger, emit `close` with
  `statusCode: 428`, advance timers past backoff, assert logger `.warn()` was called
  with `{ attempt: 1 }` and the error message or statusCode in the log.
  Run → fails (current code logs at error level without attempt/reason structure,
  or the new loop doesn't yet log).

- [x] **ACTION** — In `_reconnectLoop()`, in the `catch(err)` block, add:
  ```typescript
  getLogger().warn({ component: 'whatsapp', attempt: this._reconnectAttempt,
    reason: (err as any)?.message ?? 'unknown' },
    '[WhatsApp] Reconnect attempt failed — will retry');
  ```

- [x] **GREEN** — Run `vitest run tests/channels/whatsapp-resilience.test.ts` →
  test passes.

---

### 7. Connect timeout emits `channel_stalled` DB event

Spec: WR-2-C

- [x] **RED** — In `whatsapp-resilience.test.ts`, add test: `connect timeout emits
  channel_stalled event` — mock `emitEvent`, use fake timers, advance past
  `CONNECT_TIMEOUT_MS`, assert `emitEvent` was called with an object containing
  `type: 'channel_stalled'` and `severity: 17`.
  Run → fails.

- [x] **ACTION** — In `_connect()`'s timeout handler, after `reject(...)`, add:
  ```typescript
  try {
    emitEvent(getDb(), {
      type: 'channel_stalled', severity: 17,
      payload: { channelType: 'whatsapp', reason: 'connect_timeout' }
    }).catch(() => {});
  } catch { /* db not ready */ }
  ```

- [x] **GREEN** — Run `vitest run tests/channels/whatsapp-resilience.test.ts` →
  test passes.

---

### 8. Extended downtime (>5 min) emits `channel_stalled` event

Spec: WR-2-D

- [x] **RED** — In `whatsapp-resilience.test.ts`, add test: `extended downtime
  emits channel_stalled` — mock `emitEvent`, use fake timers, emit `close` to
  start reconnect loop, advance timers so that each retry fires but `'open'` never
  fires, advance total elapsed time past `STALL_NOTIFY_MS` (5 min = 300_000ms),
  assert `emitEvent` called with `type: 'channel_stalled'` and
  `payload.durationMs >= 300000`.
  Run → fails.

- [x] **ACTION** — In `_reconnectLoop()`, track `const loopStartedAt = Date.now()`.
  At each retry iteration (after the catch block), check:
  ```typescript
  const durationMs = Date.now() - loopStartedAt;
  if (durationMs > STALL_NOTIFY_MS && !this._stalledEventEmitted) {
    this._stalledEventEmitted = true;
    try {
      emitEvent(getDb(), { type: 'channel_stalled', severity: 17,
        payload: { channelType: 'whatsapp', durationMs,
          attempt: this._reconnectAttempt } }).catch(() => {});
    } catch { /* db not ready */ }
  }
  ```
  Reset `_stalledEventEmitted = false` on successful connect.

- [x] **GREEN** — Run `vitest run tests/channels/whatsapp-resilience.test.ts` →
  test passes.

---

### 9. Track last active peer and disconnected timestamp

Spec: WR-3-D, WR-3-E

- [x] **RED** — In `whatsapp-resilience.test.ts`, add two tests:
  (a) `_lastActivePeer updated on inbound message` — receive a message from
  `'1234@s.whatsapp.net'`, then receive from `'5678@s.whatsapp.net'`, assert
  `adapter._lastActivePeer === '5678@s.whatsapp.net'`;
  (b) `_disconnectedAt set on close, cleared on open` — emit `close`, assert
  `adapter._disconnectedAt` is a `Date`; emit `open`, assert
  `adapter._disconnectedAt` is `null`.
  Run → fails (fields don't exist yet).

- [x] **ACTION** — Add `_lastActivePeer: string | null = null` and
  `_disconnectedAt: Date | null = null` fields. In `messages.upsert` handler,
  set `this._lastActivePeer = peerId` for every accepted inbound message. In
  `connection.update` close handler, set `this._disconnectedAt = new Date()`. In
  `connection.update` open handler, capture `_disconnectedAt` value then set it
  to `null`.

- [x] **GREEN** — Run `vitest run tests/channels/whatsapp-resilience.test.ts` →
  tests pass.

---

### 10. "I'm back" notification on reconnect after >5 min

Specs: WR-3-A, WR-3-B, WR-3-C, WR-3-D

- [x] **RED** — In `whatsapp-resilience.test.ts`, add three tests:
  (a) `sends back-online message after extended downtime` — use fake timers, have
  adapter receive a message from peer X, emit `close`, advance time by
  `BACK_ONLINE_THRESHOLD_MS + 1000`, emit `open`, assert `mockSocket.sendMessage`
  was called with `(peerId, { text: expect.stringContaining('back') })`;
  (b) `no notification for short downtime` — same but advance time by only 60s,
  assert `sendMessage` NOT called with back-online content;
  (c) `no notification if no peer ever wrote` — skip receiving a message, emit
  close + open after long time, assert `sendMessage` not called.
  Run → fails.

- [x] **ACTION** — In the `connection.update` open handler, after marking
  `_reconnecting = false` etc., add:
  ```typescript
  const wasDisconnectedMs = this._disconnectedAt
    ? Date.now() - this._disconnectedAt.getTime() : 0;
  this._disconnectedAt = null;
  if (wasDisconnectedMs > BACK_ONLINE_THRESHOLD_MS && this._lastActivePeer
      && !this._backOnlineSent) {
    this._backOnlineSent = true;
    const mins = Math.round(wasDisconnectedMs / 60_000);
    const msg = `⚡ I'm back online. I was unreachable for ~${mins} minute${mins !== 1 ? 's' : ''}.`;
    this._socket?.sendMessage(this._lastActivePeer, { text: msg }).catch(() => {});
    getLogger().info({ component: 'whatsapp', peerId: this._lastActivePeer, durationMs: wasDisconnectedMs },
      '[WhatsApp] back online — notification sent');
  }
  ```
  Reset `_backOnlineSent = false` in the `close` handler. Add constants
  `BACK_ONLINE_THRESHOLD_MS = 5 * 60 * 1000`.

- [x] **GREEN** — Run `vitest run tests/channels/whatsapp-resilience.test.ts` →
  all three tests pass. Run `vitest run tests/channels/` → full suite green.

---

### 11. systemd unit `Restart=always` + burst protection

Specs: WR-4-A, WR-4-B

- [x] **RED** — In `tests/daemon.test.ts` (check if it exists, add to it or create
  `tests/daemon-resilience.test.ts`), add two tests:
  (a) `generateSystemdUnit contains Restart=always` — call
  `generateSystemdUnit('/bin/reeboot', '~/.reeboot', '/usr/bin/node')`, assert
  output contains `'Restart=always'` and does NOT contain `'Restart=on-failure'`;
  (b) `generateSystemdUnit contains StartLimitIntervalSec and StartLimitBurst` —
  assert output contains `'StartLimitIntervalSec=120'` and
  `'StartLimitBurst=5'`.
  Run → fails (`Restart=on-failure` currently, no StartLimit lines).

- [x] **ACTION** — In `daemon.ts` `generateSystemdUnit()`, change `Restart=on-failure`
  to `Restart=always`, add `StartLimitIntervalSec=120` and `StartLimitBurst=5`
  under `[Service]`.

- [x] **GREEN** — Run `vitest run tests/daemon-resilience.test.ts` (or the
  relevant daemon test file) → passes. Verify `generateSystemdUnit` output manually
  by logging it.

---

### 12. Deploy updated unit to production

Spec: WR-4-C

- [x] **RED** — Check: `ssh 100.102.186.27 "grep 'Restart' ~/.config/systemd/user/reeboot.service"`
  returns `Restart=on-failure`. Assertion: production unit has the old value.

- [x] **ACTION** — SSH to production, run `reeboot stop && reeboot start --daemon`
  to rewrite the unit file and restart. Verify by checking
  `systemctl --user status reeboot` and confirming the process starts cleanly
  and the WhatsApp channel shows `Connected ✓` in logs.

- [x] **GREEN** — Run `ssh 100.102.186.27 "grep -E 'Restart|StartLimit' ~/.config/systemd/user/reeboot.service"`.
  Assert output contains `Restart=always`, `StartLimitIntervalSec=120`,
  `StartLimitBurst=5`. Assert `systemctl --user is-active reeboot` returns
  `active`.
