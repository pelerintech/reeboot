# Spec — memory-plug

Pluggable memory backend via a `MemoryManager` provider seam. One active backend per
deployment (`memory.provider`), internal backend as default + fallback.

## S1 — Default backend is the internal memory system

- **GIVEN** config has no `memory.provider` set (default)
- **WHEN** the agent starts and the memory manager resolves the active provider
- **THEN** the active provider is `builtin`, and existing `memory`-tool behavior
  (recall/store against MEMORY.md/USER.md) and `before_agent_start` memory snapshot
  injection continue to work unchanged

## S2 — Configured provider is selected

- **GIVEN** `memory.provider = 'dreem'` (or any future provider) is configured
- **WHEN** the manager resolves the active provider
- **THEN** the active provider is the configured one, and the `memory` tool + system
  prompt contribution route through that provider, not the built-in

## S3 — Known-but-unloadable configured provider falls back to builtin

- **GIVEN** `memory.provider` names a provider that is unknown or fails to load/construct
- **WHEN** the manager resolves the provider
- **THEN** it falls back to `builtin` with a logged warning, and `builtin` is active
  (graceful degradation — never leaves memory silently disabled, never crashes startup)

## S4 — Exactly one backend is active at a time

- **GIVEN** a configured provider is active
- **WHEN** memory operations occur
- **THEN** operations go only through that one active provider; no built-in/dreem/mem0
  side-by-side composition occurs

## S5 — A second backend can be swapped in via the provider seam

- **GIVEN** a test fake backend implementing `MemoryProvider` (proving a third backend
  shape besides builtin and a pluggable MCP-style backend)
- **WHEN** it is registered and set as the active provider
- **THEN** memory operations and system-prompt contribution route through the fake,
  demonstrating the seam accepts heterogeneous backends

## S6 — Knowledge corpus is untouched by the seam

- **GIVEN** the memory manager is active
- **WHEN** the knowledge/RAG subsystem is enabled
- **THEN** knowledge ingestion/search continues to operate independently — the seam does
  not route or intercept the knowledge corpus
