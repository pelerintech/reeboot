---
title: "Logging"
description: "Structured logs via pino, the reeboot logs CLI command, and the live SSE log stream."
---

# Logging

Reeboot uses [pino](https://getpino.io) for structured logging. All log records are emitted as NDJSON (newline-delimited JSON) to stdout and written to a file at `~/.reeboot/logs/`.

---

## Log Levels

| Level | Value | When to use |
|---|---|---|
| `trace` | 10 | Very verbose — internal tracing |
| `debug` | 20 | Debugging information |
| `info` | 30 | Normal operational events (default) |
| `warn` | 40 | Warnings and recoverable errors |
| `error` | 50 | Errors that affect functionality |
| `fatal` | 60 | Fatal errors — process will exit |

Configure the minimum level:

```json
{
  "logging": { "level": "info" }
}
```

Channel adapters (WhatsApp, Signal) use `warn` level for their child loggers to suppress protocol-level noise while surfacing real errors.

---

## Viewing Logs

### Tail the log file

```bash
reeboot logs
```

### Live stream (SSE)

```bash
reeboot logs --follow
```

This connects to the SSE endpoint at `http://localhost:3000/api/logs/stream` and streams log records in real time. If the server is not running, it falls back to tailing the log file.

### Filter by level

```bash
reeboot logs --follow --level warn
```

Only records at `warn` level or above are shown.

### Direct SSE access

```bash
curl -N "http://localhost:3000/api/logs/stream?level=info"
```

---

## Log File Location

```
~/.reeboot/logs/reeboot.log       ← combined log
~/.reeboot/logs/reeboot-error.log ← error-level and above (daemon mode)
```

---

## Operational Logs Table

Warn-level and above log records are also written to the `operational_logs` table in `reeboot.db`. This provides a queryable audit trail of significant events without parsing log files.

Records are pruned after `logging.retention_days` days (default: 30).

---

## Configuration Reference

| Field | Type | Default | Description |
|---|---|---|---|
| `logging.level` | string | `"info"` | Minimum log level: `"trace"`, `"debug"`, `"info"`, `"warn"`, `"error"`, `"fatal"`. |
| `logging.rate_limit_warn_threshold` | number | `5000` | Remaining tokens below which a `rate_limit_warning` event is emitted to the events table. |
| `logging.retention_days` | number | `30` | Days to retain records in `operational_logs` and `turn_journal` before pruning. |

→ See [Events](./events.md) for the structured audit event table.
