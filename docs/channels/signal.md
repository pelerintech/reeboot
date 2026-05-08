---
title: "Signal"
description: "Connect reeboot to Signal via the signal-cli REST API Docker container."
---

# Signal

Reeboot connects to Signal via the [`bbernhard/signal-cli-rest-api`](https://github.com/bbernhard/signal-cli-rest-api) Docker container, which wraps the official Signal CLI in a REST/WebSocket API.

Signal is a **Tier 1 channel**: messages from external senders are subject to the channel policy layer (owner verification, trust gating).

## Prerequisites

- Docker installed and running
- A Signal account (existing phone number, or a dedicated SIM/VoIP number)

## Setup

### Step 1 — Link your Signal account

Start the container in `native` mode to get the linking QR code:

```bash
docker run -p 8080:8080 \
  -v ~/.reeboot/channels/signal:/home/user/.local/share/signal-cli \
  -e MODE=native \
  bbernhard/signal-cli-rest-api:latest
```

Open this URL in your browser:

```
http://localhost:8080/v1/qrcodelink?device_name=reeboot
```

Scan the QR code in Signal: **Settings → Linked Devices → Link New Device**.

Stop the container (Ctrl+C) once linking is complete.

### Step 2 — Run in json-rpc mode (recommended)

```bash
docker run -d -p 8080:8080 \
  -v ~/.reeboot/channels/signal:/home/user/.local/share/signal-cli \
  -e MODE=json-rpc \
  --name reeboot-signal \
  bbernhard/signal-cli-rest-api:latest
```

`json-rpc` mode uses a persistent WebSocket connection — lower latency and more reliable than polling.

### Step 3 — Enable in reeboot config

```json
{
  "channels": {
    "signal": {
      "enabled": true,
      "phoneNumber": "+15551234567",
      "apiPort": 8080
    }
  }
}
```

Replace `+15551234567` with the phone number of the Signal account the container is running on.

### Step 4 — Start reeboot

```bash
reeboot start
```

## Two Deployment Modes

### Mode 1 — Note-to-Self

Leave `owner_id` empty. The agent responds to messages you send to yourself (note-to-self in Signal).

### Mode 2 — Dedicated Account

Set `owner_id` to your personal phone number. The agent runs on a separate Signal account and responds when you message it.

```json
{
  "channels": {
    "signal": {
      "enabled": true,
      "phoneNumber": "+15559876543",
      "apiPort": 8080,
      "owner_id": "+15551234567",
      "owner_only": true
    }
  }
}
```

## Configuration Reference

| Field | Type | Default | Description |
|---|---|---|---|
| `channels.signal.enabled` | boolean | `false` | Enable the Signal channel |
| `channels.signal.phoneNumber` | string | `""` | Phone number of the Signal account running in the container |
| `channels.signal.apiPort` | number | `8080` | Port the signal-cli-rest-api container is listening on |
| `channels.signal.pollInterval` | number | `1000` | Polling interval in ms (used in polling mode; json-rpc mode uses WebSocket) |
| `channels.signal.owner_id` | string | `""` | Your personal phone number. Empty = Mode 1 (note-to-self). Non-empty = Mode 2 (dedicated account) |
| `channels.signal.owner_only` | boolean | `true` | When `true`, only the owner's messages are processed |
| `channels.signal.trust` | string | `"owner"` | Trust level: `"owner"` or `"end-user"` |
| `channels.signal.trusted_senders` | string[] | `[]` | Additional phone numbers whose messages bypass `owner_only` gating |

→ See [Trust and Access](./trust-and-access.md) for a full explanation of trust levels and access control.
