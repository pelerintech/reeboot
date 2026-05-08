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
reeboot channel login whatsapp
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
reeboot channel logout whatsapp
reeboot channel login whatsapp
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
