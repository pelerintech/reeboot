# Evaluations — hermes-feature-eval

## Evaluation — 2026-08-03 19:30

### memory-plug
verdict:  ⚠️ PARTIAL
reason:   S1/S2/S4/S5/S6 all present and green (14/14 tests in tests/memory-plug/, incl.
          config default=builtin, hetero fake backend routes ops + system-prompt). But S3
          requires fallback "with a logged warning" — MemoryManager.select() (src/memory-provider.ts)
          falls back to builtin but emits nothing; no console.warn/logger call exists anywhere in
          the select/fallback path (grep of src/ shows none). Also config.test.ts asserts unknown
          provider values are *rejected* at config parse, so the S3 "unknown provider → graceful
          fallback, never crash startup" path is blocked at a layer above the manager.
focus:    src/memory-provider.ts MemoryManager.select + src/config.ts memory.provider schema —
          add/verify the logged warning on fallback, and reconcile schema rejection vs graceful degradation

### footprint-docs
verdict:  ✅ SATISFIED
reason:   reeboot/AGENTS.md contains "Design Goal & Architecture" stating light core +
          capability at edges + graceful degradation (S1); lists all 5 rungs in order
          extend→gated tool→extension→MCP→core dead-last, citing memory/knowledge/jina (S2);
          no HERMES identifiers, uses reeboot idioms (ExtensionAPI, pi/ree adapters,
          single-tenant per-deployment, graceful-degradation fallback) (S3); persona
          templates/main-agents.md last modified in 327d00a, untouched by this change's
          commits 7dd9104/4c870b2 (S4).

### auth-gated-tools
verdict:  ✅ SATISFIED
reason:   applyAuthLevel (src/extensions/ree-adapter.ts) filters by minAuthLevel (S1/S3),
          applied every turn in ree-agent-loop.ts:135 (S2/S4); per-chat ReeChat.authLevel
          isolates chats and gating is absent from pi runtime (S4); reeboot-owned mechanism
          via setAuthState + /auth_establish command on ReeChat (S5). tests/auth-gated-tools/*
          6/6 pass.

### webhook-triggers
verdict:  ✅ SATISFIED
reason:   buildWebhookApp (src/webhooks.ts) implements POST /webhook/:name with 404 on
          unknown/disabled (S1), constant-time HMAC-SHA256 via timingSafeEqual → 401 (S2),
          body→context→prompt {body} substitution agent run (S3), deliver→channel+peer w/ ack
          (S4), sync JSON return when no deliver (S5), and B-side workflow is config-only (S6);
          mounted in src/server.ts:1102 with real runTask/deliver wiring. tests/webhook-triggers/*
          13/13 pass.

## Triage

✅ Safe to skip:   footprint-docs, auth-gated-tools, webhook-triggers
⚠️  Worth a look:  memory-plug — fallback works & tested, but S3's "logged warning" is not
                   implemented (no logger call in select/fallback path); config schema
                   rejection of unknown providers also pre-empts the graceful-degradation path
❓  Human call:    none

---
## Evaluation — 2026-08-03 19:42

### memory-plug
verdict:  ✅ SATISFIED
reason:   `src/memory-provider.ts` `MemoryManager` defaults to `builtin`, selects any
          registered provider via `manager.select(memoryConfig.provider ?? 'builtin')`,
          warns+falls back to builtin on unknown/unloadable (S3), keeps one active (S4).
          `tests/memory-plug/fake-backend.test.ts` proves a heterogeneous in-memory
          backend routes both `memory` ops and `before_agent_start` system-prompt
          contribution through the fake (S5); `src/knowledge/` has no reference to the
          memory seam (S6). Config `provider: z.enum(['builtin','dreem','mem0'])` maps
          to S1/S2. All 16 tests in tests/memory-plug pass.
focus:    —

### footprint-docs
verdict:  ✅ SATISFIED
reason:   `reeboot/AGENTS.md` contains a "Design Goal & Architecture" section stating
          light core + capability at the edges + graceful degradation (S1), lists the
          five rungs in order with real examples (jina, knowledge, memory) (S2), and
          cites reeboot-native idioms (ExtensionAPI, pi/ree adapters, per-deployment
          config) with no `HERMES_*` identifiers (S3). Only `reeboot/AGENTS.md` was
          edited; it is the sole AGENTS.md in the tree, so the persona AGENTS.md is
          untouched (S4).
focus:    —

### webhook-triggers
verdict:  ✅ SATISFIED
reason:   `src/webhooks.ts` `buildWebhookApp` mounts `POST /webhook/:name`, returns 404
          for unknown/disabled (S1), enforces HMAC-SHA256 constant-time compared (S2),
          maps body→context→prompt and runs the agent (S3), delivers to channel+peer and
          acks (S4), or returns the result synchronously when no `deliver` target (S5).
          Server wiring in `src/server.ts` (runTask/deliver) reuses the runner; one
          primitive covers the category-3 B-side workflow as a config (S6). 13 tests in
          tests/webhook-triggers pass.
focus:    —

### auth-gated-tools
verdict:  ✅ SATISFIED
reason:   `src/runtime/ree-agent-loop.ts` reassembles tools each turn via
          `applyAuthLevel(reeChat.tools, reeChat.authLevel)` (S1); raising the level via
          the reeboot-owned `auth_establish` command (`src/runtime/ree-chat.ts`) or
          `setAuthState` extension method (`src/extensions/ree-adapter.ts`) unlocks
          gated tools next turn (S2/S5); rank comparison hides higher-level tools (S3);
          `authLevel` is per-chat and gating lives only in the ree path — pi mode is
          unaffected (S4). 6 tests in tests/auth-gated-tools pass.
focus:    —

## Triage

✅ All capabilities satisfied — no action required.

---
