# WhatsApp webchat reconnection — design

## Overview

A REST-driven QR/pairing flow that runs **separately** from the WhatsApp adapter. The adapter is stopped before linking and restarted after success — it never participates in the QR generation. The Renders QR codes as data URLs so the webchat can display them inline without needing its own QR library.

## Flow

```
Channels page                    Server                         WhatsApp Adapter
─────────────                    ──────                         ────────────────
User clicks "Connect"
  ── POST /api/channels/whatsapp/qr ──▶
                                    1. Stop adapter (if running)
                                    2. Wipe auth dir
                                    3. Start linkWhatsAppDevice()
                                    4. Wait for onQr callback
                                    5. Render QR to data URL
  ◀── { qrDataUrl } ─────────────────
Show QR image
User scans QR with phone
  ... (background) ...
                                    onSuccess fires
                                    6. Auth saved to disk
                                    7. Start adapter (picks up fresh auth)
  ◀── adapter now "connected" ──── (via poll)
```

## Components

### Backend

#### 1. `POST /api/channels/whatsapp/qr`

Triggers a fresh QR linking flow. Returns the QR as a data URL when generated.

- Stops the WhatsApp adapter (calls `adapter.stop()` — no-op if already stopped)
- Clears the adapter's auth directory (`~/.reeboot/channels/whatsapp/auth/`)
- Calls `linkWhatsAppDevice()` with:
  - `authDir`: adapter's auth directory
  - `onQr`: callback — renders QR to data URL via `QRCode.toDataURL()`, resolves the response
  - `onSuccess`: callback — starts the adapter via `adapter.start()`
  - `onTimeout`: callback — leaves adapter stopped, client will see "disconnected"
  - `timeoutMs`: 120_000 (2 min, same as existing wizard)
- Waits for `onQr` with a 10-second inner timeout
- Response: `{ qrDataUrl: "data:image/png;base64,..." }` on success
- Response: `{ error: "QR not generated within timeout" }` on failure
- **Client blocks until QR is generated** — no polling for the QR itself

#### 2. `POST /api/channels/whatsapp/pair`

Fallback when QR fails or times out. Uses phone-number pairing.

- Stops the WhatsApp adapter (if running)
- Clears the adapter's auth directory
- Creates a Baileys socket with `pairingCode: true` and the provided `phoneNumber`
- Sends pairing request — user approves on their phone
- On success: saves creds, starts adapter, returns `{ status: "paired" }`
- On timeout: returns `{ error: "Pairing timed out. Try again." }`
- Request body: `{ phone: "+1234567890" }`

#### 3. `POST /api/channels/whatsapp/reset`

Clears auth and stops the adapter — used to switch accounts or abort a failed link.

- Calls `adapter.stop()`
- Wipes auth directory (`rmSync(authDir, { recursive: true })`, then recreate)
- Returns `{ status: "reset" }`
- Adapter stays stopped until user triggers QR or pairing

#### 4. WhatsApp adapter coordination

The adapter is NOT modified. The three endpoints above interact with it only through its public API:
- `adapter.stop()` — stops the adapter (existing)
- `adapter.start()` — starts the adapter (existing, picks up auth from disk)
- `adapter.status()` — read-only (already used by /api/channels)

After `linkWhatsAppDevice()` or the pairing flow saves fresh auth to disk, `adapter.start()` is called. The adapter's `_connect()` loads the saved auth via `useMultiFileAuthState()` and connects normally. The `pairingCode: true` flag on the adapter is ignored when valid auth already exists — Baileys reuses the stored credentials.

### Frontend

#### ChannelQrDialog component (`webchat/src/components/ChannelQrDialog.tsx`)

Shown when the user clicks "Connect" or "Reconnect" on the WhatsApp channel row.

States:
| State | What's shown |
|---|---|
| `idle` | QR image + "Open WhatsApp → Settings → Linked Devices → Link a Device, then scan" |
| `scanning` | (after QR shown, waiting for scan) "Waiting for scan... page will update automatically" |
| `paired` | "✅ Connected!" + auto-navigate back to channel list |
| `timeout` | "QR expired." + "Try QR again" button + "Use phone number instead" button |
| `pairing` | Phone number input + "Enter your phone number (with country code)" + Send button |
| `pairing_wait` | "Pairing request sent. Approve on your phone..." |
| `pairing_error` | "Pairing failed." + "Try again" button |

The dialog is rendered as a modal overlay on the Channels page. It uses the same Tailwind styles as the rest of the webchat.

After successful connection, the dialog closes and the Channels page's polling interval picks up the "connected" status within 5 seconds.

#### Channels page changes (`webchat/src/pages/Channels.tsx`)

- "Connect" button for WhatsApp when status is "disconnected" → opens ChannelQrDialog
- "Reconnect" button for WhatsApp when status is "error" → opens ChannelQrDialog (triggers reset first)
- "Switch account" button when status is "connected" → POST /reset, then opens ChannelQrDialog
- These replace the current generic "Login" / "Reconnect" buttons that only work for CLI/terminal

### QR rendering

Uses the `qrcode` npm package (already in the project? — if not, added as a server dependency).
- `QRCode.toDataURL(qrString, { width: 280, margin: 2 })` returns a `data:image/png;base64,...` string
- QR is generated on the server, sent as a data URL in the JSON response
- Client renders as `<img src={dataUrl} />` — no QR library needed in the browser

## Tradeoffs considered

| Approach | Chosen? | Why |
|---|---|---|
| Polling for QR | No | POST waits for QR and returns it directly. No polling needed for the QR itself. Only the existing 5s channel-status poll is used. |
| SSE stream for QR | No | Overkill for a single one-time event. The POST response is simpler. |
| QR library on client | No | Generating the data URL server-side keeps the webchat dependency-free. |
| Modify adapter to store QR | No | Adapter is not modified. The link flow is completely separate. |
| Adapter status `qr_pending` | No | Client manages linking state locally. Adapter is stopped during linking → status shows "disconnected". |
| linkWhatsAppDevice() in same process | Yes | Already exists, handles 515 restart, has correct callbacks. Reuse it directly. |

## Risks

- **WhatsApp drops connection shortly after linking** (historical issue, recalled during discovery). Mitigation: the adapter's existing `_reconnectLoop()` handles disconnects automatically. If this is a persistent problem, the phone-number pairing fallback provides an alternative connection path.
- **`linkWhatsAppDevice()` 2-min timeout**: total linking budget starts when the user clicks "Connect". If they take more than 2 minutes to scan, the flow times out and they must retry. The webchat clearly shows remaining time.
- **Adapter restart race**: `adapter.start()` is called from `onSuccess` callback. If the adapter is already running (shouldn't happen since we stop it first), `start()` might double-initialize. Mitigation: `stop()` is always called before the link flow, and `start()` guards against double-init internally (sets `_stopping = false`).
