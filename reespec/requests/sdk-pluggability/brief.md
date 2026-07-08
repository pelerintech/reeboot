# Brief — sdk-pluggability

## Problem

Reeboot's extensions are tightly coupled to the pi SDK (`@earendil-works/pi-coding-agent`). All 17 bundled extensions import `ExtensionAPI` from pi, and the loader uses pi's `DefaultResourceLoader`. This makes reeboot a pi-specific deployment, not a flexible agent harness.

The original design intent was to build a lightweight, configurable agent with a strong but flexible foundation — one that could support different usage scenarios (personal agent, customer support, embedded assistants) by swapping the underlying SDK. This pluggability was lost over time as the pi SDK became the de facto dependency.

Without SDK pluggability:
- Customer support deployments must carry the full pi SDK overhead (extensions, session management, resource loading) even when unnecessary
- Alternative SDKs (lighter-weight, different capabilities) cannot be used
- Testing requires the pi SDK as a dependency
- The architecture is locked to one vendor's implementation

## Vision

Reeboot becomes an SDK-agnostic agent harness. Extensions depend on a clean `ExtensionAPI` interface defined by reeboot. Each SDK mode (pi, support, future) provides an adapter that implements this interface. The same 17 extensions work across all modes without duplication.

```
┌─────────────────────────────────────────────────────────────────┐
│  Reeboot Harness (orchestrator, channels, trust, observability) │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
              ┌──────────────────────────┐
              │  ExtensionAPI Interface   │  ← reeboot-defined, SDK-agnostic
              │  (typed events, tools,    │
              │   lifecycle hooks)        │
              └──────────────────────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
     │ PiAdapter    │ │ Support      │ │ Future       │
     │ (pi SDK)     │ │ Adapter      │ │ Adapter      │
     └──────────────┘ └──────────────┘ └──────────────┘
                            │
                            ▼
              ┌──────────────────────────┐
              │  17 Extensions            │  ← depend on interface only
              └──────────────────────────┘
```

## Goals

- Define `ExtensionAPI` interface in reeboot with typed events (`ExtensionEventMap`)
- Refactor all 17 bundled extensions to depend on reeboot's `ExtensionAPI`, not pi's
- Create `PiExtensionAdapter` that bridges pi SDK to reeboot's `ExtensionAPI`
- Update `loader.ts` to use the adapter pattern
- Preserve all existing extension behavior — no functional changes
- Enable future SDK adapters without modifying extensions

## Non-Goals

- Not building a new SDK (separate request)
- Not implementing `SupportExtensionAdapter` (separate request)
- Not building `SupportRunner` (see `service-bootstrap` for context)
- Not changing the `AgentRunner` interface (already clean and pluggable)
- Not removing pi as a dependency (pi still works via the adapter)
- Not changing extension functionality (behavior preserved exactly)

## Impact

- Extensions become testable without pi SDK (mock `ExtensionAPI` in tests)
- Future SDK modes can be added without touching extensions
- Clearer architecture: extensions document what they need via the interface
- No breaking changes for current pi-based deployments
- Smaller mental model: 17 extensions + 1 interface + N adapters

## Scope

- 1 new file: `reeboot/src/extensions/extension-api.ts`
- 17 extension files: replace pi imports with local imports
- 1 new file: `reeboot/src/extensions/pi-adapter.ts`
- 1 modified file: `reeboot/src/extensions/loader.ts`
- Tests: update existing tests to use the adapter, add adapter tests
