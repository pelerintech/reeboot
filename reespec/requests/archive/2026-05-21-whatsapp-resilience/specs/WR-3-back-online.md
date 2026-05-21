# Spec WR-3 — "I'm back" proactive notification

## Capability

When the WhatsApp channel reconnects after being dark for more than 5 minutes,
the agent sends a short message to the last peer who wrote to it, informing them
it is back online.

---

## WR-3-A: Notification sent after extended downtime

**GIVEN** the adapter was connected and received at least one message  
**WHEN** the channel disconnects and later reconnects  
**AND** the downtime was longer than `BACK_ONLINE_THRESHOLD_MS` (5 min)  
**THEN** `send()` is called on the last active `peerId` with a message containing
  `'back online'` or `'I'm back'`

---

## WR-3-B: Notification NOT sent for short reconnects

**GIVEN** the adapter was connected  
**WHEN** the channel disconnects and reconnects within 5 minutes  
**THEN** no notification message is sent

---

## WR-3-C: Notification NOT sent if no peer has ever written

**GIVEN** the adapter has never received a message (no `_lastActivePeer`)  
**WHEN** the channel reconnects after extended downtime  
**THEN** no notification message is sent

---

## WR-3-D: Notification fires at most once per reconnect cycle

**GIVEN** the channel reconnects after extended downtime  
**WHEN** the "I'm back" message has been sent  
**AND** the channel disconnects and reconnects again quickly (< 5 min)  
**THEN** no second notification is sent in the short reconnect  
**AND** the `_disconnectedAt` timestamp is reset on each new disconnect

---

## WR-3-E: Last active peer is updated on every inbound message

**GIVEN** the adapter is running  
**WHEN** any inbound message is received from `peerId`  
**THEN** `_lastActivePeer` is updated to that `peerId`
