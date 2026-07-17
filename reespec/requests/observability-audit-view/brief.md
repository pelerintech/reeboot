# Brief — observability-audit-view

## Why

The observability page is meant to be **the operator's window into what the agent did over time** —
to audit past operations and understand *why* a task succeeded or failed. Its audience is the person
running the assistant (the owner in personal-assistant mode; the company operator in support mode),
not the end customer.

Today it does not serve that purpose, and the way it was wired makes the problem worse:

- The page reads **raw operational logs** (`operational_logs`), seeded via `GET /api/logs`. Raw log
  lines are low-signal for auditing agent behavior — they don't tell the operator what the agent *did*
  or why it failed.
- To make that view "substantive," `web-api-readback` lowered DB log persistence from warn+ to **info+**
  (`logger.ts:89`, `< 30`). This floods `operational_logs` with high-volume, low-relevance rows —
  unsustainable at scale (millions of rows in support fan-out) and it *obscures* the signal that matters.

Meanwhile the right substrate already exists and is well-built but unexposed: the **`events` table**
is a curated, typed audit trail (`turn_started`, `turn_completed`, `turn_failed` with reason payloads,
`budget_breached`/`budget_warning`, channel/capability/scheduler events), with OTEL-tiered severity
(9=INFO / 13=WARN / 17=ERROR / 21=FATAL), `context_id` + `trace_id`/`span_id` for correlating a whole
turn, and it is **already fanned to the same SSE live stream**. It is simply never queried over HTTP
nor shown in the UI. Emission is deliberate (~a dozen sites), so it is inherently far lower-volume and
higher-signal than log lines.

**The blind spot:** the audit view was pointed at the firehose (`operational_logs`) instead of the
audit trail (`events`), and DB persistence was widened to compensate. This request inverts that.

## What Changes

- The observability page becomes a **turn-grouped audit view** driven by the `events` table: events
  are grouped by turn (via `trace_id`/`context_id`) so the operator sees each task as one expandable
  unit — e.g. *"task X: started → 2 tool calls → failed because Y"* — instead of a flat log stream.
  This directly answers "what did the agent do, and why did it work or not."
- A curated **`GET /api/events`** read-back endpoint backs the view (filter by context, type, severity,
  time window; paginated), replacing `GET /api/logs` as the page's primary data source. Live SSE tail
  is preserved (audit events already flow to SSE).
- **DB log persistence reverts to warn+** (`operational_logs` no longer stores info); info/debug logs
  go to stdout + rotating file for deep debugging, keeping the DB small and the audit signal clean.
- **Event growth is deliberately bounded** — severity-tiered retention and/or a per-context row cap so
  the audit store cannot balloon to millions of irrelevant rows between retention sweeps.

## Goals

- Turn-rollup observability UI: group `events` by turn, show status (completed/failed/cancelled) and
  the failure reason from the `turn_failed` payload; expandable to the underlying operations
  (tool calls, budget/security events) in order. A secondary flat/filter mode is acceptable but not
  the primary lens.
- `GET /api/events` returning curated audit events (context, type, severity, time filters; limit/paging)
  mapped to a stable UI shape; the page seeds from it on mount and keeps the live SSE tail.
- Revert info-level DB persistence to warn+ (undo the `web-api-readback` change) without losing
  operator debuggability (logs still reach stdout/file).
- A bounded-growth policy for `events` (and `operational_logs`): severity-tiered retention and/or row
  cap, verified so the store cannot grow without limit under fan-out.
- Works for both deployments: owner audit in personal-assistant mode; company-operator audit in
  support mode (single-tenant — the operator may see across conversations; the page is not exposed to
  end customers).

## Non-Goals

- Not exposing the audit view to end customers / support chat users — it is an operator surface.
- Not per-tenant isolation (single-tenant per `decisions.md`; dedicated-DB-per-tenant is a future topology).
- Not full OTEL export / external tracing backends — reuse the existing `trace_id`/`span_id` locally
  only. External export can be its own follow-up.
- Not redesigning what events are emitted (emission sites are adequate for v1); if a specific missing
  event blocks the "why did it fail" story, add it narrowly, but broad event-taxonomy work is separate.
- Not removing `GET /api/logs` outright if it is still useful as a secondary raw-log peek — decide in design.
- Not the conversation-transcript read-back (that shipped in `web-api-readback`).

## Impact

- Files likely touched: `src/server.ts` (new `/api/events` endpoint; possibly retire/keep `/api/logs`),
  `src/observability/logger.ts` (revert `< 30` → `< 40`; confirm file/stdout sinks), `src/observability/
  retention.ts` (severity-tiered / capped pruning), the observability page + hook in
  `reeboot/webchat/src/pages/Logs.tsx` (or a renamed Activity/Audit page) and its data helper.
  Read-only against the existing `events` schema — no migration expected for the read path; retention
  changes are query-level.
- Reverses the `info-log-persistence` decision from `web-api-readback` (which was spec-satisfied but,
  in hindsight, the wrong substrate). Worth logging as a decision.
- Benefits both deployment use cases and gives support mode a sustainable audit story before fan-out.
- Open design decisions to resolve in `design.md`: (1) turn-grouping key and handling of events with no
  turn/trace correlation; (2) exact bounded-growth policy (tiered retention days per severity vs hard
  row cap vs both); (3) keep or retire `GET /api/logs`; (4) rename the page (Logs → Activity/Audit) or
  keep the name; (5) how ree (support) vs pi (owner) differ, if at all, in what the operator sees.
