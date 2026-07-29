# WhatsApp webchat reconnection

## What

Give the owner the ability to re-link their WhatsApp account through the webchat UI — both for first-time setup and for recovery after logout/disconnection — without needing CLI access or terminal QR output.

## Why

Currently, WhatsApp registration happens once at server startup via terminal QR code. If the user is disconnected (logged out, session expired, WhatsApp-side issue), there is no way to re-link from the web interface. The user must have terminal/SSH access to get a fresh QR. This makes remote administration of a headless deployment painful — the user cannot recover WhatsApp without shell access.

## Goals

- User can trigger a fresh WhatsApp QR code from the webchat Channels page
- QR code is displayed as an inline image in the browser
- If QR fails or times out, user can fall back to phone-number pairing
- User can reset/switch to a different WhatsApp account
- The existing WhatsApp adapter is NOT modified — the QR/link flow is a separate path

## Non-goals

- Not changing the WhatsApp adapter's internal connect/reconnect logic
- Not modifying the existing `pairingCode: true` setting
- Not adding a full channel-management dashboard — just reconnection
- Not handling other channels (Signal, Telegram) — WhatsApp only
- Not building a general-purpose "device linking wizard" — only WhatsApp QR

## Impact

- 2 new REST endpoints (QR generation with data URL, phone-number pairing fallback)
- 1 new ChannelQrDialog component in the webchat Channels page
- QR displayed as inline `<img>` via `qrcode` npm package
- Adapter auth directory managed (cleared on reset) — no adapter code changes
