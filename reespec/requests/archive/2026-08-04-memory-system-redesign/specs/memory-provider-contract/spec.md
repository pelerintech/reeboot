# Spec — memory-provider-contract

The `MemoryProvider` interface is action-shaped, scoped, query-based recall, opaque refs,
and provider-owned grounding. Every provider (builtin, dreem, mem0, future) honors it.

## S1 — Scope is a first-class singular axis through every operation

- **GIVEN** a provider implementing the contract
- **WHEN** any core operation (`store`, `recall`, `update`, `forget`, `clear`) is invoked
- **THEN** it accepts a `scope` of `'self' | 'human' | 'both'`, and the `self`/`human`
  distinction is preserved as distinct, non-conflated namespaces in every backend.

## S1b — one `store` action, hot first, source-signalled (everything is hot, later consolidated)

- **GIVEN** the provider is invoked via `store(scope, content, opts?)`
- **WHEN** `opts.source` is unset or `'entry'`
- **THEN** the content lands in the provider's **hot** memory (recent/working memory) and is a
  candidate for later consolidation to cold — the same single write surface as before.
- **GIVEN** `store(scope, content, { source: 'session' })` is invoked with a raw transcript
- **THEN** the **provider** owns distillation: the builtin LLM-distills to hot memory; a
  delegating provider (e.g. dreem) ingests the raw session into its own tooling.
  The manager never distills on the provider's behalf.
- **GIVEN** `store(scope, content, { source: 'consolidation' })` is invoked
- **THEN** the content is written directly to **cold** (long-term) memory.
- The provider internally decides hot-vs-cold based on the source; the consumer is agnostic.

## S2 — Composite scope 'both' merges across self+human

- **GIVEN** `recall` is invoked with `scope: 'both'`
- **WHEN** the query matches content in both `self` and `human`
- **THEN** the result is a single merged, ranked list drawing from both namespaces
  (builtin concatenates; a smart backend merges + ranks).

## S3 — recall is query-based, never a full dump

- **GIVEN** `recall(scope, query, limit?)` is invoked
- **THEN** it returns the relevant subset of `MemoryHit[]` for the query — a provider never
  returns the entire memory context as a recall response.

## S4 — update/forget address memories via opaque refs

- **GIVEN** `store` or `recall` returns a `MemoryRef`
- **WHEN** `update` or `forget` is invoked with that ref
- **THEN** the provider translates the opaque ref to its native addressing (file
  entry/lines, concept path, memory id); the manager never inspects ref internals.

## S5 — grounding is provider-owned content with a self-policed size ceiling

- **GIVEN** `grounding({ scope?, maxChars? })` is invoked at session start
- **THEN** the provider returns a small, self-chosen memory digest for the scope within
  `maxChars` — no prompt/query input is accepted (nothing to prompt with at session
  start); the digest is provider-scoped, not manager-transformed.

## S6 — every provider honors all six core operations

- **GIVEN** a provider is active
- **WHEN** any of `store/update/forget/recall/clear/grounding` is invoked
- **THEN** the provider either implements the operation natively or degrades it at the
  provider level (never leaks upward, never silently no-ops memory).
