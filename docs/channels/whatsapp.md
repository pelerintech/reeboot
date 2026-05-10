---
title: "WhatsApp"
description: "Connect reeboot to WhatsApp via QR code — no WhatsApp Business API required."
---

# WhatsApp

Reeboot connects to WhatsApp using [Baileys](https://github.com/WhiskeySockets/Baileys), a WhatsApp Web multi-device library. No WhatsApp Business API account or phone number is required beyond your own WhatsApp account.

WhatsApp is a **Tier 1 channel**: messages from external senders are subject to the channel policy layer (owner verification, trust gating).

## Two Deployment Modes

### Mode 1 — Self-Chat (default)

The agent runs on **your own WhatsApp account**. You talk to it by messaging yourself (the "Reeboot" linked device appears in your contacts). Leave `owner_id` empty.

```json
{
  "channels": {
    "whatsapp": {
      "enabled": true,
      "owner_only": true
    }
  }
}
```

### Mode 2 — Dedicated Account

The agent runs on a **separate WhatsApp account** (a second phone number or a dedicated SIM). You talk to it by messaging that number from your own account. Set `owner_id` to your own phone number or JID so reeboot knows who the owner is.

```json
{
  "channels": {
    "whatsapp": {
      "enabled": true,
      "owner_id": "+15551234567",
      "owner_only": true
    }
  }
}
```

## Setup

**Step 1 — Enable in config**

```json
{
  "channels": {
    "whatsapp": { "enabled": true }
  }
}
```

**Step 2 — Start the agent**

```bash
reeboot start
```

**Step 3 — Link the device**

```bash
reeboot channels login whatsapp
```

A QR code appears in your terminal. Open WhatsApp on your phone:

```
Settings → Linked Devices → Link a Device → Scan QR
```

**Step 4 — Send a message**

In Mode 1: message yourself. In Mode 2: message the agent's number from your own account.

The session persists across restarts — credentials are saved in `~/.reeboot/channels/whatsapp/auth/`.

## Re-linking

If the WhatsApp session expires or is revoked:

```bash
reeboot channels logout whatsapp
reeboot channels login whatsapp
```

## Configuration Reference

| Field | Type | Default | Description |
|---|---|---|---|
| `channels.whatsapp.enabled` | boolean | `false` | Enable the WhatsApp channel |
| `channels.whatsapp.owner_id` | string | `""` | Owner's phone number or JID. Empty = Mode 1 (self-chat). Non-empty = Mode 2 (dedicated account) |
| `channels.whatsapp.owner_only` | boolean | `true` | When `true`, only the owner's messages are processed. Set to `false` to allow the agent to respond to anyone |
| `channels.whatsapp.trust` | string | `"owner"` | Trust level: `"owner"` or `"end-user"` |
| `channels.whatsapp.trusted_senders` | string[] | `[]` | Additional JIDs whose messages bypass `owner_only` gating |

→ See [Trust and Access](./trust-and-access.md) for a full explanation of trust levels and access control.

## Troubleshooting

### Owner identity not recognised — `@s.whatsapp.net` vs `@lid`

**Symptom:** Messages from your phone are silently ignored even though `owner_id` appears to be set correctly.

**Cause:** WhatsApp's multi-device protocol (Linked Devices mode) uses two different JID formats to identify the same phone number:

- `@s.whatsapp.net` — the traditional E.164-based format (e.g. `15551234567@s.whatsapp.net`)
- `@lid` — an opaque identifier assigned by WhatsApp's multi-device infrastructure (e.g. `43624150659184@lid`)

When Baileys receives a message in multi-device mode, it may report the sender using the `@lid` format rather than the phone-number-based `@s.whatsapp.net` format. If `owner_id` was set using the phone number format but Baileys delivers messages with `@lid`, the strict equality check in the policy layer will silently drop all messages.

**Manual fix:** Run reeboot with debug logging, send a message, and copy the exact `peerId` value from the log:

```bash
reeboot start --log-level debug
# Send a WhatsApp message to the agent from your phone
# Look for a log line containing "peerId" — copy that exact value
```

Then update your config:

```json
{
  "channels": {
    "whatsapp": {
      "owner_id": "43624150659184@lid"
    }
  }
}
```

**Recommended fix:** Use the automated owner setup command, which captures the exact `peerId` from a live message and saves it for you:

```bash
reeboot channels setup owner-whatsapp
```

This eliminates the format guessing entirely — whatever JID Baileys reports is exactly what gets saved.
