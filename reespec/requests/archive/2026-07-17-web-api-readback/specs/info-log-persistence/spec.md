# Spec — info-log-persistence

The DB log stream persists `info` (30) and above to `operational_logs`, so the logs history is
substantive (previously warn+ only). stdout/file streams are unchanged.

## S1 — info logs are persisted to operational_logs
- **GIVEN** a logger initialised with a database handle via `initLogger({ level: 'info' }, db)`
- **WHEN** `getLogger().info({ component: 'test' }, 'hello info')` is called and the async stream flushes
- **THEN** `operational_logs` contains a row with `level = 30` and `msg = 'hello info'`.

## S2 — debug logs are still NOT persisted
- **GIVEN** a logger initialised with a database handle
- **WHEN** `getLogger().debug('noisy debug')` is called and the stream flushes
- **THEN** no row with `msg = 'noisy debug'` exists in `operational_logs` (below the info threshold).

## S3 — warn and above still persisted (regression guard)
- **GIVEN** a logger initialised with a database handle
- **WHEN** `getLogger().warn('careful')` is called and the stream flushes
- **THEN** `operational_logs` contains a row with `level = 40` and `msg = 'careful'`.
