# Brief — support-production-loop

## Problem

The `support-runtime` request ships a deliberately minimal agent loop: non-streaming, single provider call per turn, no multi-provider abstraction, no in-loop retry or rate-limit handling. That loop proves the `ExtensionAPI` abstraction and the multi-chat foundation, but it is **not production-ready**. At hundreds of concurrent customer chats, the gaps are:

- **No streaming.** Customers wait for the full response before seeing any text — unacceptable UX for support.
- **Single provider.** No fallback if the configured provider is down; no routing cheap turns to a cheaper model.
- **No in-loop retries.** The orchestrator handles rate-limit retries at the turn level, but transient failures inside the loop (a single tool call failing, a hiccup mid-turn) abort the whole turn.
- **No load validation.** The memory bounds (`maxHistoryPerChat`, `idleTtlMs`, `maxChats`) are unit-tested but never exercised at hundreds-of-chats concurrency. Leaks and contention only surface under load.

## Vision

A production-grade agent loop for the support runtime: streaming responses, multi-provider support with fallback, resilient in-loop error handling, and validated performance/-memory characteristics under concurrent load. The minimal loop from `support-runtime` becomes the reference implementation; this request hardens it.

## Goals

- Stream `text_delta` events to the channel as the LLM generates them (not on turn completion).
- Multi-provider support: configure a primary + fallback provider(s); route a failed call to the fallback automatically.
- In-loop resilience: a single tool-call failure does not abort the turn (configurable — fail-soft with an error result fed back to the LLM).
- Load testing: a harness that simulates N concurrent chats (N ≥ 100), measures per-chat memory, turn latency, and listener-leak detection over a sustained run.
- Memory validation: confirm `maxHistoryPerChat`, `idleTtlMs`, and `maxChats` hold under load — no unbounded growth.

## Non-Goals

- Not changing the `ExtensionAPI` interface or the `AgentRunner` interface.
- Not building support-specific tools or conversation UX (see `support-agent-product`).
- Not replacing the orchestrator's turn-level timeout/retry (it stays the outer safety net).
- Not solving DB divergence (see `support-db-abstraction`).

## What should be done first

1. **Streaming** — the highest-impact UX gap. Convert the single `fetch` + await into a streaming response that emits `text_delta` as chunks arrive. This alone makes the support agent feel responsive.
2. **Multi-provider fallback** — configure primary + fallback; on a 5xx/network failure, retry on the fallback before surfacing an error.
3. **In-loop fail-soft** — wrap each `tool.execute()` so a thrown error becomes a `tool_result` with `isError: true` and an error message, fed back to the LLM, instead of aborting the turn.
4. **Load harness** — a test script (not a unit test) that spawns N mock chats concurrently, runs M turns each, and reports memory/latency/leak metrics. Run it before declaring production-ready.

## What to account for

- **Streaming + cancellation.** Streaming responses must respect `AbortSignal` — aborting mid-stream must stop the HTTP read and not emit partial `text_delta` after abort.
- **Backpressure.** Hundreds of concurrent streams means hundreds of open HTTP connections; the runtime must bound concurrent LLM calls (a semaphore/queue) to avoid exhausting sockets.
- **Provider abstraction.** The fallback config must be declarative (config-driven, not code-driven) so deployments can swap providers without code changes.
- **Load test realism.** The mock LLM in the load harness must simulate streaming latency and tool-call round-trips — a zero-latency mock hides contention bugs.
- **Listener-leak detection.** The load harness must assert listener counts return to baseline after chats are disposed — this is the #1 correctness property from `support-runtime` and must hold under load, not just in unit tests.

## Scope

- Modified: `src/runtime/agent-loop.ts` — streaming, multi-provider, fail-soft.
- New: `src/runtime/provider-client.ts` — multi-provider LLM client with fallback config.
- New: `tests/runtime/load/` — load harness + fixtures (not part of the unit suite; run on demand).
- Tests: streaming event ordering, fallback on failure, fail-soft tool errors, load harness assertions.

## Impact

- Support chats stream responses to customers in real time.
- The runtime survives a provider outage via fallback.
- A single bad tool call no longer kills a customer's turn.
- Memory and latency characteristics are validated, not assumed, before production deployment.
