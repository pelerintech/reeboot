# Design: Observability System

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│  reeboot process                                                         │
│                                                                         │
│  All modules → logger (pino)                                            │
│                    │                                                     │
│        ┌───────────┼───────────────┐                                    │
│        ▼           ▼               ▼                                    │
│   stdout/stderr  file (warn+)   SSE emitter ──────────────────┐         │
│   (structured    ~/.reeboot/    (EventEmitter)                 │         │
│    NDJSON)       logs/*.log     │                              │         │
│                  30-day prune   ▼                              │         │
│                               /api/logs/stream (Hono SSE) ────┼──► browser
│                                                               │         │
│  Orchestrator ──► EventBus ──► events table (SQLite)          │         │
│  Scheduler                      session_events table          │         │
│  Channels                       rate_limits table             │         │
│                                 operational_logs table        │         │
│  pi extension ──────────────► turn_journal (permanent)        │         │
│    after_provider_response                                     │         │
│    session_shutdown                                            │         │
└────────────────────────────────────────────────────────────────┘         │
                                                                           │
CLI: reeboot logs --follow ──────────────────────────────────────────────► terminal
```

## Decision: Pino as the Operational Logger

Pino is already in the dependency tree via `@whiskeysockets/baileys`. WhatsApp currently
passes a no-op logger to silence it. We adopt pino as the single operational logger:

- One pino instance created at startup, exported from `src/observability/logger.ts`
- All modules import the logger; `console.*` calls are replaced
- Channels receive a pino child logger (`logger.child({ component: 'whatsapp' })`)
- Pino transports: stdout (all levels, structured NDJSON) + file (warn+, ~/.reeboot/logs/)
- An additional in-process EventEmitter transport feeds the SSE endpoint

Configuration in `config.json → logging`:
```json
{
  "logging": {
    "level": "info",
    "retention_days": 30
  }
}
```

## Decision: Two Separate Tables for Audit vs Operational

**Operational logs** (`operational_logs` table) store pino records at `warn` and above. High
volume, short-lived (30-day retention), structure mirrors pino's log record.

**Audit events** (`events` table) store domain-level business events: turn started, tool
called, scheduler fired, channel connected, swallowed error, outage declared. Low volume,
retained permanently (these are the audit trail). Structure is OTEL-ready.

Keeping them separate avoids the "audit drowned in debug noise" problem and lets retention
rules differ.

## Decision: Turn Journal Promoted to Permanent

`TurnJournal.closeTurn()` currently `DELETE`s the row on success. We change it to:
```sql
UPDATE turn_journal SET status = 'closed', closed_at = datetime('now') WHERE turn_id = ?
```

Open rows remain crash evidence (existing resilience logic unchanged). Closed rows become
the permanent turn audit trail. A `pruneTurns(db, retentionDays)` function runs at startup
to clean old closed rows (default: same 30-day window as operational logs, but configurable
separately).

The `getOpenJournals()` function already filters by `status = 'open'` — no change needed.

## Decision: New Tables for Observability

```sql
-- Domain events (audit, OTEL-ready)
CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,          -- 'turn_started' | 'tool_called' | 'scheduler_fired' ...
  context_id  TEXT,
  channel     TEXT,
  peer_id     TEXT,
  severity    INTEGER NOT NULL DEFAULT 9,  -- OTEL severity numbers (9=INFO, 13=WARN, 17=ERROR)
  payload     TEXT NOT NULL DEFAULT '{}',  -- JSON
  trace_id    TEXT,                   -- OTEL: 16-byte hex
  span_id     TEXT,                   -- OTEL: 8-byte hex
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  created_ns  INTEGER                 -- nanoseconds epoch for OTEL precision
);

-- Session lifecycle (shutdown reason + crash linkage)
CREATE TABLE IF NOT EXISTS session_events (
  id             TEXT PRIMARY KEY,
  context_id     TEXT NOT NULL,
  reason         TEXT NOT NULL,       -- 'quit' | 'reload' | 'new' | 'resume' | 'fork' | 'crash'
  session_path   TEXT,
  linked_turn_id TEXT,               -- FK to turn_journal if turn was open at shutdown
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Rate limit headroom per LLM call
CREATE TABLE IF NOT EXISTS rate_limits (
  id                  TEXT PRIMARY KEY,
  context_id          TEXT NOT NULL,
  provider            TEXT NOT NULL,
  remaining_tokens    INTEGER,
  remaining_requests  INTEGER,
  retry_after_ms      INTEGER,        -- parsed from retry-after header
  recorded_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Persisted operational logs (warn+ only)
CREATE TABLE IF NOT EXISTS operational_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  level       INTEGER NOT NULL,       -- pino level number (30=info, 40=warn, 50=error, 60=fatal)
  msg         TEXT NOT NULL,
  component   TEXT,
  context_id  TEXT,
  payload     TEXT,                   -- JSON extras
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

`turn_journal` also gets a `closed_at` column via migration.

## Decision: OTEL-Ready Event Schema

Every audit event includes:
- `trace_id` — 32-char hex (16 bytes) following OTEL W3C Trace Context format
- `span_id` — 16-char hex (8 bytes)
- `created_ns` — Unix epoch in nanoseconds (OTEL requires nanosecond precision)
- `severity` — OTEL severity number (9=INFO, 13=WARN, 17=ERROR, 21=FATAL)

When the OTEL exporter is added (next request), it reads these fields directly and maps to
`LogRecord` without schema migration. Traces and spans are correlated by propagating the
same `trace_id` across all events within a single agent turn.

## Decision: SSE Not WebSocket for Log Streaming

The existing `/ws/chat/:contextId` WebSocket is for bidirectional chat. The log stream is
unidirectional (server → browser only). SSE is the right primitive: simpler, HTTP/1.1
compatible, auto-reconnects via browser `EventSource`, and Hono provides `streamSSE` out of
the box.

Endpoint: `GET /api/logs/stream?level=debug` (level filter optional, defaults to `info`).
Events are NDJSON lines: `data: {"level":30,"msg":"...","component":"orchestrator",...}\n\n`

The SSE emitter is an in-process `EventEmitter` (`src/observability/sse-emitter.ts`).
The pino transport and the audit emitEvent function both call `sseEmitter.emit('log', record)`.
The Hono SSE handler subscribes to the emitter and writes to the response stream.

## Decision: Observability Bundled Extension

`after_provider_response` and `session_shutdown` hooks must run inside the pi extension
context. A new bundled extension `src/extensions/observability.ts` registers both hooks and
receives the DB reference as a second argument (same pattern as memory-manager, mcp-manager).

The extension is always loaded (no feature flag) — observability is on by default.

## Decision: Scheduler Throttle on Rate Limit

Before dispatching a scheduled task, the scheduler checks the `rate_limits` table for the
most recent entry. If `retry_after_ms` is set and `recorded_at + retry_after_ms > now`, the
task is skipped (next scheduled run will retry). A log event at `warn` is emitted.

This is conservative: only hard `retry-after` headers trigger skipping. Low-headroom
warnings (e.g. remaining_tokens < 10% of typical) are surfaced in the dashboard but do not
block the scheduler in v1 (that logic belongs in token-budget request).

## Decision: reeboot logs --follow Uses SSE

`reeboot logs --follow` connects to `GET /api/logs/stream` and pretty-prints NDJSON to
stdout using pino's `pino-pretty` formatter (already available since pino is in the tree).
If the server is not running, it falls back to tailing the most recent log file in
`~/.reeboot/logs/`.

## Webchat Observability Tab

The webchat gains a new "Logs" tab (alongside the existing chat interface) with:
- Level filter dropdown (debug / info / warn / error / fatal)
- Auto-scrolling NDJSON stream rendered as colored rows
- Pause / resume button
- An error badge on the tab itself that counts unseen error/fatal events — visible
  regardless of which tab is active

Implementation: plain EventSource API + vanilla JS table — no new framework dependency.
The badge resets when the Logs tab is focused.

## Risk: Pino in a Long-Running Process

Pino uses sync `fs.writeSync` for file transport in some modes. For a long-running server,
the async `pino/file` transport (which runs in a worker thread) avoids blocking the event
loop. We use `pino.transport({ target: 'pino/file', ... })` for the file sink.

## Risk: DB Write Volume for Operational Logs

Only `warn` and above are persisted. In a healthy deployment, operational logs at `warn+`
should be rare. The 30-day retention window plus the level filter keeps the table bounded.
An index on `created_at` ensures fast range-delete for the pruning job.
