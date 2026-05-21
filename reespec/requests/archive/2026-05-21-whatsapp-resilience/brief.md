# Brief — whatsapp-resilience

## Problem

The WhatsApp channel adapter stops responding silently after certain failure
sequences. The root cause is a regression introduced in `ebe5c69`: the reconnect
loop was refactored to add exponential backoff, but the change broke the retry
chain. When `_connect()` is called during a reconnect attempt and the new socket
stalls internally (never fires `'open'` or `'close'`), the `_reconnecting` flag
stays `true` forever, blocking all future reconnect attempts. The process remains
alive (systemd sees it healthy), but the WhatsApp socket is dead and no messages
are received or sent.

Additionally:
- `send()` silently drops messages when the socket is reconnecting (no log, no
  evidence)
- There is no connection watchdog — a stalled socket is never detected
- The systemd unit uses `Restart=on-failure`, so a hung (not crashed) process
  is never restarted
- When the channel goes dark and recovers, the user has no way of knowing

This caused a 3-day silent outage in production (May 18–21, 2026).

## Root Cause Summary

1. **`_connect()` is fire-and-forget** — it returns before `'open'` fires. The
   reconnect handler incorrectly treats `await this._connect()` returning as
   "connection established". `_reconnecting` stays `true` permanently.

2. **No socket stall watchdog** — Baileys has `connectTimeoutMs: 20000` but when
   it fires `'close'` during an already-active reconnect (`_reconnecting=true`),
   the guard blocks re-entry. The socket is abandoned silently.

3. **No observability on failure paths** — dropped sends, stalled sockets, and
   reconnect failures produce no logs and no DB events.

4. **systemd `Restart=on-failure` is insufficient** — a hung process never
   triggers restart.

5. **No user notification on recovery** — when the channel reconnects after
   extended downtime, the user is not informed.

## Goals

- Fix the reconnect logic so the adapter correctly retries after any failure
  (stall, error, guard bug)
- Add a connection watchdog that detects stalled sockets and forces restart
- Add observability: every dropped send, every stall, every reconnect logged with
  reason and emitted to `operational_logs`
- Update systemd unit to `Restart=always` with burst protection
- Send a proactive "I'm back" message to the last active peer when the channel
  reconnects after more than 5 minutes of downtime

## Non-Goals

- Reducing the frequency of normal WA Web reconnects (this is WA protocol
  behaviour, not a bug)
- Queuing/replaying messages that arrived while the socket was dead (WA delivers
  them on reconnect via Baileys history sync)
- Signal or webchat channel changes

## Impact

- Prevents silent multi-day outages
- Makes WhatsApp channel health observable (logs + DB events)
- Gives user a recovery signal when the channel was dark

## Decisions Relevant to This Request

- All operational logs go through pino → `operational_logs` table (observability-system)
- Channel events (`channel_connected`, `channel_disconnected`) emitted via
  `emitEvent()` (observability-system)
- `Restart=on-failure` was chosen in the original daemon.ts — this request changes
  it to `Restart=always`
