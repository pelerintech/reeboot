---
title: "Trust and Access Control"
description: "How reeboot controls who can send messages, who is the owner, and what trust level applies."
---

# Trust and Access Control

Reeboot has a layered access control model for Tier 1 channels (WhatsApp, Signal). It controls three things:

1. **Who is the owner** — the person who owns and controls the agent
2. **Who can send messages** — owner only, or anyone
3. **What trust level applies** — affects tool permissions and injection guard behaviour

Tier 2 channels (WebChat, CLI) always treat all messages as coming from the owner — no access control configuration applies.

---

## Owner Identity

### Mode 1 — Self-Chat

Leave `owner_id` empty. The agent identifies the owner as **messages where `fromSelf` is true** — i.e. messages you send to yourself from your own account.

Use this when the agent runs on your personal WhatsApp or Signal account.

### Mode 2 — Dedicated Account

Set `owner_id` to your personal phone number or JID. The agent identifies the owner as messages where the sender matches `owner_id`.

Use this when the agent runs on a separate dedicated account and you message it from your own account.

```json
{
  "channels": {
    "whatsapp": {
      "owner_id": "+15551234567"
    },
    "signal": {
      "owner_id": "+15551234567"
    }
  }
}
```

---

## owner_only

When `true` (the default), only messages from the identified owner are processed. All other messages are silently dropped.

When `false`, the agent responds to messages from anyone who contacts it. Use this only if you intentionally want others to interact with your agent.

```json
{
  "channels": {
    "whatsapp": {
      "owner_only": false
    }
  }
}
```

> **Warning**: setting `owner_only: false` exposes your agent — and any tools it has access to — to anyone who can message the connected account.

---

## trusted_senders

An allowlist of sender IDs (phone numbers or JIDs) that bypass `owner_only` gating. Messages from these senders are processed even when `owner_only: true`.

```json
{
  "channels": {
    "whatsapp": {
      "owner_only": true,
      "trusted_senders": ["+15559999999", "+15558888888"]
    }
  }
}
```

---

## Trust Level

The `trust` field sets the trust level for all messages on that channel:

| Value | Meaning |
|---|---|
| `"owner"` | Messages are treated as coming from the agent's owner. Full tool access. Injection guard is relaxed for this channel. |
| `"end-user"` | Messages are treated as coming from an external user. Restricted tool access. Injection guard is active. |

Default is `"owner"` for all channels.

Set `trust: "end-user"` if you are building a service where multiple external users interact with the agent:

```json
{
  "channels": {
    "whatsapp": {
      "owner_only": false,
      "trust": "end-user"
    }
  }
}
```

---

## Configuration Fields (all channels)

| Field | Type | Default | Applies to |
|---|---|---|---|
| `owner_id` | string | `""` | WhatsApp, Signal |
| `owner_only` | boolean | `true` | WhatsApp, Signal |
| `trust` | `"owner"` \| `"end-user"` | `"owner"` | Web, WhatsApp, Signal |
| `trusted_senders` | string[] | `[]` | Web, WhatsApp, Signal |

→ See [Permission Tiers](../security/permission-tiers.md) for how trust level interacts with tool access.
→ See [Injection Guard](../security/injection-guard.md) for how `trust: "end-user"` activates full injection scrutiny on fetched content.
