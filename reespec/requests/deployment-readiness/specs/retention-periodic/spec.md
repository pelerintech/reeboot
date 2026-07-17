# Spec — retention-periodic (WS-E3)

Observability retention runs periodically, not only once at boot.

## S1 — retention timer is armed at startup
- **GIVEN** a started server
- **WHEN** startup completes
- **THEN** a periodic timer is armed that calls `pruneObservabilityData` on its interval
  (interval overridable via `REEBOOT_RETENTION_INTERVAL_MS`).

## S2 — a second prune pass runs after boot
- **GIVEN** a tiny retention interval override and an over-age row inserted after startup
- **WHEN** the interval elapses (advance timers)
- **THEN** the over-age row is pruned (proving a pass ran after the boot-time call).

## S3 — timer is cleared on shutdown
- **GIVEN** the retention timer is armed
- **WHEN** `stopServer()` runs
- **THEN** the interval is cleared (no timer leak).
