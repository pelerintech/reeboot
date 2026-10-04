# Tasks — pi-102-upgrade

> Working directory for every command is `reeboot/` unless stated otherwise.

## 1. Bump the pi runtime to 1.0.2

- [x] **RED** — Check `reeboot/package.json`: `@earendil-works/pi-coding-agent`, `pi-ai`, and
      `pi-agent-core` are still at `0.84.1`. Assertion fails (target `1.0.2` absent).
- [x] **ACTION** — Set `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`,
      `@earendil-works/pi-agent-core` to exact `1.0.2` in `dependencies`. Run `npm install`.
- [x] **GREEN** — `npm ls @earendil-works/pi-coding-agent` resolves to `1.0.2`; likewise `pi-ai`
      and `pi-agent-core`. (Note: `tsc`/build may still fail on the event-surface task — see
      task 4; the build-green barrier is gated on tasks 3–5.)

## 2. Bump the TanStack provider group to current

- [x] **RED** — Check `reeboot/package.json`: `@tanstack/ai` is still `^0.39.1`, `ai-openai`
      `^0.15.10`, `ai-anthropic` `^0.16.0`, `ai-groq` `^0.5.0`, `ai-mcp` `^0.2.2`. Assertion
      fails (targets absent).
- [x] **ACTION** — Set `@tanstack/ai` `^0.64.0`, `@tanstack/ai-openai` `^0.26.0`,
      `@tanstack/ai-anthropic` `^0.19.4`, `@tanstack/ai-groq` `^0.8.2`, `@tanstack/ai-mcp`
      `^0.7.0`. Run `npm install`. Reconcile any reeboot code the move requires (e.g. baseURL key).
- [x] **GREEN** — `npm ls @tanstack/ai` resolves to `0.64.0`; the four provider/mcp packages
      resolve to their new versions. `npm run build` (typecheck) succeeds.

## 3. Update the pi version assertion test

- [x] **RED** — Check `tests/pi-version.test.ts`: it asserts the exact pin/installed version
      `0.84.1`. That assertion fails against the new target.
- [x] **ACTION** — Update `tests/pi-version.test.ts` to assert `1.0.2` for the exact pin and the
      installed version (all three pi packages).
- [x] **GREEN** — Run `npx vitest run tests/pi-version.test.ts` → passes.

## 4. Confirm pi-mode session/event surface against 1.0.2

- [x] **RED** — Extend `tests/agent-runner/pi-runner-authmodel.test.ts` (and a new
      `tests/agent-runner/pi-runner-events.test.ts`): mock `createAgentSession` and drive a real
      `PiAgentRunner` in `authMode === 'own'`, asserting `createAgentSession` receives
      `model`/`modelRuntime`/`settingsManager`/`resourceLoader`/`sessionManager`/`cwd`; and assert
      `message_update`/`tool_execution_start`/`tool_execution_end`/`agent_end` map to the
      documented `RunnerEvent`s. Run → fails (surface drift on 1.0.2).
- [x] **ACTION** — Adjust `src/agent-runner/pi-runner.ts` for any changed 1.0.2 surface (event
      shapes / private reaches), preserving both auth modes and the baseUrl plumbing.
- [x] **GREEN** — Run the new + existing pi-runner tests → green; `npm run build` succeeds.

## 5. Verify no built-in extensions leak into pi mode

- [x] **RED** — Add `tests/agent-runner/pi-runner-toolset.test.ts`: build a `PiAgentRunner` and
      assert the surfaced tool names are limited to reeboot's registered set and contain none of
      `codemode`/`tool_search`/`llama.cpp` / MCP built-ins that reeboot did not enable. Run →
      fails if pi 0.99+ built-ins auto-load.
- [x] **ACTION** — Confirm `src/extensions/loader.ts` `createLoader` passes only reeboot's
      `extensionFactories` and, if any built-in leaks, suppress them in the loader.
- [x] **GREEN** — Run the test → green (reasserting the containment established in discovery).

## 6. Add a ree tool-emission test that pins strict per tool

- [x] **RED** — Add `tests/runtime/ree-strict-emission.test.ts`: for a reeboot tool with an
      optional param (`session_search`) and one with all-required params, capture the
      OpenAI-compatible request produced by the ree adapter and assert the optional-param tool is
      emitted `strict:false` with the optional prop intact, and the all-required tool is `strict:true`.
      Run → fails (current emission forces `strict:true`).
- [x] **ACTION** — In `src/runtime/ree-runtime.ts` `createTanStackClient()` custom/compatible
      branch, build a reeboot-owned adapter wrapping/subclassing `OpenAICompatibleChatAdapter`
      that overrides the tool-emission step to decide strict from the original reeboot schema
      (carried via tool `metadata`): optional-param → `strict:false` + original schema; all-required
      → `strict:true`.
- [x] **GREEN** — Run the new test → green; existing ree runtime tests still green.

## 7. Confirm shared tool schemas are unchanged by the fix

- [x] **RED** — Add `tests/runtime/strict-fix-preserves-schemas.test.ts`: read the `ToolDefinition`
      `parameters` for `session_search` and `delegate` and assert their optional props remain
      optional (not forced into `required`), identical to a captured baseline. Run → fails if the
      fix mutated shared schemas.
- [x] **ACTION** — (Guard) ensure the strict fix touches only the ree adapter, never the shared
      `ToolDefinition` objects.
- [x] **GREEN** — Run the test → green (schemas SDK-agnostic / unchanged).

## 8. Confirm pi mode strict emission is not regressed

- [x] **RED** — Add `tests/agent-runner/pi-runner-strict-emission.test.ts`: capture the pi-ai
      request for `session_search` / `delegate` and assert they are emitted `strict:false` with
      optional params respected (pi mode's existing correct behavior). Run → fails if the shared
      schema change / fix regressed pi.
- [x] **ACTION** — (Guard) no change pi mode; only verify.
- [x] **GREEN** — Run the test → green (pi mode unchanged).

## 9. Full-suite gate

- [x] **RED** — Check `npm run test:run` currently (pre-change) for the touched areas: count
      failures attributable to the browser/SDK surface. Establish a baseline.
- [x] **ACTION** — Run the full reeboot test suite after all changes; fix any regression in the
      touched areas only (server-boot / external-service / unrelated pre-existing failures are
      out of scope per the established test-suite policy).
- [x] **GREEN** — `npm run test:run` and `npx vitest run` report the touched suites green with no
      new failures; `npm run build` and `tsc --noEmit` clean.

## 10. E2E gate — replay the incohub collection turn (acceptance)

- [x] **RED** — Before the fix this fails: with reeboot in ree mode + the incohub config
      (`sdk:ree`, custom provider, `core.delegate:false`, `extensions.incohub.services:
      ["register-company"]`) against a live OpenAI-compatible backend through a logging proxy, the
      `register-company` conversation 400s on strict-mode bundling. Establish that baseline.
- [x] **ACTION** — After all changes, drive the `register-company` collection conversation
      ("I want to register a company called Acme with legal form SRL...") through the same
      harness; bake the incohub extension + schema + brief so `set_field`/`add_group_item` etc.
      register.
- [x] **GREEN** — Assert: (a) the turn completes with no `400` strict-schema error; (b) the
      captured request emits `session_search`/`delegate` `strict:false` with optional params
      respected; (c) the agent performs at least one schema-driven collection tool call
      (`set_field`/`add_group_item`/`set_choice`/`set_doc`). (Sequence is not asserted.)
