---
title: "Events and Audit Trail"
description: "Structured audit events, the turn journal, and the OTEL-ready events table in reeboot.db."
---

# Events and Audit Trail

Reeboot maintains a structured audit trail in SQLite. Every significant operational event — channel connections, agent turns, rate limits, permission violations — is recorded in the `events` table.

---

## Events Table

The `events` table uses an OTEL-ready schema:

| Column | Type | Description |
|---|---|---|
| `id` | integer | Auto-increment primary key |
| `type` | text | Event type (e.g. `channel_connected`, `turn_started`, `rate_limit_warning`) |
| `payload` | text | JSON payload with event-specific data |
| `severity` | integer | OTEL severity number: 9=INFO, 13=WARN, 17=ERROR, 21=FATAL |
| `trace_id` | text | 32-char hex (16 bytes) — maps to OTEL `LogRecord.traceId` |
| `span_id` | text | 16-char hex (8 bytes) — maps to OTEL `LogRecord.spanId` |
| `created_ns` | integer | Unix epoch in nanoseconds — maps to OTEL `LogRecord.timeUnixNano` |
| `created_at` | text | UTC datetime string (human-readable) |

These fields map directly to OTEL `LogRecord` fields. When an OTEL exporter is added in a future release, no schema migration will be required.

---

## Event Types

| Event | When it fires |
|---|---|
| `channel_connected` | A channel adapter successfully connects |
| `channel_disconnected` | A channel adapter disconnects or errors |
| `turn_started` | An agent turn begins |
| `turn_closed` | An agent turn completes successfully |
| `turn_crashed` | An agent turn crashes or times out |
| `rate_limit_warning` | Token budget warning threshold reached |
| `rate_limit_hit` | Token budget limit reached |
| `permission_violation` | A tool call was denied or injection detected |
| `memory_consolidated` | Background memory consolidation completed |

---

## Turn Journal

The `turn_journal` table records every agent turn as a persistent audit record:

| Column | Description |
|---|---|
| `id` | Turn ID |
| `context_id` | Which context this turn ran in |
| `status` | `"open"` (in progress) or `"closed"` (completed) |
| `opened_at` | When the turn started |
| `closed_at` | When the turn completed (null if still open) |

Turns are **never deleted** — `closeTurn()` sets `status = 'closed'` and `closed_at`. Open rows after a restart indicate crashed turns and trigger crash recovery.

Records are pruned after `logging.retention_days` days (default: 30).

---

## Operational Logs Table

The `operational_logs` table stores warn-level and above log records from pino, providing a queryable complement to the log files:

| Column | Description |
|---|---|
| `id` | Auto-increment |
| `level` | Pino level number (40=warn, 50=error, 60=fatal) |
| `msg` | Log message |
| `component` | Source component (e.g. `"whatsapp"`, `"orchestrator"`) |
| `payload` | Full JSON log record |
| `created_at` | UTC datetime |

---

## Retention and Pruning

All three tables (`events`, `turn_journal`, `operational_logs`) are pruned on startup based on `logging.retention_days`:

```json
{
  "logging": { "retention_days": 30 }
}
```

→ See [Logging](./logging.md) for log level configuration and the CLI log commands.
