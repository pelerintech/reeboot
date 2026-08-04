# Spec — dreem-provider

The `dreem` provider treats dreem as a memory **system** (own consolidation + retrieval),
not a store, delegating the memory experience to the backend and degrading at the provider
level only when a backend cannot honor an operation.

## S1 — dreem is a delegating system, not a passive store

- **GIVEN** the active provider is `dreem`
- **WHEN** `recall` is invoked
- **THEN** it delegates to dreem's retrieval (its cached→hot→deep query machinery /
  domain API) rather than a reeboot-side flat read.

## S2 — Core ops map to dreem knowledge operations

- **GIVEN** a `dreem` deployment is active
- **WHEN** `store`/`update`/`forget`/`clear`/`recall` are invoked
- **THEN** they map to dreem's knowledge writes/searches within the configured scope
  (`self`/`human` → a dreem type/namespace), returning and consuming opaque refs (concept
  path).

## S3 — dreem is self-consolidating; reeboot's consolidation job is skipped

- **GIVEN** dreem declares `selfConsolidating`
- **WHEN** reeboot's `__memory_consolidation__` job would run
- **THEN** reeboot skips its job — dreem's own Dream loop (autonomous, scheduled, guarded)
  owns consolidation.

## S4 — dreem hot-retrieval capability is declared

- **GIVEN** a configured dreem sidekick with its hot/cached query path enabled
- **WHEN** the capability registry is queried
- **THEN** dreem declares its hot/adaptive-retrieval capability; the agent loop does not
  run reeboot's own hot-memory for it.

## S5 — dreem-native capabilities surface via the uniform registry

- **GIVEN** dreem declares graph / health / tree / deeper search capabilities
- **WHEN** registered through the capability registry + trust gate
- **THEN** they appear as namespaced `memory::dreem::*` tools governed like first-party
  tools, using reeboot's view system for non-tool-schema surfaces.

## S6 — Unknown/unreachable backend degrades at the provider level

- **GIVEN** the dreem endpoint is unreachable or an operation can't be honored
- **WHEN** an operation is invoked
- **THEN** the provider degrades gracefully at the provider level (logged, surfaced result,
  no memory silently lost and no startup crash) — consistent with reeboot's graceful-
  degradation idiom.

## S7 — dreem config surface via discriminated union

- **GIVEN** `memory.provider = 'dreem'`
- **WHEN** configuration is parsed
- **THEN** a `memory` discriminated-union branch for `'dreem'` validates a typed
  `providerConfig` (`baseUrl` required; `apiKey`, `consolidationInterval`, `llm` optional),
  and the typed config is passed to the dreem provider factory — the full sidekick
  deployment mechanism is a separate follow-up, but the config contract is defined here.
