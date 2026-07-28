# Spec — warn-only-log-persistence

DB log persistence reverts to warn+ (level ≥ 40) only. Info/debug are no longer written to
`operational_logs`; stdout, file, and SSE streams are unchanged. This reverses the info+ persistence
introduced by `web-api-readback`, keeping the DB small and the audit signal clean.

## S1 — warn logs are persisted to operational_logs (regression guard)
- **GIVEN** a logger initialised with a database handle via `createLogger({ level: 'debug' }, db)`
- **WHEN** `logger.warn({ component: 'test' }, 'test-warn')` is called and the stream flushes
- **THEN** `operational_logs` contains a row with `level = 40` and `msg = 'test-warn'`.

## S2 — error logs are persisted (regression guard)
- **GIVEN** a logger initialised with a database handle
- **WHEN** `logger.error({ component: 'test' }, 'test-error')` is called and the stream flushes
- **THEN** `operational_logs` contains a row with `level = 50` and `msg = 'test-error'`.

## S3 — info logs are NOT persisted
- **GIVEN** a logger initialised with a database handle
- **WHEN** `logger.info({ component: 'test' }, 'test-info')` is called and the stream flushes
- **THEN** no row with `msg = 'test-info'` exists in `operational_logs` (below the warn threshold).

## S4 — debug logs are NOT persisted
- **GIVEN** a logger initialised with a database handle
- **WHEN** `logger.debug('test-debug')` is called and the stream flushes
- **THEN** no row with `msg = 'test-debug'` exists in `operational_logs`.
