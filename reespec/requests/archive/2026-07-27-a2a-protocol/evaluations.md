## Evaluation — 2025-07-26 23:15

### delegate-tool: sub-agent session created via factory
verdict:  ⚠️ PARTIAL
reason:   Source in `reeboot/src/extensions/delegate.ts` correctly creates an `AgentRunner` via
          `opts.runnerFactory(task)` — but the production loader (`reeboot/src/extensions/loader.ts`
          lines 193-198) passes `{}` for options, so `runnerFactory` is never provided. The code
          path exists; the wiring is absent.
focus:    `reeboot/src/extensions/loader.ts` — the `delegateExtension(api, {})` call must be wired
          with a real `runnerFactory` from the orchestrator or server.

### delegate-tool: works on pi runtime
verdict:  ⚠️ PARTIAL
reason:   `PiAgentRunner` (`reeboot/src/agent-runner/pi-runner.ts`) implements the `AgentRunner`
          interface and correctly inherits model config from the reeboot config. The `createRunner`
          function in `server.ts` creates `PiAgentRunner` instances. But the delegate tool never
          receives this factory — same wiring gap.
focus:    `reeboot/src/extensions/loader.ts` — `runnerFactory` must be injected.

### delegate-tool: works on ree runtime
verdict:  ⚠️ PARTIAL
reason:   `ReeAgentRunner` (`reeboot/src/agent-runner/ree-runner.ts`) implements `AgentRunner` with
          a TanStack-backed agent loop. The `createRunner` in `server.ts` creates `ReeAgentRunner`
          instances when `sdk === 'ree'`. Same wiring gap.
focus:    `reeboot/src/extensions/loader.ts` — same wiring gap.

### delegate-tool: sub-agent inherits main agent's model
verdict:  ⚠️ PARTIAL
reason:   `PiAgentRunner._getOrCreateSession()` reads model/provider/key from config (confirmed in
          `pi-runner.ts` line 140-172) and injects them into pi's session/auth storage. Code is
          correct but unreachable in production because `runnerFactory` is not wired.
focus:    Same wiring gap — dead code in production.

### delegate-tool: sub-agent has access to main agent's tool set
verdict:  ⚠️ PARTIAL
reason:   The delegate tool passes no tool restrictions — the sub-agent inherits the full tool set
          from the shared `ResourceLoader`/runtime. No filtering is applied. But without the
          `runnerFactory` wiring, this is dead code in production.
focus:    Same wiring gap.

### delegate-tool: sub-agent timeout aborts long-running task
verdict:  ⚠️ PARTIAL
reason:   Timeout logic is implemented in `delegate.ts` lines 115-130: `Promise.race` against a
          timeout that calls `runner.abort()`. Test `timeout.test.ts` confirms it works (22/22
          tests pass). But the wiring gap means this code is never reached in production.
focus:    Same wiring gap — timeout works in tests, dead code in production.

### delegate-tool: returns view-compatible result
verdict:  ❌ UNSATISFIED
reason:   Spec states "the result is compatible with the structured tool views system" — the
          delegate tool returns only `{ content: [{ type: 'text', text: result }] }` with no
          `view` field. `structured-views.ts` defines `ToolView` types (`data-table`, `data-chart`,
          `form`, `confirm`) but the delegate tool never sets a `view` property. No test covers
          view compatibility.
focus:    `reeboot/src/extensions/delegate.ts` — return value must include a `ToolView`-compatible
          `view` field.

### a2a-http: discovery endpoint returns capabilities
verdict:  ✅ SATISFIED
reason:   `GET /a2a/capabilities` in `server.ts` lines 842-869 returns `{ name, version, tools,
          protocols }` with status 200. Test `a2a-endpoints.test.ts` confirms shape/status.

### a2a-http: invoke endpoint executes task via delegate tool
verdict:  ⚠️ PARTIAL
reason:   Spec states "WHEN the agent calls `delegate({ task: 'Research X', peer: 'research-agent' })`"
          — this requires `a2aClient` and `a2aPeers` wired into the delegate tool, neither of which
          is provided in the production loader (`{}`). The `POST /a2a/invoke` server endpoint works
          independently, but the delegate-tool entry point is unconnected.
focus:    `reeboot/src/extensions/loader.ts` — `a2aClient` and `a2aPeers` (from config's
          `a2a.peers`) must be injected.

### a2a-http: invoke returns structured result
verdict:  ❌ UNSATISFIED
reason:   Spec states "the result is compatible with structured tool views" — `a2aInvoke()` returns
          a plain string, and the delegate tool wraps it as `{ content: [{ type: 'text', text }] }`.
          No `view` field is set anywhere in the A2A call chain.
focus:    `a2a-client.ts` and `delegate.ts` — A2A results need a `ToolView`-compatible `view` field.

### a2a-http: peer authentication
verdict:  ✅ SATISFIED
reason:   `a2aInvoke()` in `a2a-client.ts` line 51 sets `Authorization: Bearer ${apiKey}` header.
          Config schema `A2APeerSchema` includes optional `apiKey`. Test confirms header is sent.

### a2a-http: invoke with unknown peer returns error
verdict:  ⚠️ PARTIAL
reason:   Delegate tool (lines 68-78) returns "Unknown A2A peer" with configured peers listed. Test
          `pi-subagent.test.ts` confirms the error message. But in production, no peers are
          configured (loader passes empty options), so this path only fires if the wiring gap is
          fixed first.
focus:    Same wiring gap — code is correct, unreachable in production.

### a2a-http: reeboot receives A2A invoke request
verdict:  ✅ SATISFIED
reason:   `POST /a2a/invoke` in `server.ts` lines 873-937 validates task, creates runner, executes
          with timeout, returns result. Test confirms 200/400/error behaviour.

### a2a-http: reeboot A2A server rejects unauthenticated request
verdict:  ✅ SATISFIED
reason:   Both `GET /a2a/capabilities` and `POST /a2a/invoke` check `Authorization` against
          `a2a.server.apiKey` and return 401 on mismatch. Test confirms 401/200 behaviour.

---

## Triage

✅ Safe to skip:   a2a discovery endpoint, a2a peer authentication, reeboot receives A2A invoke, reeboot A2A server rejects unauthenticated requests
⚠️  Worth a look:  delegate tool same-process (wiring missing in loader.ts — runnerFactory, a2aClient, a2aPeers all passed as `{}`), delegate tool view-compatible results (missing entirely), A2A invoke via delegate tool (wiring missing), A2A structured result (view field missing)
❓  Human call:    None — all spec requirements are sufficiently well-defined to judge

---

## Evaluation — 2026-07-27 13:48

### A2A peer discovery
verdict:  ✅ SATISFIED
reason:   spec requires `GET /a2a/capabilities` to return JSON with `name`, `version`, and `tools` array, status 200. `src/server.ts:850` returns `{ name: 'reeboot', version: '2.6.0', tools: [...], protocols: [...] }` with 200; `tests/delegate/a2a-endpoints.test.ts` asserts the 200 + capabilities shape. All 35 delegate tests pass.

### A2A task invocation
verdict:  ⚠️ PARTIAL
reason:   Routing, auth, and unknown-peer scenarios are met — `delegate.ts` routes peer calls to `a2aInvoke` (`a2a-client.ts` POSTs to `${url}/a2a/invoke`), sets `Authorization: Bearer ${apiKey}` when configured, and returns `Unknown A2A peer: "${peer}"...` for missing peers. BUT the "A2A invoke returns structured result" scenario is NOT met: spec requires the result be "compatible with structured tool views … AND the WebChat can render it as a rich component." `grep` confirms the delegate tool and a2a-client return **no `view` field** anywhere; `src/structured-views.ts` defines a `ToolView` discriminant (data-table, data-chart, form, confirm, plan) that is never produced, so no rich component can be rendered.
focus:    `src/extensions/delegate.ts` + `src/extensions/a2a-client.ts` — no `view` field is ever returned; the "structured result / rich component" scenario of `specs/a2a-http.md` is unmet.

### A2A server handles incoming requests
verdict:  ✅ SATISFIED
reason:   spec requires `POST /a2a/invoke` to execute in a sub-agent session and return 200 with the result, and to reject unauthenticated requests with 401. `src/server.ts:881` creates a runner via `createRunner`, runs the task, returns `{ status: 'completed', id, result }`; the Authorization check returns 401 on missing/wrong key. `tests/delegate/a2a-security.test.ts` (6 tests) and `a2a-endpoints.test.ts` cover both.

### agent delegates sub-task to a same-process sub-agent
verdict:  ⚠️ PARTIAL
reason:   Registration, session creation, task injection, completion, pi/ree runtime wiring, model inheritance, and timeout (default 60s) scenarios are met — `delegate.ts` registers via `pi.registerTool()`, calls `factory(task)`→`runner.prompt(task)`, resolves on `message_end`, defaults timeout to `60*1000` (abort + error), and `src/server.ts:230` wires `setDefaultRunnerFactory` to `createRunner({…}, appConfig)` so the sub-agent inherits the same config/model. BUT two scenarios are gaps: (1) "delegate tool returns view-compatible result" — same as the A2A structured-result gap, no `view` field is ever returned, so WebChat cannot render a rich component; (2) "sub-agent has access to main agent's tool set" — spec names `[memory, knowledge_search, schedule_task]` but no test verifies the sub-agent can call these; it is only inferred from `appConfig` being passed to `createRunner`.
focus:    `src/extensions/delegate.ts` (no `view` field returned); tool-set inheritance is inferred from `createRunner(appConfig)` wiring but not directly tested against the named tools.

## Triage

✅ Safe to skip:   A2A peer discovery, A2A server handles incoming requests
⚠️  Worth a look:  A2A task invocation — routing/auth/unknown-peer met, but "structured result / rich component" scenario unmet (no `view` field returned by `delegate.ts` or `a2a-client.ts`)
⚠️  Worth a look:  agent delegates sub-task — same `view`-field gap; plus tool-set inheritance unverified (spec names `memory`, `knowledge_search`, `schedule_task`; only inferred from `appConfig` wiring)
❓  Human call:    none — the "rich component" requirement is stated clearly enough to judge as unmet, not underspecified

---

## Evaluation — 2027-07-27 14:25

### A2A peer discovery
verdict:  ✅ SATISFIED
reason:   Spec requires `GET /a2a/capabilities` to return JSON with `name`, `version`, `tools` and status 200. `reeboot/src/server.ts:850` implements the endpoint returning `{ name, version, tools, protocols }`; `tests/delegate/a2a-endpoints.test.ts` "GET /a2a/capabilities returns capabilities JSON" passes.

### A2A task invocation
verdict:  ✅ SATISFIED
reason:   All four scenarios are present. Client POST to peer `/a2a/invoke` is in `reeboot/src/extensions/a2a-client.ts:46` (tested by `a2a-client.test.ts`); structured result returns a `view: { type: 'data-table' }` in `delegate.ts` and is rendered by `webchat/src/components/ToolCall.tsx:32` (test `delegate-tool.test.ts` "returns view-compatible result … for A2A peer result"); API key is sent as `Authorization: Bearer …` in `a2a-client.ts:41` (test "sends API key in Authorization header"); unknown peer returns an error containing "Unknown A2A peer" in `delegate.ts` (test `pi-subagent.test.ts` "returns error for unknown peer").

### A2A server handles incoming requests
verdict:  ✅ SATISFIED
reason:   Spec requires `POST /a2a/invoke` to execute the task in a sub-agent session and return 200, and to return 401 when an API key is configured but absent. `reeboot/src/server.ts:881` creates a runner via `createRunner` and returns `{ status: 'completed', result }`; the 401 path is at `server.ts:884`. Tests `a2a-endpoints.test.ts` and `a2a-security.test.ts` cover both, including the "rejects unauthenticated request" scenario.

### agent delegates sub-task to a same-process sub-agent
verdict:  ⚠️ PARTIAL
reason:   Most scenarios are satisfied (returns result, ree runtime, tool-set access, timeout abort, view-compatible result — all tested in `tests/delegate/`). Two scenarios fall short:
          (1) "delegate tool works on pi runtime" — `server.ts` only calls `setDefaultRunnerFactory()` inside the ree-mode branch (`server.ts:230`); the pi-mode branch (`server.ts:244-261`) never sets it. Since pi is the default (`createRunner`: `config.sdk ?? 'pi'`), a same-process `delegate({task})` call in pi mode returns "Sub-agent runner is not available" in production. The passing test (`pi-subagent.test.ts`) injects a mock factory via `opts.runnerFactory`, so it does not exercise production wiring, and no test verifies that a real `PiAgentRunner` is used.
          (2) "sub-agent inherits main agent's model" — the ree-mode factory passes `appConfig` to `createRunner` (mechanism present), but no test asserts provider/model inheritance, and the pi-mode path is unwired.
focus:    `reeboot/src/server.ts:244-261` (pi-mode branch — `setDefaultRunnerFactory` is missing here, unlike the ree branch at line 230); `tests/delegate/pi-subagent.test.ts` (uses a mock runner, not `PiAgentRunner`).

## Triage

✅ Safe to skip:   A2A peer discovery, A2A task invocation, A2A server handles incoming requests

⚠️  Worth a look:
- `agent delegates sub-task to a same-process sub-agent` — pi-mode production wiring for `setDefaultRunnerFactory` is absent (`server.ts` pi branch); default pi deployments will fail same-process delegation with "Sub-agent runner is not available."
- Same capability — no test verifies real `PiAgentRunner`/`ReeAgentRunner` instantiation or model inheritance; all delegate tests use mock runners.

❓  Human call:    (none — contract is precise enough to judge all capabilities)

---

## Evaluation — 2026-07-27 14:59

### A2A peer discovery
verdict:  ✅ SATISFIED
reason:   spec requires `GET /a2a/capabilities` to return JSON with `name`, `version`, `tools` array and status 200. `reeboot/src/server.ts:857-886` implements exactly this route returning `{ name: 'reeboot', version: '2.6.0', tools: [...], protocols: ['a2a-v1'] }`. Behaviour also exercised in `reeboot/tests/delegate/a2a-endpoints.test.ts`.

### A2A task invocation
verdict:  ✅ SATISFIED
reason:   spec requires `delegate({task, peer})` to POST to `<peerUrl>/a2a/invoke`, return the result, support API-key auth, return a structured-tool-view-compatible result, and error on unknown peers. `reeboot/src/extensions/a2a-client.ts` `a2aInvoke` POSTs to `${url}/a2a/invoke` with `Authorization: Bearer <apiKey>`; `reeboot/src/extensions/delegate.ts` routes `peer`-flagged calls through it, returns a `data-table` view, and returns `Unknown A2A peer: "<peer>"...` for missing peers. Confirmed by `a2a-client.test.ts`, `delegate-tool.test.ts`, `config-resolution.test.ts`. Minor note: the unknown-peer message appends "Configured peers: …" beyond the spec's quoted string, but contains the required prefix and peer name.

### A2A server handles incoming requests
verdict:  ✅ SATISFIED
reason:   spec requires `POST /a2a/invoke` to execute the task in a sub-agent session and return 200, and to return 401 for unauthenticated requests when a key is configured. `reeboot/src/server.ts:888-960` implements the route: it validates the optional `server.apiKey` (401 on mismatch), then calls `createRunner(...)` + `runner.prompt(task, …)` and returns `{ status: 'completed', id, result }`. Config schema `A2AServerSchema.apiKey` exists at `reeboot/src/config.ts:75`. Caveat: `a2a-endpoints.test.ts` and `a2a-security.test.ts` exercise inline mock Hono apps, not the real `server.ts` routes — but the real handlers are present and match the spec.

### agent delegates sub-task to a same-process sub-agent
verdict:  ✅ SATISFIED
reason:   spec requires a `delegate` tool via `ExtensionAPI.registerTool()` that creates an `AgentRunner` session, injects the task as the user message, runs to completion, returns structured text + a view-compatible result, works on pi (`PiAgentRunner`) and ree (`ReeAgentRunner`) runtimes, inherits the main agent's model, shares the main agent's tools, and aborts on timeout (default 60s). `reeboot/src/extensions/delegate.ts` registers the tool, calls `factory(task).prompt(task, …)`, races a 60s-default timeout with `runner.abort()`, and returns a `data-table` view. Wiring confirmed: `loader.ts:196-198` (pi) and `:372-376` (ree) call `delegateExtension`; `server.ts:223-271` sets the default factory to `createRunner(...)`; `agent-runner/index.ts:30,45` returns `new PiAgentRunner` / `new ReeAgentRunner`. The factory passes the main `opts.config` (same model/provider/tools). 38/38 delegate tests pass. Caveat: the pi/ree/tool-inheritance scenarios are asserted only via mock runners, but the real runner-construction path is verified in source.

## Triage

✅ Safe to skip:   A2A peer discovery, A2A task invocation, A2A server handles incoming requests, agent delegates sub-task to a same-process sub-agent

ℹ️  Non-blocking observations (not contract gaps, since real implementations match): (a) A2A server endpoint tests use inline mock Hono apps instead of exercising `server.ts` routes; (b) pi/ree runtime and tool-inheritance scenarios are tested only with mock runners, not the real `PiAgentRunner`/`ReeAgentRunner`; (c) unknown-peer error message appends "Configured peers: …" beyond the spec's quoted string.

---
