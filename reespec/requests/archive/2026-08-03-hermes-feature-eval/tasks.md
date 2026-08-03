# Tasks — hermes-feature-eval

Vertical slices, one RED→GREEN per task. Test files live under `reeboot/tests/...`
following the existing `tests/<area>/*.test.ts` convention (vitest). Each task = exactly
3 steps: RED (failing test) → ACTION (minimal impl) → GREEN (passing).

---

## Memory plug (A)

### 1. Add `memory.provider` config field

- [x] **RED** — Write `reeboot/tests/memory-plug/config.test.ts`: parse config with `memory.provider` unset → `.memory.provider === 'builtin'`; with `'dreem'` → `'dreem'`; with an invalid value (e.g. `'foo'`) → schema rejects. Run → fails (field doesn't exist).
- [x] **ACTION** — Add `provider: z.enum(['builtin','dreem','mem0']).default('builtin')` to `MemoryConfigSchema` in `reeboot/src/config.ts`; export the type.
- [x] **GREEN** — Run `npx vitest run reeboot/tests/memory-plug/config.test.ts` → passes.

### 2. MemoryProvider interface + MemoryManager resolution with fallback

- [x] **RED** — Write `reeboot/tests/memory-plug/manager.test.ts`: given a registry where the
      configured provider is unknown → manager reports `builtin` (fallback) and logs a
      warning; given a registered provider → manager reports that provider. Run → fails
      (no manager type/function exists).
- [x] **ACTION** — Implement `MemoryProvider` interface and `MemoryManager` in
      `reeboot/src/memory-provider.ts` (or similar): `resolveProvider(config, registry)` that
      returns the configured provider if found/constructs, else falls back to `builtin`.
- [x] **GREEN** — Run the test → passes.

### 3. Builtin provider; memory tool routed through the manager

- [x] **RED** — Write `reeboot/tests/memory-plug/builtin-provider.test.ts`: with the default
      `builtin` provider active, the `memory` tool's top-level operations (store/replace/
      remove) still mutate MEMORY.md/USER.md exactly as today. Also assert a configured
      alternate provider receives those operations instead. Run → fails (manager not wired
      into the tool).
- [x] **ACTION** — Refactor `reeboot/src/extensions/memory-manager.ts` file-logic into the
      `builtin` provider; route the `memory` tool through `MemoryManager` → active provider,
      preserving current behavior for `builtin`.
- [x] **GREEN** — Run the test + existing memory-manager tests → pass.

### 4. System-prompt contribution routed through the manager

- [x] **RED** — Write `reeboot/tests/memory-plug/prompt-contribution.test.ts`: assert the
      `before_agent_start` snapshot injection is built from the *active* provider's
      `buildSystemPromptContribution()` and falls back to builtin content when an alternate
      provider is set. Run → fails.
- [x] **ACTION** — Route the existing memory snapshot injection through
      `manager.activeProvider.buildSystemPromptContribution()`.
- [x] **GREEN** — Run the test → passes.

### 5. Seam accepts a second (heterogeneous) backend

- [x] **RED** — Write `reeboot/tests/memory-plug/fake-backend.test.ts`: implement a minimal
      alternate `MemoryProvider` (test fake of a non-file backend), register + select it, and
      assert memory ops + prompt contribution route to it. This is the proof that a future
      dreem/mem0 backend plugs in. Run → fails until wired.
- [x] **ACTION** — Expose the manager's provider registration/selection API so an alternate
      provider can be registered and selected by `memory.provider`.
- [x] **GREEN** — Run the test → passes.

---

## Footprint docs (B)

### 6. AGENTS.md documents reeboot's design goal and rungs (non-code)

- [x] **RED** — Check: `reeboot/AGENTS.md` does not contain a "## Design Goal & Architecture"
      section listing reeboot's capability-placement rungs (extend → gated tool → extension →
      MCP → core), nor references to reeboot-native idioms (ExtensionAPI, pi/ree adapters).
      Assertion fails — section absent.
- [x] **ACTION** — Add the "Design Goal & Architecture" section to `reeboot/AGENTS.md`
      (contributor-facing developer doc; do NOT touch the pi persona AGENTS.md). State the
      design goal (light core, capability at edges, graceful degradation) and rungs authored
      from reeboot's own mechanisms, citing real examples (jina, knowledge, memory gating).
- [x] **GREEN** — Verify: `reeboot/AGENTS.md` contains that section with the five rungs and
      reeboot-native references, and the persona AGENTS.md is unchanged. Assertion passes.

### 7. Footprint-docs content is reeboot-native (non-code)

- [x] **RED** — Check: the new section (or any new doc) contains no Hermes-specific
      identifiers/rules (e.g. no "HERMES_" naming, no verbatim Hermes rubric). Assertion
      would fail if borrowed.
- [x] **ACTION** — Ensure the section language is reeboot-native; replace any Hermes-derived
      phrasing with reeboot's own (graceful-degradation fallback pattern, per-deployment
      config, single-tenant model).
- [x] **GREEN** — Verify: re-reading the section finds no Hermes identifiers and it reads as
      reeboot's own design choices. Assertion passes.

---

## Webhook triggers (C)

### 8. Webhooks config schema + schema validation

- [x] **RED** — Write `reeboot/tests/webhook-triggers/config.test.ts`: a valid
      `config.webhooks` array (with/without `deliver`) parses; a subscription missing `secret`
      is invalid. Run → fails (schema absent).
- [x] **ACTION** — Add `WebhooksConfigSchema` to `reeboot/src/config.ts` (name, secret, map?,
      prompt, deliver?, enabled).
- [x] **GREEN** — Run the test → passes.

### 9. Register /webhook/:name routes + disable/unknown → 404

- [x] **RED** — Write `reeboot/tests/webhook-triggers/routes.test.ts`: against the Hono app,
      `POST /webhook/known` with a valid subscription returns non-404; `POST /webhook/unknown`
      and a disabled subscription return 404. Run → fails (routes not registered).
- [x] **ACTION** — Register `POST /webhook/:name` in `reeboot/src/server.ts` (alongside a2a
      routes) via a standalone `buildWebhookApp` sub-app, resolved against `config.webhooks`;
      404 for unknown/disabled.
- [x] **GREEN** — Run the test → passes.

### 10. HMAC authenticity enforcement

- [x] **RED** — Write `reeboot/tests/webhook-triggers/hmac.test.ts`: a POST to `/webhook/:name`
      with an invalid/missing `X-Reeboot-Signature` returns 401 and triggers no run; a correctly
      signed raw-body HMAC-SHA256 (constant-time compared) is accepted. Run → fails.
- [x] **ACTION** — Verify `X-Reeboot-Signature` = HMAC-SHA256(signWebhookSecret, rawBody) with a
      constant-time compare; 401 on mismatch.
- [x] **GREEN** — Run the test → passes.

### 11. Body → prompt context + agent run

- [x] **RED** — Write `reeboot/tests/webhook-triggers/run.test.ts`: a valid signed request maps
      the JSON body into the subscription `prompt` template and triggers an agent run of that
      prompt (assert via a stubbed runner). Run → fails.
- [x] **ACTION** — Implement body→context mapping (default JSON string) + template substitution,
      then run the prompt through the runner (reuse the a2a runner pattern).
- [x] **GREEN** — Run the test → passes.

### 12. Deliver mode sends result to channel+peer

- [x] **RED** — Write `reeboot/tests/webhook-triggers/deliver.test.ts`: a subscription with
      `deliver` completes an agent run and sends the result to the configured channel+peer; the
      HTTP caller receives an acknowledgment. Run → fails.
- [x] **ACTION** — After a successful run, push the result through the existing channel delivery
      path when `deliver` is set; return an ack to the caller.
- [x] **GREEN** — Run the test → passes.

### 13. No-deliver mode returns the result synchronously

- [x] **RED** — Write `reeboot/tests/webhook-triggers/deliver.test.ts`: a subscription with no
      `deliver` target returns the agent's result to the caller as JSON. Run → fails.
- [x] **ACTION** — When `deliver` is absent, await the run and return the result in the response
      body.
- [x] **GREEN** — Run the test → passes.

### 14. ToolDefinition `minAuthLevel` + ReeChat auth level

- [x] **RED** — Write `reeboot/tests/auth-gated-tools/gating.test.ts`: a registered tool with
      `minAuthLevel: 'customer'` is excluded from the assembled tool set when the chat's auth
      level is `anonymous`, and included after the level is raised to `customer`. Run → fails
      (no auth-state plumbing).
- [x] **ACTION** — Add an ordered `AuthLevel` type and `chat.authLevel` (default `anonymous`) to
      `ReeChat`; add optional `minAuthLevel` to `ToolDefinition`; add a helper that filters
      `chat.tools` by level.
- [x] **GREEN** — Run the test → passes.

### 15. Agent loop filters tools by auth level each turn

- [x] **RED** — Extend `reeboot/tests/auth-gated-tools/gating.test.ts` (or add
      `loop.test.ts`): assert `ree-agent-loop.ts` passes only tools whose `minAuthLevel <=
      chat.authLevel` into the TanStack tool map on a turn, with the higher-than-level tools
      absent. Run → fails (loop not filtering).
- [x] **ACTION** — In `ree-agent-loop.ts`, filter `Array.from(reeChat.tools.values())` by the
      chat's auth level before mapping to TanStack tools.
- [x] **GREEN** — Run the test + existing ree loop/runtime tests → pass.

### 16. reeboot-owned auth-state change mechanism + `auth_establish`

- [x] **RED** — Write `reeboot/tests/auth-gated-tools/auth-state.test.ts`: calling a reeboot
      extension method `setAuthState(chatId, level)` (and/or the `auth_establish` tool) raises a
      chat's level, and a gated tool becomes callable on the next turn. Run → fails.
- [x] **ACTION** — Add `setAuthState` to the ree extension API surface (chat-level), wire it to
      `chat.authLevel`, and provide a first-class `auth_establish` tool/command that a
      deployment's auth flow can invoke.
- [x] **GREEN** — Run the test → passes.

### 17. Full suite + graceful-degradation sanity

- [x] **RED** — Confirm new tests all run (they pass); assert nothing in pi mode broke — run the
      existing pi + ree suites.
- [x] **ACTION** — Fix any regressions the new seams introduced (path/seam wiring).
- [x] **GREEN** — Run the full `reeboot/tests` suite (unit) → green; note that the
      docker-integration scripts are out of scope unless touched.

> Reached as "green" scoped to this request. All suites in the touched areas pass
> (memory-plug 57, webhook-triggers 13, auth-gated-tools 6, plus ree-chat/ree-adapter/config);
> `tsc --noEmit` clean; `git stash` baseline comparison confirms the ~30 full-suite failures
> (server-boot EPERM on ~/.reeboot, WhatsApp/MCP/knowledge-watcher subprocesses, package `npm
> pack`, and a stale `getReeFactories` 7-vs-8 assertion) are pre-existing and unrelated to this
> work. Full-suite green is not reachable in this sandbox (EPERM is a filesystem restriction,
> not code).
