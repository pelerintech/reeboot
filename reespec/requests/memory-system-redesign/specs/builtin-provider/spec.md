# Spec — builtin-provider

The `builtin` provider is rebuilt onto the new contract as the reference implementation,
preserving today's default behavior.

## S1 — builtin is the reference implementation of the reshaped contract

- **GIVEN** the active provider is `builtin`
- **WHEN** core operations are invoked with `scope`, query, refs, and grounding
- **THEN** they behave as today: `store`/`update`/`forget` manage MEMORY.md (self) and
  USER.md (human) entries, `recall` reads + term-matches (`'both'` concatenates),
  `clear` wipes a scope's file, `grounding` returns the memory block trimmed to `maxChars`.

## S2 — store/update/forget return and consume opaque refs

- **GIVEN** builtin `store` is invoked
- **THEN** it returns an opaque `MemoryRef` (builtin: the entry/substring handle), and
  `update`/`forget` accept that ref to locate the entry — replacing the previous
  direct `old_text`-substring contract surface with ref-based addressing.

## S3 — Default tool + injection behaviour preserved byte-for-byte

- **GIVEN** `memory.provider` is unset (builtin default)
- **WHEN** the `memory` tool and `before_agent_start` grounding run
- **THEN** the outward behaviour matches the pre-change default (same entries, same
  system-prompt block), so most deployments are unaffected.

## S4 — builtin declares its hot-memory capability

- **GIVEN** builtin is active and has hot-memory enabled
- **WHEN** the capability registry is queried
- **THEN** builtin declares its hot-memory/recall-enhancement capability, so the agent
  loop wires it (existing hot-memory extension restructured under the provider).

## S5 — builtin is not self-consolidating; reeboot's job routes through it

- **GIVEN** builtin is active (does not self-consolidate)
- **WHEN** reeboot's consolidation job runs
- **THEN** reeboot runs its job mining the conversation log and writes distilled insights
  via `builtin.store('self', ...)` — never direct file writes.
