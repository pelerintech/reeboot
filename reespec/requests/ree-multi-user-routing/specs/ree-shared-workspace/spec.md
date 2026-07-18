# Spec — ree-shared-workspace

All ree conversations share one workspace (the RAG corpus); no per-customer directory is created.

## S1 — factory uses a single shared workspace
- **GIVEN** ree mode with the runner factory
- **WHEN** runners are created for conversations `A` and `B`
- **THEN** both are constructed with the same shared workspace path (e.g. `contexts/__ree__/workspace`),
  not `contexts/A/workspace` and `contexts/B/workspace`.

## S2 — no per-conversation turn-meta directory is created
- **GIVEN** ree mode
- **WHEN** a turn for `conversationId:'A'` runs
- **THEN** no `contexts/A/workspace/.reeboot_turn_meta.json` is written (turn-meta is skipped in ree),
  and the ree token-meter still records the turn with a default `operationType`.
