# Brief — presence-feedback

## Problem

When a user sends a long-running task over WhatsApp or Signal (research, multi-step
planning, web scraping), the agent gives zero feedback between receiving the message
and sending the reply. The message stays on grey double-ticks (delivered, not read)
and there are no typing dots. From the user's perspective, there is no way to know
whether reeboot is working, stuck, or dead — especially when turns take 2+ minutes.

## Vision

The moment a message arrives:
1. It is marked as read (blue ticks on WhatsApp, read receipt on Signal) — confirming
   reeboot received and acknowledged the message.
2. A typing indicator appears (three dots) — confirming the agent is actively working.
3. The typing indicator stays alive for the full duration of the turn, refreshing
   automatically as needed (WhatsApp requires periodic refresh; Signal does not).
4. The typing indicator stops cleanly when the turn ends — whether by success, error,
   timeout, or crash. A disappearing indicator without a reply is itself a meaningful
   signal to the user that something went wrong.

## Goals

- **Read receipts on both WhatsApp and Signal** — mark incoming messages as read
  immediately upon receipt, before the orchestrator processes them.
- **Persistent typing indicator on both channels** — typing dots that last the full
  duration of a turn, not just the first 10–15 seconds.
- **Clean stop in all exit paths** — success, error, timeout, and unexpected throws
  all stop the typing indicator before returning.
- **No-op on channels that don't support it** — Web, CLI, and any future channel
  that doesn't implement presence just skip silently.

## Non-Goals

- Channel zombie / silent socket death detection — that is a separate watchdog request.
- Typing indicators for synthetic turn types (scheduler, heartbeat, recovery, memory).
- Presence on channels other than WhatsApp and Signal in this request.
- Any user-visible text acknowledgement ("Got it, working on it…") — the protocol-level
  signals are sufficient.

## Impact

- Users on WhatsApp and Signal immediately know their message was received.
- Long-running research tasks no longer feel like talking to a dead process.
- Disappearing typing dots (on process crash or hard socket failure) serve as an
  implicit error signal, complementing the existing restart notification system.

## Dependencies

None. This request is self-contained.
