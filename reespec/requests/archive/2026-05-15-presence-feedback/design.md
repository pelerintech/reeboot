# Design — presence-feedback

## Architecture

### Optional capability on the ChannelAdapter interface

Two optional methods are added to `ChannelAdapter` in `src/channels/interface.ts`:

```typescript
/** Mark an incoming message as read (e.g. blue ticks). Optional — no-op if absent. */
markRead?(msg: IncomingMessage): Promise<void>;

/** Start a typing indicator directed at the sender of msg. Optional — no-op if absent. */
startTyping?(msg: IncomingMessage): Promise<void>;

/** Stop the typing indicator. Optional — no-op if absent. */
stopTyping?(msg: IncomingMessage): Promise<void>;
```

Optional methods keep the interface non-breaking — all existing adapters
(Web, CLI) compile and pass contract tests without changes.

### Where markRead is called

Inside the adapter's inbound message handler, immediately after the message
is accepted and **before** publishing to the bus. This guarantees blue ticks
appear the instant the message is extracted, regardless of how long the turn
takes.

```
messages.upsert event fires
  → text extracted
  → markRead(msg)     ← here, before bus.publish
  → bus.publish(incomingMessage)
```

### Where startTyping / stopTyping are called

In `Orchestrator._runTurn()`, wrapping the runner invocation:

```
_runTurn()
  → [skip for synthetic channels: scheduler, heartbeat, recovery, memory]
  → adapter.startTyping?.(msg)
  → start refresh interval (WhatsApp only, every 8s)
  → try { await runner.prompt(...) }
    catch / timeout
  → finally { clearInterval; adapter.stopTyping?.(msg) }
```

The `finally` block guarantees `stopTyping` is called on every exit path:
success, error, timeout, and unexpected throw.

### WhatsApp — Baileys presence API

```typescript
// Read receipt
await sock.readMessages([msg.key]);

// Typing start (called once, then refreshed every 8s)
await sock.sendPresenceUpdate('composing', peerId);

// Typing stop
await sock.sendPresenceUpdate('paused', peerId);
```

WhatsApp's typing indicator auto-expires after ~10–15 seconds on the recipient's
device. A `setInterval` at 8s keeps it alive for the full turn duration.

The interval is stored as an instance field on the adapter, keyed by peerId,
so concurrent turns to different peers each have their own refresh timer.

### Signal — signal-cli-rest-api endpoints

```
// Read receipt
POST /v1/receipts/{number}
Body: { "recipient": peerId, "receipt_type": "read", "timestamp": <msg timestamp> }

// Typing start
PUT /v1/typing-indicator/{number}
Body: { "recipient": peerId }

// Typing stop
DELETE /v1/typing-indicator/{number}
Body: { "recipient": peerId }
```

Signal's server handles indicator expiry itself — no refresh loop needed.

### Synthetic turn guard

The orchestrator already has `SKIP_HEADER_CHANNELS` (`scheduler`, `recovery`,
`heartbeat`) and a `skipPersist` guard. The typing indicator uses the same set,
plus `memory`. No typing dots are sent for background/automated turns.

```typescript
const SKIP_PRESENCE_CHANNELS = new Set(['scheduler', 'recovery', 'heartbeat', 'memory']);
```

### Failure isolation

`markRead`, `startTyping`, `stopTyping`, and the refresh interval callback are
all wrapped in `try/catch`. A presence failure must never propagate to the turn
or kill the refresh loop. Errors are logged at `debug` level (not `warn`) —
they are cosmetic failures, not operational ones.

## Key Decisions

### Optional interface methods, not a separate PresenceCapable interface

A separate `PresenceCapable` interface would require the orchestrator to perform
an `instanceof` or duck-type check. Optional methods on `ChannelAdapter` keep the
call site clean: `adapter.startTyping?.(msg)` — one character handles the no-op
case. This is consistent with how `selfAddress()` is documented as optional in
spirit (returns `null` when not applicable) while being required in the interface.

### markRead in the adapter, not the orchestrator

The orchestrator receives an `IncomingMessage` (already abstracted). The raw
Baileys `msg.key` needed for `readMessages()` lives in `msg.raw`. Calling
`markRead` in the adapter keeps raw protocol details inside the adapter where
they belong. The orchestrator calls the abstraction; the adapter calls the protocol.

### 8-second refresh interval for WhatsApp

WhatsApp's indicator expires at ~10–15s. 8s gives a comfortable buffer without
being wasteful (7–8 pings per minute during a long turn). The interval value is
a named constant `TYPING_REFRESH_MS = 8_000` in the adapter for easy tuning.

### No refresh needed for Signal

The signal-cli-rest-api `PUT /v1/typing-indicator` maps directly to Signal's
`sendTyping` which sets the indicator at the protocol level. Signal's own
expiry handling is separate from the REST call. No periodic refresh is needed.

### stopTyping called in finally, not in each exit branch

`_runTurn` has four exit points: success break, timeout return, error return,
and unexpected throw. Wrapping the runner invocation in `try/finally` with
`stopTyping` in the `finally` block is the only approach that guarantees
coverage of all paths including unexpected throws. Duplicating `stopTyping`
calls in each branch would be fragile.

## Risks

- **Baileys `readMessages` call on a stale socket** — the WhatsApp adapter already
  guards all outbound calls with `if (!this._socket)`. The same guard applies here.
- **Signal REST API unavailable** — `markRead` and `startTyping` catch all errors
  silently. A down signal-cli-rest-api sidecar does not affect message delivery.
- **Concurrent turns to the same peer** — unlikely (orchestrator queues per context),
  but the interval Map is keyed by peerId so concurrent turns to different peers are
  isolated.
