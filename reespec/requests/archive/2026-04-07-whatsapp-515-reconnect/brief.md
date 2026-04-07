# Brief — whatsapp-515-reconnect

## What

Fix the WhatsApp device-linking flow (`linkWhatsAppDevice`) so that it completes successfully after the post-QR stream restart.

## Problem

After scanning the QR code, WhatsApp sends a stream error with code **515 ("restartRequired")**. This is a normal part of the pairing handshake — WA closes the current WebSocket and expects the client to reconnect immediately with the freshly-saved credentials to complete the link.

`linkWhatsAppDevice` has no reconnect logic. When the 515 fires:
1. `connection.update` emits `connection: 'close'`
2. The handler on the original socket is never re-attached to the new socket
3. `onSuccess()` is never called
4. The 2-minute timeout fires → "WhatsApp QR timed out" — setup fails

The `WhatsAppAdapter._connect()` method already handles this correctly (reconnects on any non-logout disconnect). `linkWhatsAppDevice` needs the same behaviour.

## Goals

- `linkWhatsAppDevice` reconnects automatically on `restartRequired` (515) and calls `onSuccess` when the new connection reaches `open`
- The timeout remains active across reconnects — total linking budget is still 2 minutes
- `onTimeout` and `onSuccess` are each called at most once (no double-fire)
- `loggedOut` (401) and other fatal codes abort without reconnect (same behaviour as `_connect`)

## Non-Goals

- Not changing `WhatsAppAdapter._connect()` (already correct)
- Not changing the timeout duration
- Not changing the QR display logic

## Impact

WhatsApp linking works end-to-end for users running `reeboot` or `reeboot channel login whatsapp`.
