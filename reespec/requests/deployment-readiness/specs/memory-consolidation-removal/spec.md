# Spec — memory-consolidation-removal (WS-E1)

Memory consolidation is disabled **in ree (multi-user) mode only** — a support/triage agent must not
consolidate memory across mutually-private chats or over time. In **pi (single-user) mode consolidation
is retained** (it is how the assistant becomes more helpful over time). So: in ree mode no
`__memory_consolidation__` sentinel job is scheduled; in pi mode it still is. (Open Decision E1 —
resolved: scope removal to ree, keep pi.)

> **NOTE (surfaced at evaluation, 2026-07-17):** the *pi* consolidation path is currently broken
> independently of this spec — the scheduled sentinel is never intercepted and `runConsolidation` is
> never called in production; the job fires as a literal LLM prompt. That is a separate defect (pi
> consolidation wiring), not covered by this ree-scoped spec. See evaluations.md.

## S1 — in ree mode, no consolidation sentinel task is scheduled
- **GIVEN** `config.sdk === 'ree'`, a memory config with `consolidation.enabled: true`, and an
  in-memory `tasks` DB
- **WHEN** server background jobs are bootstrapped
- **THEN** no row exists in `tasks` whose prompt contains `__memory_consolidation__`.

## S2 — bootstrap still succeeds in ree mode without the memory job
- **GIVEN** the same ree setup
- **WHEN** bootstrap runs
- **THEN** it completes without error and other background jobs (e.g. knowledge lint, if enabled) are
  unaffected.

## S3 — in pi mode, consolidation is still scheduled (retained)
- **GIVEN** `config.sdk !== 'ree'` (pi) with `consolidation.enabled: true`
- **WHEN** server background jobs are bootstrapped
- **THEN** a `__memory_consolidation__` job IS registered (single-user consolidation is kept).

## S4 — runConsolidation remains callable
- **GIVEN** the memory module
- **WHEN** `runConsolidation` is imported
- **THEN** it exists and its unit tests pass.
