# Spec — memory-manager

`MemoryManager` selects exactly one active provider, defaults to `builtin`, falls back with
a logged warning, hosts the capability registry, and applies the uniform trust gate.

## S1 — Default backend is builtin; existing tool/injection behaviour preserved

- **GIVEN** `memory.provider` is unset (default)
- **WHEN** the manager resolves the active provider
- **THEN** the active provider is `builtin`, and the `memory` tool routes through it and
  the `before_agent_start` grounding injection continues to work unchanged.

## S2 — Configured provider is selected

- **GIVEN** `memory.provider = 'dreem'` (or a future provider) is configured
- **WHEN** the manager resolves the active provider
- **THEN** the active provider is the configured one, and `memory` tool + grounding +
  core ops route through it, not builtin.

## S3 — Known-but-unloadable provider falls back to builtin with a warning

- **GIVEN** `memory.provider` names a provider that is unknown or fails to load
- **WHEN** the manager resolves the provider
- **THEN** it falls back to `builtin` with a logged warning — never disables memory
  silently, never crashes startup (graceful degradation).

## S4 — Exactly one backend is active at a time

- **GIVEN** a configured provider is active
- **WHEN** memory operations occur
- **THEN** operations go only through that one active provider; no builtin/dreem/mem0
  composition occurs.

## S5 — Manager routes exclusively via the provider contract

- **GIVEN** an active provider
- **WHEN** the manager dispatches a core operation
- **THEN** it passes only opaque refs and scope tokens to the provider — never transforms
  results, never inspects ref internals, never assumes backend addressing.

## S6 — Capability registry returns the active provider's declared capabilities

- **GIVEN** an active provider with `listCapabilities()`
- **WHEN** the memory extension queries the registry
- **THEN** it retrieves exactly the active provider's declared capabilities and registers
  one namespaced tool each.
