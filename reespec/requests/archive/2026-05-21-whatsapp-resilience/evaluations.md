## Evaluation — 2026-05-21 15:25

### WR-1-A: Non-logout close triggers reconnect
verdict:  ✅ SATISFIED
reason:   Spec requires `makeWASocket` called again after non-logout `'close'`; the `'close'` branch in `_connect()` (line 196–214, `whatsapp.ts`) starts `_reconnectLoop()`, which calls `_connect()` → `makeWASocket` on each iteration. Test "reconnect loop retries after post-open close" passes.

### WR-1-B: `_connect()` awaits `'open'` before returning
verdict:  ✅ SATISFIED
reason:   Spec requires `_connect()` resolve only when `connection === 'open'`; `whatsapp.ts` wraps a `Promise` that resolves inside the `connection === 'open'` handler and sets `status` to `'connected'`. Test "start() resolves and status is connected when open fires" passes.

### WR-1-C: `_connect()` rejects on `'close'`
verdict:  ✅ SATISFIED
reason:   Spec requires `_connect()` to reject when `'close'` fires before `'open'`, and reconnect loop to retry; the `!settled` path in the close handler calls `reject()` (line 198–201), and `_reconnectLoop()` catches and retries. Test "reconnect continues retrying after second close (the ebe5c69 regression)" passes.

### WR-1-D: Stalled socket triggers retry via timeout
verdict:  ✅ SATISFIED
reason:   Spec requires `_connect()` to reject after `CONNECT_TIMEOUT_MS` with no events; `whatsapp.ts` sets a `setTimeout` watchdog at `CONNECT_TIMEOUT_MS` (line 117–130) that calls `reject(new Error('connect timeout'))`. The watchdog code path is verified by the "connect timeout emits channel_stalled event" test via fake timers advancing 31s.

### WR-1-E: Close during ongoing reconnect does not start a second loop
verdict:  ✅ SATISFIED
reason:   Spec requires the `_reconnecting` guard to block a second loop; `whatsapp.ts` line 207 checks `!this._reconnecting` before calling `_reconnectLoop()`. Test "second close during reconnect does not start another loop" passes.

### WR-1-F: `stop()` terminates the reconnect loop
verdict:  ✅ SATISFIED
reason:   Spec requires `stop()` to set `_stopping = true` and cause loop exit; `whatsapp.ts` `stop()` sets `_stopping = true` (line 317) and the loop checks `!this._stopping` at each iteration (line 282) and after each backoff (line 289). `status()` returns `'disconnected'` after `stop()` (line 323).

### WR-1-G: Logged-out disconnect does not reconnect
verdict:  ✅ SATISFIED
reason:   Spec requires `statusCode === DisconnectReason.loggedOut` to set `status = 'error'` and skip reconnect; `whatsapp.ts` lines 185–190 set `_status = 'error'` and `_stopping = true`. Covered by `whatsapp.test.ts` test "logout disconnect sets status to error and does not reconnect" (line 289).

### WR-1-H: Reconnect attempt counter resets on successful connect
verdict:  ⚠️ PARTIAL
reason:   Spec requires the attempt counter to reset to 0 on `'open'` so "the next disconnect starts backoff from 2s again." The reset is implemented at line 156 (`_reconnectAttempt = 0`) and line 294. However, no test in `whatsapp-resilience.test.ts` verifies the reset behaviour specifically — no test checks that after a reconnect success, a subsequent disconnect re-starts backoff from 2s.
focus:    `reeboot/tests/channels/whatsapp-resilience.test.ts` — add a test: connect → disconnect → reconnect (success) → disconnect again → verify backoff starts from 2s (attempt=1)

### WR-2-A: Dropped send is logged at warn level
verdict:  ✅ SATISFIED
reason:   Spec requires `warn`-level log with `component: 'whatsapp'`, `msg` containing `'dropped'` or `'not connected'`, and `status` field; `whatsapp.ts` line 325 emits exactly this. Tests "send() while disconnected logs warn…" and "…includes current status in log" both pass.

### WR-2-B: `_connect()` rejection is logged at warn level
verdict:  ✅ SATISFIED
reason:   Spec requires a `warn`-level log with `component`, `attempt`, and error message when `_reconnectLoop` catches a rejection; `whatsapp.ts` line 298 logs `{ component: 'whatsapp', attempt, reason }`. Test "reconnect failure logs warn with attempt and reason" passes.

### WR-2-C: Connect timeout is logged at error level and emits DB event
verdict:  ✅ SATISFIED
reason:   Spec requires `error`-level log `'[WhatsApp] Connection attempt timed out'` and `emitEvent()` with `type: 'channel_stalled'`, `severity: 17`; `whatsapp.ts` lines 129–133 do exactly this. Test "connect timeout emits channel_stalled event" passes.

### WR-2-D: Extended downtime (> 5 min) emits `channel_stalled` event
verdict:  ⚠️ PARTIAL
reason:   Spec requires `emitEvent()` with `type: 'channel_stalled'`, `severity: 17`, `payload.channelType: 'whatsapp'`, `payload.durationMs ≥ STALL_NOTIFY_MS` after the loop has been running >5 min. The implementation is present (lines 302–309, `whatsapp.ts`). However, the test "extended downtime (>5 min) emits channel_stalled with durationMs" explicitly falls back to `expect(true).toBe(true)` — it never asserts `durationMs ≥ STALL_NOTIFY_MS` or that the event fires after (and not before) 5 minutes.
focus:    `reeboot/tests/channels/whatsapp-resilience.test.ts` — the test body comments "structural test passes" and never asserts on `durationMs` or the 5-min guard; the contract condition `payload.durationMs ≥ STALL_NOTIFY_MS` is untested.

### WR-2-E: Reconnect reason is logged
verdict:  ❌ UNSATISFIED
reason:   Spec states "WHEN the reconnect loop starts THEN the log entry includes the `statusCode` from `lastDisconnect.error.output` (or `'unknown'` if absent)." The `statusCode` is extracted at line 180 but is never included in any log statement. The `_reconnectLoop()` start log (line 285) records only `attempt` and `delayMs`; the close-handler branch that calls `_reconnectLoop()` (lines 196–214) emits no log at all. No test verifies `statusCode` appears in logs.
focus:    `reeboot/src/channels/whatsapp.ts` — add `statusCode` (or `'unknown'`) to the log emitted when the reconnect loop is started or to the per-attempt info log in `_reconnectLoop()`

### WR-2-F: "I'm back" notification logged when sent
verdict:  ✅ SATISFIED
reason:   Spec requires an `info`-level log with `msg` containing `'back online'`, a `durationMs` field, and a `peerId` field; `whatsapp.ts` line 171–172 logs `{ component: 'whatsapp', peerId, durationMs }` with message `'[WhatsApp] back online — notification sent'`. Implementation satisfies the spec.

### WR-3-A: Notification sent after extended downtime
verdict:  ✅ SATISFIED
reason:   Spec requires `send()` called on `_lastActivePeer` with `'back online'` or `'I'm back'` text after >5 min downtime. `whatsapp.ts` line 169 sends `"⚡ I'm back online…"` when `disconnectedMs > BACK_ONLINE_THRESHOLD_MS`. Test "sends back-online message after extended downtime" passes.

### WR-3-B: Notification NOT sent for short reconnects
verdict:  ✅ SATISFIED
reason:   Spec requires no notification when downtime < 5 min. `whatsapp.ts` guards with `disconnectedMs > BACK_ONLINE_THRESHOLD_MS`. Test "no back-online notification for short reconnects (<5 min)" passes.

### WR-3-C: Notification NOT sent if no peer has ever written
verdict:  ✅ SATISFIED
reason:   Spec requires no notification when `_lastActivePeer` is null. `whatsapp.ts` line 166 checks `this._lastActivePeer`. Test "no back-online notification if no peer has ever written" passes.

### WR-3-D: Notification fires at most once per reconnect cycle
verdict:  ⚠️ PARTIAL
reason:   Spec requires at most one notification per reconnect cycle and `_disconnectedAt` reset on each new disconnect. The `_backOnlineSent` guard (line 167) and its reset on new disconnect (line 205) are implemented. However, no test exercises the "fires at most once" guarantee or the "`_disconnectedAt` resets on each new disconnect" path.
focus:    `reeboot/tests/channels/whatsapp-resilience.test.ts` — missing test: verify that after a long-downtime reconnect sends one notification, a second reconnect does not send a duplicate until a new disconnect cycle resets `_disconnectedAt`

### WR-3-E: Last active peer updated on every inbound message
verdict:  ✅ SATISFIED
reason:   Spec requires `_lastActivePeer` updated on every inbound message. `whatsapp.ts` line 251 sets `this._lastActivePeer = peerId` in `messages.upsert`. Test "_lastActivePeer updated on each inbound message" passes with two messages.

### WR-4-A: Generated unit uses `Restart=always`
verdict:  ✅ SATISFIED
reason:   Spec requires `Restart=always` and absence of `Restart=on-failure`. `daemon.ts` `generateSystemdUnit()` contains `Restart=always`, verified in source and by passing tests "generated unit contains Restart=always" and "generated unit does NOT contain Restart=on-failure".

### WR-4-B: Generated unit includes burst protection
verdict:  ✅ SATISFIED
reason:   Spec requires `StartLimitIntervalSec=120` and `StartLimitBurst=5`. Both are present in `daemon.ts` `generateSystemdUnit()` and verified by passing tests.

### WR-4-C: Existing deployed unit on production reflects new values
verdict:  ❓ UNCLEAR
reason:   Spec marks this "*(Non-code task — manual verification on the server)*" — it cannot be verified programmatically. The contract defines it as a manual check; no automated evidence can satisfy or falsify it.
focus:    Human call — manually run `reeboot stop && reeboot start --daemon` on production server and verify `~/.config/systemd/user/reeboot.service` contains `Restart=always`, `StartLimitIntervalSec=120`, `StartLimitBurst=5`

## Triage

✅ Safe to skip:   WR-1-A, WR-1-B, WR-1-C, WR-1-D, WR-1-E, WR-1-F, WR-1-G, WR-2-A, WR-2-B, WR-2-C, WR-2-F, WR-3-A, WR-3-B, WR-3-C, WR-3-E, WR-4-A, WR-4-B
⚠️  Worth a look:
- **WR-1-H** — attempt counter reset is implemented but has no test verifying backoff restarts from 2s after a successful reconnect
- **WR-2-D** — test for extended-downtime `channel_stalled` event explicitly punts with `expect(true).toBe(true)`; `payload.durationMs ≥ STALL_NOTIFY_MS` is never asserted
- **WR-2-E** — `statusCode` from `lastDisconnect.error.output` is never included in any log entry; the spec requires it on reconnect loop start
- **WR-3-D** — "fires at most once per reconnect cycle" and `_disconnectedAt` reset are implemented but untested
❓  Human call:
- **WR-4-C** — marked as manual verification in the spec; confirm on production server

---

## Evaluation — 2026-05-21 16:44

### WR-1-reconnect-logic
verdict:  ⚠️ PARTIAL
reason:   WR-1-A through WR-1-E and WR-1-H are all implemented and passing. WR-1-F
          ("stop() terminates the reconnect loop — status() returns 'disconnected'") and
          WR-1-G ("logged-out disconnect — no reconnect + status() returns 'error'") have
          correct code paths in src/channels/whatsapp.ts (lines 321-327, 188-196) but zero
          test coverage exercising those paths with assertions.
focus:    reeboot/tests/channels/whatsapp-resilience.test.ts — add tests for stop()
          mid-loop and loggedOut disconnect path

### WR-2-observability
verdict:  ✅ SATISFIED
reason:   WR-2-A: warn log with component:'whatsapp', 'dropped'/'not connected', status field
          — src/channels/whatsapp.ts:332-333, tests pass. WR-2-B: warn log with component,
          attempt, reason on _connect() rejection — line 305, test "reconnect failure logs
          warn with attempt and reason" passes. WR-2-C: error log '[WhatsApp] Connection
          attempt timed out' + emitEvent channel_stalled severity:17 — lines 132-136, test
          "connect timeout emits channel_stalled event" passes. WR-2-D: channel_stalled with
          type/severity/payload.channelType/payload.durationMs emitted after STALL_NOTIFY_MS
          — line 313-314, dedicated test with injected 200ms stallNotifyMs confirms payload
          shape and durationMs ≥ threshold. WR-2-E: statusCode logged at reconnect start —
          lines 288-292. WR-2-F: info log with msg 'back online', durationMs, peerId —
          lines 174-175.

### WR-3-back-online
verdict:  ✅ SATISFIED
reason:   WR-3-A: sendMessage called on _lastActivePeer with "I'm back online" text after
          >BACK_ONLINE_THRESHOLD_MS — src/channels/whatsapp.ts:172; test "sends back-online
          message after extended downtime" passes. WR-3-B/C/D/E: all four guard conditions
          (short reconnect, no peer, at-most-once, peer tracking) implemented and tested
          with dedicated passing tests.

### WR-4-systemd
verdict:  ⚠️ PARTIAL
reason:   WR-4-A and WR-4-B satisfied: generateSystemdUnit() in src/daemon.ts emits
          Restart=always (not Restart=on-failure), StartLimitIntervalSec=120, and
          StartLimitBurst=5; all four daemon-resilience tests pass. WR-4-C ("Existing
          deployed unit on production machine reflects new values") is explicitly marked
          "(Non-code task — manual verification on the server)" in the spec — no evidence
          this has been performed on the production host.
focus:    Production server: run `reeboot stop && reeboot start --daemon` and verify
          ~/.config/systemd/user/reeboot.service reflects Restart=always + limit values.

## Triage

✅ Safe to skip:   WR-2-observability, WR-3-back-online
⚠️  Worth a look:
  - WR-1-reconnect-logic (WR-1-F + WR-1-G): stop() mid-loop and loggedOut disconnect both
    have working code but no test coverage; spec defines explicit THEN conditions for both.
  - WR-4-C: manual production verification not evidenced; server may still run old
    Restart=on-failure unit.

---
