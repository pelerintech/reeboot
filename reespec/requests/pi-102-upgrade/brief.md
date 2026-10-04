# Brief — pi-102-upgrade

## Why

Reeboot pins `@earendil-works/pi-coding-agent` at exactly `0.84.1`, and its TanStack provider
packages at `0.39.x`/`0.15.x`. Both are now several majors behind (`pi` latest `1.0.2`,
`@tanstack/ai` latest `0.64.0`). Separately, an **E2E collection turn** in the incohub customer
deployment is blocked: reeboot's bundled tools (`session_search`, `delegate`) are emitted in
OpenAI **strict tool mode** (`strict:true`) with their optional params (`limit`/`peer`/`timeout`)
coerced into `required`, which OpenRouter rejects with a `400 Invalid schema ... Missing 'peer'`
on every tool-enabled turn.

Discovery reproduced this empirically (running the agent in ree mode with the incohub config
through a logging proxy to a live OpenAI-compatible backend) and confirmed the root cause is
reeboot's **ree/TanStack** provider layer forcing optional-param schemas into a strict shape.
The goal of reeboot is to be a **swappable harness in all parts** — a customer-facing
conversational partner (ree mode) and a personal assistant (pi mode) — so dependency drift must
not silently break a mode, and the tools layer must stay SDK-agnostic.

## What Changes

After this request completes:

- `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, and `@earendil-works/pi-agent-core`
  are bumped to `1.0.2` (exact pins), together.
- The TanStack provider group is brought current: `@tanstack/ai` → `0.64.0`, `@tanstack/ai-openai`
  → `0.26.0`, `@tanstack/ai-anthropic` → `0.19.4`, `@tanstack/ai-groq` → `0.8.2`,
  `@tanstack/ai-mcp` → `0.7.0` (peer-locked, must move together).
- The ree/TanStack **tool-emission adapter** no longer forces optional-param reeboot tools into
  `strict:true`; it emits them with `strict:false` (schema passed through), so OpenRouter/OpenAI
  accept them. This lives in the integration layer — **the shared tool schemas are untouched**.
- Both modes keep working after the migrations: pi mode (pi-ai) and ree mode (TanStack) still
  emit `session_search`/`delegate` correctly, and no new built-in extensions leak into reeboot's
  tool surface.
- Typecheck, lint, and the reeboot test suite are green after the migration.

## Goals

- **Fix the customer blocker**: the incohub `register-company` collection conversation completes,
  and the agent performs at least one schema-driven collection tool call (`set_field`/
  `add_group_item`/etc.) — no `400` on the reeboot bundled tools. (Sequence is not asserted.)
- **Reduce dependency drift risk**: land pi and the TanStack group on current versions so a future
  major bump is a pin+test exercise rather than a rework, and so the customer/ree deployments
  integrate without fear of silent breakage.
- **Keep tools SDK-agnostic**: the strict-mode fix must NOT change the shared `session_search`/
  `delegate` schemas (that would fix ree but break pi).
- **Preserve both modes**: pi (`authMode === 'own'` and `'pi'`) and ree (TanStack) both keep
  working with the same config.

## Non-Goals

- **Not** changing how the agent behaves beyond what the SDK bumps and the strict-mode fix require.
- **Not** introducing a third SDK/backend; the swapability goal is addressed by keeping the tool
  layer SDK-agnostic and the strict handling at the integration layer, not by building new adapters.
- **Not** fixing unrelated reeboot dep vulnerabilities surfaced in the same audit (out of scope
  of the pi bump) unless they are reeboot-owned direct deps that must be reconciled.
- **Not** asserting the specific ordering/sequence of tool calls in the collection turn.
- **Not** rewiring custom/local provider streaming via `modelRuntime.registerProvider` (that is a
  separate follow-up; standard cloud providers work through the builtin provider + runtime key).

## Impact

- **Operators / users**: the incohub customer collection loop unblocks; reeboot ships on current
  pi + TanStack, reducing the chance a future SDK bump breaks the ree deployment.
- **Owners of this code**: `src/runtime/ree-agent-loop.ts` (tool-emission adapter for the strict
  fix), the dependency pins in `reeboot/package.json`, and the pi-runner tests.
- **Release mechanics**: a future `2.x.y` release carries the upgraded pi + TanStack runtimes and
  the strict-mode fix.
