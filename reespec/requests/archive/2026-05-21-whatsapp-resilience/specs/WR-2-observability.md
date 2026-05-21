# Spec WR-2 — Observability: no more silence

## Capability

Every failure event on the WhatsApp channel produces a structured log entry
and/or DB event. Investigators can reconstruct what happened from logs alone.

---

## WR-2-A: Dropped send is logged at warn level

**GIVEN** the adapter's status is NOT `'connected'`  
**WHEN** `send()` is called  
**THEN** pino emits a `warn`-level log with:
  - `component: 'whatsapp'`
  - `msg` containing `'dropped'` or `'not connected'`
  - `status` field showing the current status  
**AND** the function returns without throwing

---

## WR-2-B: `_connect()` rejection is logged at warn level

**GIVEN** `_connect()` is called and the socket fires `'close'` before `'open'`  
**WHEN** the reconnect loop catches the rejection  
**THEN** pino emits a `warn`-level log with:
  - `component: 'whatsapp'`
  - `attempt` number
  - error message or reason

---

## WR-2-C: Connect timeout is logged at error level and emits DB event

**GIVEN** `_connect()` is called and the socket stalls (no events)  
**WHEN** `CONNECT_TIMEOUT_MS` elapses  
**THEN** pino emits an `error`-level log: `'[WhatsApp] Connection attempt timed out'`  
**AND** `emitEvent()` is called with `type: 'channel_stalled'` and `severity: 17`

---

## WR-2-D: Extended downtime (> 5 min) emits `channel_stalled` event

**GIVEN** the reconnect loop has been running for more than `STALL_NOTIFY_MS` (5 min)  
**WHEN** a reconnect attempt fails  
**THEN** `emitEvent()` is called with:
  - `type: 'channel_stalled'`
  - `severity: 17`
  - `payload.channelType: 'whatsapp'`
  - `payload.durationMs` ≥ `STALL_NOTIFY_MS`

---

## WR-2-E: Reconnect reason is logged

**GIVEN** Baileys fires `'close'`  
**WHEN** the reconnect loop starts  
**THEN** the log entry includes the `statusCode` from `lastDisconnect.error.output`  
  (or `'unknown'` if absent)

---

## WR-2-F: "I'm back" notification logged when sent

**GIVEN** the adapter reconnects after > `BACK_ONLINE_THRESHOLD_MS` (5 min)  
**WHEN** the "I'm back" message is sent to the last active peer  
**THEN** pino emits an `info`-level log:
  - `msg` containing `'back online'`
  - `durationMs` field showing the downtime duration
  - `peerId` field
