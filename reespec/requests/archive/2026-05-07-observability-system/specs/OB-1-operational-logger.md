# OB-1: Operational Logger

Pino replaces all `console.*` calls. Every module gets a structured logger. Channels get a
real pino child logger. The DB gets a debug-level query wrapper.

---

## OB-1-A: Logger singleton

GIVEN `src/observability/logger.ts` is imported  
WHEN the module is first loaded  
THEN a pino logger is created at the configured `logging.level` (default `info`)  
AND the logger writes structured NDJSON to stdout  
AND a file transport writes `warn+` records to `~/.reeboot/logs/reeboot-YYYY-MM-DD.log`  
AND the logger is exported as the default export

---

## OB-1-B: console.* replaced across all src/ modules

GIVEN the production codebase is compiled  
WHEN any module in `src/` (orchestrator, server, scheduler, channels, extensions, resilience, etc.) emits a log  
THEN it calls `logger.info/warn/error/debug/fatal` — not `console.log/warn/error`  
AND the log record includes at minimum: `{ level, msg, component, time }`  
AND no `console.*` call (other than wizard/CLI user-facing output) remains in `src/`

---

## OB-1-C: Channel child loggers

GIVEN the WhatsApp adapter is initialised  
WHEN Baileys internally emits a log record  
THEN it goes through a real pino child logger (`logger.child({ component: 'whatsapp' })`)  
AND not the existing no-op object  
AND the same applies to Signal adapter (`component: 'signal'`)

---

## OB-1-D: DB debug wrapper

GIVEN the DB wrapper is used to prepare and run statements  
WHEN any `prepare()` + `run()` / `get()` / `all()` call is made  
THEN a debug-level log record is emitted with `{ sql, params, durationMs }`  
AND at error level if the statement throws  
AND the wrapper is a thin pass-through — it does not alter query results

---

## OB-1-E: Operational log retention

GIVEN `logging.retention_days` is configured (default 30)  
WHEN the server starts  
THEN log files older than `retention_days` days are deleted from `~/.reeboot/logs/`  
AND `operational_logs` rows older than `retention_days` days are deleted from SQLite  
AND the operation is idempotent (safe to run multiple times on the same day)
