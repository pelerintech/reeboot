# Spec — Security, Observability, Deployment Pages

## Capability: security/sandbox.md

GIVEN `docs/security/sandbox.md`
WHEN a user reads it
THEN it explains:
  - What the sandbox does: wraps bash tool execution in OS-level confinement
  - `sandbox.mode`: `"os"` (sandbox-exec on macOS, bwrap on Linux) vs `"docker"`
  - How to disable: `extensions.core.sandbox: false`
  - What is and isn't sandboxed
  - Config reference for `sandbox.*` fields

## Capability: security/injection-guard.md

GIVEN `docs/security/injection-guard.md`
WHEN a user reads it
THEN it explains:
  - What prompt injection guard does: flags untrusted content from external sources
  - `security.injection_guard.enabled` (default true)
  - `security.injection_guard.external_source_tools` — which tools are considered
    external (default: fetch_url, web_fetch)
  - How trust level interacts with injection guard behaviour
  - Config reference for `security.injection_guard.*` fields

## Capability: security/permission-tiers.md

GIVEN `docs/security/permission-tiers.md`
WHEN a user reads it
THEN it explains:
  - Channel trust tiers: `"owner"` vs `"end-user"`
  - What each trust level permits (tool access, prompt injection, etc.)
  - `permissions.violations.log` — whether violations are logged
  - How to configure per-channel trust
  - Config reference for `permissions.*` and channel `trust` fields

## Capability: observability/logging.md

GIVEN `docs/observability/logging.md`
WHEN a user reads it
THEN it explains:
  - Pino as the structured logger (stdout NDJSON + file at ~/.reeboot/logs/)
  - `logging.level` options (trace/debug/info/warn/error/fatal, default info)
  - `reeboot logs` CLI command with `--follow` and `--level` flags
  - SSE live log stream endpoint
  - `logging.retention_days` (default 30)
  - `logging.rate_limit_warn_threshold` field
  - Config reference for all `logging.*` fields

## Capability: observability/events.md

GIVEN `docs/observability/events.md`
WHEN a user reads it
THEN it explains:
  - What the events table captures (audit events: channel connect/disconnect,
    turn journal open/close, rate limits, etc.)
  - OTEL-ready schema: trace_id, span_id, created_ns, severity
  - Turn journal as permanent audit record (closed rows retained, not deleted)
  - `operational_logs` table for warn+ log records
  - Retention and pruning behaviour

## Capability: deployment/resilience.md

GIVEN `docs/deployment/resilience.md`
WHEN a user reads it
THEN it explains:
  - Crash recovery: open turn journal rows detected on restart, requeued
  - `resilience.recovery.mode`: `"safe_only"` | `"always"` | `"never"`
  - `resilience.recovery.side_effect_tools` — tools considered unsafe to replay
  - Outage detection: consecutive provider failures → outage declared
  - `resilience.outage_threshold` (default 3) and `resilience.probe_interval`
  - Scheduler catchup: missed tasks replayed within catchup window
  - `resilience.scheduler.catchup_window` (default "1h")
  - Restart notification (DB marker, not session file presence)
  - Config reference for all `resilience.*` fields

## Capability: extending/channel-adapters.md mirrors CHANNEL_CONTRACT.md

GIVEN `docs/extending/channel-adapters.md`
WHEN a developer reads it
THEN it contains:
  - The full Tier 1 / Tier 2 classification table and description
  - All Tier 1 contract clauses (inbound, outbound, lifecycle, policy must-nots)
  - All Tier 2 contract clauses
  - Mode 1 vs Mode 2 owner identity explanation
  - Contract test suite table and how to use it
  - A note that `reeboot/src/channels/CHANNEL_CONTRACT.md` is the canonical
    source and this page mirrors it

WHEN compared against `reeboot/src/channels/CHANNEL_CONTRACT.md`
THEN all contract clauses present in the source file are present in the docs page
