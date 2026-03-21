---
name: send-message
description: Send a message back to the originating channel or to a specific contact via WhatsApp or Signal. Use when the user asks you to send, forward, or relay a message to someone via a messaging channel.
---

# Send Message

Teaches the agent to send a message back to the originating channel or to a specific peer via reeboot's channel routing system.

## Setup

No external dependencies. The send-message capability is built into reeboot's channel system.

Supported channels (must be configured in `~/.reeboot/config.json`):
- **WhatsApp** — requires WhatsApp session to be active (`reeboot channels login whatsapp`)
- **Signal** — requires Signal container running (`reeboot channels login signal`)

Verify channel status:
```
reeboot channels list
```

## Usage

### Send a reply in the same turn

Simply include your reply text as the response — reeboot routes it back to the originating channel automatically.

### Send to a specific contact

Use the `send_message` tool (registered by the channel routing system):

```
send_message({
  channel: "whatsapp",       // or "signal"
  peerId: "+1234567890",     // phone number or WhatsApp JID
  content: "Hello from reeboot!"
})
```

### When to use vs. just responding

- **Just respond** — if you want to reply to the person who sent you the message (same turn, same channel). This is the default.
- **Use send_message tool** — if you need to send to a *different* contact or channel, or send *proactively* (e.g., from a scheduled task).

### Example flows

```
User (WhatsApp): "Text my wife that I'll be home late"
→ Identify contact from user's address book or ask for phone number
→ Confirm: "Send 'I'll be home late' to +1XXXXXXXXXX on WhatsApp?"
→ send_message({ channel: "whatsapp", peerId: "+1XXXXXXXXXX", content: "I'll be home late" })
→ Report: "Message sent."
```

```
Scheduled task: daily standup reminder
→ send_message({ channel: "whatsapp", peerId: "team@g.us", content: "Daily standup in 15 minutes!" })
```

## Important

- Always confirm recipient and content before sending
- Never send without explicit user instruction (or a pre-approved schedule)
- Report delivery status or errors clearly
