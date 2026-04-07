# Design — whatsapp-515-reconnect

## Root Cause

`linkWhatsAppDevice` creates one socket and attaches handlers to it. When baileys closes the socket with `restartRequired` (515), the `connection.update` event fires with `connection: 'close'`. There is no reconnect branch — the function just stops. Meanwhile the timeout is still ticking, eventually fires, and calls `onTimeout()`.

## Approach — extract a recursive `connect()` inner function

Refactor `linkWhatsAppDevice` to mirror the pattern already used in `WhatsAppAdapter._connect()`:

1. Extract a local `async function connect()` inside `linkWhatsAppDevice`
2. On `connection: 'close'`:
   - Check `statusCode === DisconnectReason.loggedOut` → call nothing, abort (fatal)
   - Check `statusCode === DisconnectReason.restartRequired` (515) → call `connect()` (normal post-pairing restart)
   - All other non-fatal codes → call `connect()` (standard reconnect)
3. The outer `resolved` flag and `timeoutHandle` are shared across all recursive calls — so `onSuccess` / `onTimeout` still fire at most once
4. The timeout is not reset on reconnect — the 2-minute budget is total, not per-attempt

## Why not a loop / retry counter?

The recursive approach matches the existing `_connect()` pattern exactly, making the code consistent and easy to reason about. A loop would require more state management. A retry counter is unnecessary — 515 happens exactly once per pairing session.

## What stays the same

- `onQr` is only called on the first socket (QR is already scanned when 515 fires, no new QR needed)
- `saveCreds` re-attached on every new socket (baileys requires this)
- `sock.end(undefined)` on timeout still uses the socket reference captured in the current closure

## Test approach

The test mocks `@whiskeysockets/baileys` to simulate the 515 → reconnect → open sequence:
1. First socket: emit `connection: 'close'` with statusCode 515
2. Second socket: emit `connection: 'open'`
3. Assert `onSuccess` called once, `onTimeout` not called

Also test the existing happy path (no 515) and the timeout path (no open ever fires).

## Files changed

- `reeboot/src/channels/whatsapp.ts` — `linkWhatsAppDevice` function only
