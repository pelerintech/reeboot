# Brief — support-runtime

## Problem

Reeboot is being deployed as a customer support agent. That deployment model is fundamentally different from the current one: **hundreds of concurrent chats**, most of which are short-lived and do not need coding tools. Pi was built to run one heavy, fully-capable coding session per process — spawning a full pi process per support chat is too expensive to start and run at that scale.

The `sdk-pluggability` request decoupled extensions from pi: all 17 bundled extensions now depend on reeboot's `ExtensionAPI`, and `PiExtensionAdapter` bridges pi to it. That was necessary but **not sufficient**. It decouples extensions from pi's *extension API*; it does not provide a lightweight *runtime* that hosts many chats in one process. Without that runtime:

- Every support chat pays full pi process startup cost (memory, init time, agent lifecycle).
- Listener leaks accumulate (pi's `on()` returns `void` with no unsubscribe — the pi adapter returns a documented no-op). At hundreds-of-chats scale with constant churn, no-op unsubscribe means memory death.
- Tool cancellation cannot be honoured cleanly across many chats (pi's `execute` semantics are single-session oriented).
- The `ExtensionAPI` abstraction is **unproven**: it has exactly one implementer (`PiExtensionAdapter`). Pass-through transforms, ctx mapping, and the unsubscribe contract are assumptions, not validated facts. A second adapter is what forces them to become real.

## Vision

A lightweight **multi-chat runtime** that hosts N concurrent support chats in a single process, backed by a new `SupportExtensionAdapter` that implements reeboot's `ExtensionAPI`. The same extensions run on both modes — pi for coding/owner sessions, the support runtime for customer-facing chats — without extensions knowing which SDK is active.

```
┌─────────────────────────────────────────────────────────────┐
│ Support Runtime (one process, many chats)                   │
│  ┌────────┐ ┌────────┐ ┌────────┐  ← in-memory chat state,   │
│  │ chat 1 │ │ chat 2 │ │ chat N │     isolated per chat       │
│  └───┬────┘ └───┬────┘ └───┬────┘                             │
│      └──────────┴──────────┘                                  │
│                 │                                             │
│      ┌──────────▼──────────┐                                  │
│      │ SupportExtensionAdapter │  ← implements ExtensionAPI   │
│      │  (real unsubscribe,     │     against runtime events    │
│      │   signal-based cancel)  │                              │
│      └──────────┬──────────┘                                  │
└─────────────────┼─────────────────────────────────────────────┘
                  ▼
        ┌──────────────────┐
        │ Support-relevant  │  ← observability, session-name,
        │ extension subset  │     token-meter, capabilities,
        └──────────────────┘     memory-manager (optional)
```

## What should be done first

1. **Build a `SupportExtensionAdapter` stub early** — even before the runtime is complete — against the runtime's event emitter. This is the highest-leverage step: an abstraction with one implementer is not an abstraction. Writing adapter #2 is what surfaces the real interface gaps (pass-through transforms that are actually pi-shaped, ctx fields that don't exist in a support context, the unsubscribe contract that pi can't honour). Get those gaps cheaply now, not at production load.

2. **Wire up a small support-relevant subset of extensions through adapter #2** — `observability`, `session-name`, `token-meter`, and `capabilities`. These four are obviously support-relevant and exercise the core event surface (`session_shutdown`, `after_provider_response`, `agent_end`, `before_agent_start`). Getting them to run on a second adapter proves the abstraction holds and forces the `transformEvent` pass-throughs to either stay identical or become real transformations.

3. **Implement real listener removal in the support adapter.** The pi adapter's no-op unsubscribe is a documented pi limitation; the support adapter MUST NOT inherit it. Every `on()` call returns a real unsubscribe; chat teardown calls every registered unsubscribe. This is non-negotiable at scale.

4. **Define the multi-chat process model** — concurrency, isolation, and lifecycle. This is the runtime design question, separate from the extension interface.

## What we need to account for (multi-chat / process support)

- **Concurrency model.** One process hosts many chats; no per-chat process spawn. Each chat has isolated in-memory state. Memory-per-chat must be bounded and predictable — no heavy SDK init per chat.

- **Listener lifecycle.** Chats churn constantly. Every `on()` MUST have a real unsubscribe; chat teardown MUST clean up all listeners. Leaks × hundreds-of-chats × churn = memory death. This is the single most important correctness property for the support runtime.

- **Cancellation.** `ToolDefinition.execute`'s `signal` parameter is load-bearing here — chat timeouts, customer disconnects, and agent aborts must propagate to in-flight tools. The support runtime must thread `AbortSignal` through every tool execution and cancel cleanly on teardown.

- **No coding tools by default.** Support chats do not need `bash`, `read`, `edit`, `grep`, `find`, `ls`. Their tool set is different (`lookup-order`, `escalate`, `fetch-knowledge`, etc.). The interface must not assume coding tools exist; capabilities injection must work with whatever subset the runtime registers.

- **Database divergence.** Support likely uses Postgres or a managed store, not `better-sqlite3`. `ExtensionContext.db` is typed `any` precisely so extensions are not locked to one library. This request should define what DB access the support subset actually needs (likely just `session_events` / `rate_limits` writes from observability) and decide whether a minimal reeboot-owned `ExtensionDB` interface is needed now or can stay `any`.

- **Session model divergence.** A support "session" ≠ pi's coding session. Support sessions are short-lived and high-churn. `session_shutdown` fires frequently; `reason` values matter (`quit`, `new`, `resume`, etc.). The runtime must emit reeboot-defined events (`session_shutdown`, `turn_end`, etc.) in reeboot's own shapes — not forward pi-shaped payloads.

- **Headless / no UI.** Support runs headless/RPC. `hasUI` is always `false`. Extensions must degrade gracefully (already required by the interface). No interactive `select`/`confirm` prompts can block.

- **Prove the abstraction.** The second adapter is the real test of the `ExtensionAPI` interface. Wherever `SupportExtensionAdapter` can just cast/forward unchanged, the abstraction is genuine; wherever it must transform, that's the seam between pi's shapes and reeboot's shapes. Document both. Anything that requires the support adapter to reach into pi internals is a sign the abstraction leaked.

## Goals

- A multi-chat runtime that hosts N concurrent support chats in one process with isolated per-chat state.
- A `SupportExtensionAdapter` implementing reeboot's `ExtensionAPI` against the runtime's event emitter, with **real listener removal** and **real signal-based cancellation**.
- A support-relevant subset of the existing extensions (`observability`, `session-name`, `token-meter`, `capabilities`) running unchanged on the second adapter — proving the abstraction holds across two SDKs.
- The runtime emits reeboot-defined event shapes (not pi-shaped payloads) for all events it surfaces.
- Clear documentation of where the abstraction is genuine (pass-through) vs. where it transforms (the seam), validated against two adapters.
- Bounded, predictable memory per chat; no per-chat process spawn.

## Non-Goals

- Not rebuilding pi — pi remains the SDK for coding/owner sessions.
- Not porting all 17 extensions to support — only the support-relevant subset runs in support mode.
- Not building the full support agent logic, conversation UX, or channel integrations — separate requests.
- Not changing the `AgentRunner` interface unless the runtime forces it (then a separate request).
- Not removing pi as a dependency — `sdk-pluggability` already handles coexistence via the adapter pattern.
- Not implementing the full support tool set (`lookup-order`, `escalate`, etc.) — only the runtime + adapter + extension subset needed to validate the abstraction.

## Scope

- 1 new file: `reeboot/src/extensions/support-adapter.ts` — `SupportExtensionAdapter` implementing `ExtensionAPI`
- 1 new package/area: `reeboot/src/runtime/` (or similar) — the multi-chat runtime host
- New tests: adapter tests (real unsubscribe, real cancellation), runtime concurrency/isolation tests
- Extension files: **no changes** — the subset runs unchanged through the second adapter (if an extension must change, that's evidence the abstraction leaked and must be fixed in the interface, not the extension)

## Impact

- The `ExtensionAPI` abstraction is validated by a second implementer — pass-through vs. transform seams become explicit.
- Customer support deployments can run hundreds of chats per process without paying pi's per-session cost.
- Listener leaks are eliminated at scale (real unsubscribe enforced).
- Tool cancellation is honoured across many chats (signal threaded through).
- Future SDKs (beyond support) have a proven pattern to follow and a real second adapter to copy from.
