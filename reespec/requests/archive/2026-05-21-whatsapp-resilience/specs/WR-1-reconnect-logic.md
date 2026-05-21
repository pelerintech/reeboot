# Spec WR-1 — Reconnect logic correctness

## Capability

`WhatsAppAdapter` correctly retries connection after any failure mode without
getting stuck, losing the retry loop, or leaving `_reconnecting` permanently set.

---

## WR-1-A: Non-logout close triggers reconnect

**GIVEN** the adapter is started and connected  
**WHEN** Baileys emits `connection.update { connection: 'close' }` with a
non-logout status code  
**THEN** `makeWASocket` is called again (new socket created for retry)

---

## WR-1-B: `_connect()` awaits `'open'` before returning

**GIVEN** `_connect()` is called  
**WHEN** the socket emits `connection.update { connection: 'open' }`  
**THEN** `_connect()` resolves  
**AND** adapter status becomes `'connected'`

---

## WR-1-C: `_connect()` rejects on `'close'`

**GIVEN** `_connect()` is called  
**WHEN** the socket emits `connection.update { connection: 'close' }` before `'open'`  
**THEN** `_connect()` rejects (throws)  
**AND** the reconnect loop retries with backoff (makeWASocket called again)

---

## WR-1-D: Stalled socket (no events) triggers retry via timeout

**GIVEN** `_connect()` is called  
**WHEN** the socket emits neither `'open'` nor `'close'` within `CONNECT_TIMEOUT_MS`  
**THEN** `_connect()` rejects with a timeout error  
**AND** the reconnect loop retries

---

## WR-1-E: Close during ongoing reconnect does not start a second loop

**GIVEN** the reconnect loop is already running (first retry in progress)  
**WHEN** Baileys fires another `connection.update { connection: 'close' }` (e.g.
from the stalled socket Baileys internally times out)  
**THEN** a second reconnect loop is NOT started  
**AND** the existing loop continues normally

---

## WR-1-F: `stop()` terminates the reconnect loop

**GIVEN** the reconnect loop is running  
**WHEN** `stop()` is called  
**THEN** the loop exits without starting another `_connect()` attempt  
**AND** `status()` returns `'disconnected'`

---

## WR-1-G: Logged-out disconnect does not reconnect

**GIVEN** the adapter is started  
**WHEN** Baileys emits `connection.update { connection: 'close' }` with
`statusCode === DisconnectReason.loggedOut`  
**THEN** no reconnect is attempted  
**AND** `status()` returns `'error'`

---

## WR-1-H: Reconnect attempt counter resets on successful connect

**GIVEN** the adapter has attempted reconnect N times  
**WHEN** `connection.update { connection: 'open' }` fires  
**THEN** the internal attempt counter is reset to 0  
**AND** the next disconnect starts backoff from 2s again
