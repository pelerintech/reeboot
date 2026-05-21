# Design — whatsapp-resilience

## Architecture

Three independent layers, each a complete safety net on its own:

```
┌─────────────────────────────────────────────────────────────┐
│  L1 — Reconnect logic fix (whatsapp.ts)                     │
│  _connect() resolves on 'open' or rejects on 'close'/       │
│  timeout. Retry loop is persistent. Flags are airtight.     │
├─────────────────────────────────────────────────────────────┤
│  L2 — Observability (whatsapp.ts + operational_logs)        │
│  Every dropped send, stall, reconnect reason logged.        │
│  channel_stalled event emitted to DB.                       │
├─────────────────────────────────────────────────────────────┤
│  L3 — Process supervisor (daemon.ts + systemd unit)         │
│  Restart=always + burst protection. Last resort.            │
└─────────────────────────────────────────────────────────────┘
```

## L1 — Reconnect Logic Redesign

### Problem with current design

`_connect()` is async but resolves immediately after registering event handlers.
The reconnect handler does:

```typescript
await this._connect();   // returns in ~100ms regardless of connection outcome
// _reconnecting stays true — 'open' fires later asynchronously
```

### New design: `_connect()` returns a Promise that settles on connection outcome

```typescript
private _connect(): Promise<void> {
  return new Promise((resolve, reject) => {
    const sock = makeWASocket({ ... });
    const timer = setTimeout(() => {
      reject(new Error('connect timeout'));
    }, CONNECT_TIMEOUT_MS);  // 30s

    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
      if (connection === 'open') {
        clearTimeout(timer);
        resolve();
      } else if (connection === 'close') {
        clearTimeout(timer);
        reject(lastDisconnect?.error ?? new Error('connection closed'));
      }
    });
  });
}
```

The reconnect loop then becomes a proper `while` loop:

```typescript
private async _reconnectLoop(): Promise<void> {
  if (this._stopping) return;   // explicit stop sentinel — separate from reconnect guard
  this._reconnectAttempt = 0;

  while (!this._stopping) {
    this._reconnectAttempt++;
    const delayMs = Math.min(2000 * Math.pow(2, this._reconnectAttempt - 1), 60_000);
    await sleep(delayMs);
    if (this._stopping) break;

    try {
      await this._connect();    // now properly awaits 'open'
      this._reconnectAttempt = 0;
      return;                   // connected — exit loop
    } catch (err) {
      // log and continue — next iteration will retry with backoff
    }
  }
}
```

### Flag cleanup

Current: `_reconnecting` is dual-purpose (reconnect guard + stop sentinel).
New: two explicit booleans:
- `_stopping: boolean` — set by `stop()`, prevents reconnect
- `_reconnecting: boolean` — set during the reconnect loop, prevents double-entry

### `connection.update` handler

The handler now only decides **whether to start the reconnect loop**:

```typescript
if (connection === 'close') {
  if (this._stopping) return;
  if (!this._reconnecting) {
    this._reconnecting = true;
    this._reconnectLoop().finally(() => { this._reconnecting = false; });
  }
  // if _reconnecting is already true: the running loop will retry — do nothing
}
```

This is correct because:
1. If `_connect()` stalls and eventually fires `'close'` (Baileys timeout): loop
   is already running, catches the rejection from the Promise, retries.
2. If a second `'close'` fires during backoff wait: guard prevents double-entry.
3. If `stop()` is called: `_stopping = true` exits the loop.

### "I'm back" notification

Track `_disconnectedAt: Date | null` when connection goes dark. On `'open'`,
if `Date.now() - _disconnectedAt > BACK_ONLINE_THRESHOLD_MS` (5 min), send a
notification message to the last active peer (tracked as `_lastActivePeer`).

```
"⚡ I'm back online. I was unreachable for ~X minutes."
```

Only fires once per reconnect. Uses `_lastActivePeer` which is updated on every
received message. If no peer has ever written, notification is skipped.

## L2 — Observability

### What to log

| Event | Level | Where |
|---|---|---|
| `send()` called while not connected | `warn` | pino → operational_logs |
| Reconnect attempt N, reason X | `info` | pino (already exists, keep) |
| `_connect()` rejected (timeout or close) | `warn` | pino → operational_logs |
| Socket stall detected (watchdog timeout) | `error` | pino → operational_logs + emitEvent |
| Reconnect succeeded after downtime > 5min | `info` | pino |
| "I'm back" sent | `info` | pino |

### DB event: `channel_stalled`

```typescript
emitEvent(getDb(), {
  type: 'channel_stalled',
  severity: 17,   // ERROR
  payload: { channelType: 'whatsapp', durationMs, attempt: this._reconnectAttempt }
})
```

Emitted when the reconnect loop has been running for more than 5 minutes without
success (checked at each retry iteration).

### send() drop logging

```typescript
async send(peerId: string, content: MessageContent): Promise<void> {
  if (!this._socket || this._status !== 'connected') {
    getLogger().warn({ component: 'whatsapp', peerId, status: this._status },
      '[WhatsApp] send() called while not connected — message dropped');
    return;
  }
  ...
}
```

## L3 — systemd Unit

### Change

`Restart=on-failure` → `Restart=always`

Add burst protection to prevent crash loops:
```
StartLimitIntervalSec=120
StartLimitBurst=5
```

This means: systemd will restart up to 5 times within 120 seconds. If it crashes
more than 5 times in 2 minutes, systemd gives up (prevents runaway crash loop).

### Why `Restart=always` over `Restart=on-failure`

A hung process that doesn't crash never triggers `on-failure`. The WhatsApp
stall scenario produces a process that exits 0 (or never exits at all). `always`
catches both clean exits and crashes.

Note: `always` does not restart on `systemctl stop` — that's handled by
`KillMode=control-group` which is the default.

### daemon.ts update

The `generateSystemdUnit()` function is updated to emit the new `Restart` and
`StartLimit*` values. Existing deployed units are updated when the user runs
`reeboot stop && reeboot start --daemon` (which rewrites the unit file).

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| "I'm back" fires on every normal 2-min reconnect | 5-min threshold filter |
| Reconnect loop runs forever on logged-out state | `loggedOut` path sets `_stopping=true`, exits loop immediately |
| Double "I'm back" if reconnect loop retries quickly | Guarded by `_backOnlineSent` flag, reset on next disconnect |
| `Restart=always` causes crash loop | `StartLimitBurst=5` within 120s |
| `_connect()` Promise leak if stop() called mid-connect | `_stopping` checked in Promise rejection handler; `sock.end()` called |

## What Is NOT Changed

- Reconnect frequency / backoff constants — normal WA Web behaviour
- `send()` return type (void) — silent drop is correct, just needs logging
- Baileys version — not pinned to a newer version in this request
- Signal or webchat channels
