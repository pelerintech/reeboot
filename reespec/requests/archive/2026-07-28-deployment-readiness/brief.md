# Brief — deployment-readiness

## Why

Reeboot must be deployment-ready for **two first-class use cases** (both near-term):

1. **Personal assistant** (pi SDK) — one owner, via WhatsApp / Web / Signal. Mature path.
2. **Single-company support/triage agent** (ree SDK) — many mutually-private end-users via a
   client-embedded Web/API interface. Domain competence from the RAG corpus, not accumulated memory.

Deployment is single-tenant: **one process = one product** (see `decisions.md`, 2026-07-17). No
multi-tenancy now; if ever, it is dedicated-DB-per-tenant with a shared engine — no shared-DB
isolation code.

A structured evaluation (2026-07-17) surfaced a set of genuine bugs and unbuilt features that keep
the support (ree) path — and parts of the shared subsystems — from being production-ready. The ree
SDK, ironically, is the runtime built for the multi-user case yet is the one missing most of what
that case needs. This request covers those gaps — the **correctness, security, budget, and
subsystem-cleanup workstreams (A, C, D, E)**.

> **SCOPE NOTE — workstream B was split out.** The multi-user routing feature (dynamic per-customer
> conversation creation, ree-mode data isolation, the support-API contract) is now its own request,
> **`ree-multi-user-routing`**, planned in detail there. It is the largest piece and a genuine
> feature; the workstreams remaining here are bug fixes and cleanups. The `web-api-readback` UI/API
> read-back work is likewise tracked separately.

## What Changes

The ree/support path becomes safe and correct to deploy, and the shared subsystems lose their known
correctness and security defects. Concretely: ree chats survive abort/reset, meter tokens, honor
extension hooks, and surface tool errors; the agent enforces SSRF/injection defenses and token
budgets; and the catalogued subsystem bugs are fixed. (Per-customer isolation itself is delivered by
`ree-multi-user-routing`.)

## Goals (by workstream)

**A. ree correctness bugs (HIGH — ree unusable without these)**
- Fix the abort/reset wedge: `ReeChat.abortController` is `readonly` and never recreated, so after
  `/new` or an inactivity reset every subsequent prompt throws `AbortError`
  (`ree-chat.ts:104,291`, `ree-runner.ts:155`). Recreate the controller per prompt.
- Fix token/cost metering on ree: `token-meter` reads `usage` from the `agent_end` assistant message,
  but the ree loop emits no `usage` (`ree-agent-loop.ts:290`; `token-meter.ts:26,38`), so the `usage`
  table is never written and `BudgetGuard` cannot enforce anything on ree turns.
- Honor mutating extension hooks in ree (or explicitly document them as observe-only): return values
  from `before_agent_start`/`tool_call`/`tool_result`/`input` are discarded (`ree-chat.ts:181+`,
  `ree-adapter.ts:117`), so the capabilities system-prompt block is dropped (`ree-runner.ts:105`).
- Surface tool errors: `toTanStackTool` drops `isError`/`details` and the loop hardcodes
  `isError:false` (`ree-agent-loop.ts:64,248,256`), so failing tools look like successes.

**B. Multi-user routing + ree-mode data isolation — SPLIT OUT to `ree-multi-user-routing`.**
Dynamic per-customer conversation creation, the ree-mode `messages` write rule, `session_search`
gating, and the canonical support-API contract are planned in detail in that request. Not covered here.

**C. Security hardening (HIGH — internet-facing in support mode)**
- SSRF: fix DNS-rebinding/TOCTOU (guard resolves once, `fetch` re-resolves — `ssrf-guard.ts:103`
  vs `web-search.ts:87`) and the IPv6 blind spot / `0.0.0.0` gap (`ssrf-guard.ts:19-56`).
- Wire `trust-enforcer` and `injection-guard` into the ree extension subset (`loader.ts:291`); today
  ree has none of pi's per-tool trust/injection defenses. Reconsider the `'owner'` trust default
  (`trust.ts:51`, `policy.ts:92`).

**D. Budget correctness (MEDIUM)**
- Session limits currently reuse the daily `start of day` predicate (`guard.ts:110`) — make session
  scope process-session/turn-window. Evaluate hard breaches before returning early on a warning
  (`guard.ts:70`).

**E. Subsystem cleanups (MEDIUM/LOW)**
- Memory consolidation is dead code: the `__memory_consolidation__` sentinel is never intercepted
  (`memory-manager.ts:566`), so the scheduled job just runs as a vague LLM prompt. Either wire it or
  remove the machinery. (For ree/support, consolidation stays OFF by design.)
- Knowledge: file deletions never update the index (`watcher.ts:74`); watcher only queues and defers
  ingest to a chat prompt, losing pending files on restart.
- Observability retention runs only once at boot (`server.ts:154`) — add a periodic sweep.
- Scheduler `_inFlight` dedup set is dead code (`scheduler.ts:76`) — wire it or document the reliance
  on fire-and-forget.
- Resilience: user-cancelled (`AbortError`) turns are misclassified as crashes and may be re-queued
  on restart (`orchestrator.ts:421`).

## Non-Goals

- Not the web-UI / read-back API work — that is `web-api-readback`.
- Not multi-tenancy (dedicated-DB-per-tenant is a future deploy topology, not code).
- Not cross-customer memory/soul for support (that is intentionally disabled).
- Not profile-specific tooling (support tools, triage prompts) — separate profile requests on top.
- Not general scale/load testing beyond a defined concurrency bound (can be its own follow-up).

## Impact

- Touches ree runtime (`src/runtime/*`, `src/agent-runner/ree-*`, `src/extensions/ree-adapter.ts`),
  the orchestrator routing layer (`src/orchestrator.ts`, `src/server.ts`), security
  (`src/security/*`), budget (`src/budget/guard.ts`), and several subsystem files.
- Workstream A is a prerequisite for any real ree deployment (and for `ree-multi-user-routing`); C is
  required before exposing the support API to the internet.
- Sequencing here: **A → C → D → E**. The split-out `ree-multi-user-routing` feature depends on A
  (each chat must be individually sound before hosting many).
