# Brief: Observability System

## Problem

Reeboot has no structured observability. Across the codebase:

- ~100 `console.*` calls scattered across 25+ files with no routing through the configured
  log level, no structure, and no sink other than stdout
- WhatsApp and Signal channels silence their internal `pino` logger entirely (no-op object),
  discarding real errors from Baileys and signal-cli
- The `turn_journal` is ephemeral — it records tool calls while a turn runs, then deletes
  itself on success. There is no permanent record of what the agent successfully did
- Scheduler fires, retries, routing decisions, channel connect/disconnect, swallowed errors
  (heartbeat timeouts, disk warnings, rate-limit replies that are silently dropped) leave no
  trace
- Session shutdown reasons are not captured — it is impossible to distinguish a clean quit
  from a crash mid-turn without manually inspecting pi session files
- Rate limit headroom from provider HTTP headers is never read — the agent can hit a 429
  with no warning and no automatic back-off beyond the existing retry logic
- There is no real-time view of what the agent is doing: no live log stream, no dashboard,
  no way for a browser user to see what is happening

## What We Need

**Two complementary streams:**

**Stream 1 — Audit** records what the agent *decided and did*: every turn (open + steps +
outcome), scheduler firings, routing decisions, channel events, swallowed errors, outage
declarations. The existing `turn_journal` is the right shape for this — it just needs to
stop self-destructing on success and be joined by a broader `events` table.

**Stream 2 — Operational** records what the *system is doing*: structured log lines emitted
by every module via a single pino logger that replaces all `console.*` calls. Channels get a
real pino logger. The DB gets a debug-level query wrapper. `warn` and above are persisted;
all levels stream live.

Both streams fan out to:
- A Hono SSE endpoint (`/api/logs/stream`) so the browser can subscribe
- A `reeboot logs --follow` CLI command for terminal users

**Webchat observability tab** — a new tab in the web interface showing the live log stream
with filtering, plus an error/fatal badge visible from any tab so serious failures cannot be
missed.

**Rate limit headroom** — a new bundled extension hooks into pi's `after_provider_response`
event to capture `x-ratelimit-remaining-tokens` and `retry-after` headers per turn. The
scheduler reads the latest entry before dispatching tasks and throttles when headroom is
critically low. The dashboard surfaces current headroom.

**Session lifecycle events** — pi's `session_shutdown` event (reason: quit / reload / new /
resume / fork) is captured to a `session_events` table. If a turn_journal row was open at
the time of shutdown, it is linked — giving exact root-cause evidence: session died while
tool X was running.

**OTEL readiness** — the event schema is designed to map cleanly to OTLP: `trace_id`,
`span_id`, nanosecond timestamps, OTEL severity numbers. No OTEL SDK is added in this
request; an exporter adapter is the next request.

## Non-Goals

- OpenTelemetry SDK integration (next request — `observability-otel`)
- Analytics streaming to PostHog / Datadog / webhooks (next request — `analytics-streaming`)
- Token budget enforcement and spend guards (separate request — `token-budget`)
- Drizzle Studio or any embedded DB viewer (dropped — cloud-hosted, privacy concern)
- Building a full log management UI; the SSE stream + tab is sufficient for v1

## Impact

- Every failure becomes observable — no more silent drops or lost crash evidence
- Rate limit 429s are prevented proactively rather than discovered reactively
- Session crashes are linkable to the exact tool call in flight at the time
- The foundation for OTEL forwarding, analytics streaming, and budget enforcement is in place
- Developers and agent owners share the same real-time window into agent behaviour
