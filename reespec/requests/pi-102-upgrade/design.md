# Design — pi-102-upgrade

## Context

Reeboot ships two modes over one shared tool layer:
- **pi mode** — `PiAgentRunner` → pi SDK → pi-ai (OpenAI **Responses** API).
- **ree mode** — `ReeAgentRunner` → TanStack AI directly (OpenAI **Chat Completions**).

Both consume the same SDK-agnostic reeboot `ToolDefinition`s (`extension-api.ts`) registered
through the `ToolRegistry`. The incohub customer deployment runs **ree mode** and its
`register-company` collection turn 400s: OpenRouter rejects reeboot's bundled tools
(`session_search`, `delegate`) because TanStack's tool converter forces their optional params
into a `strict:true` OpenAI shape.

Discovery reproduced this empirically (ree mode + incohub config + logging proxy + live
OpenAI-compatible backend) and established the root cause precisely.

## Root cause (verified)

The strict-mode coercion is entirely inside `@tanstack/openai-base`'s
`chat-completions-tool-converter.ts`. For each tool it calls:

```
isStrictModeCompatible(inputSchema)
  → if FALSE: emit { strict:false, parameters: original schema }
  → if TRUE : emit { strict:true, parameters: coercedSchema }   ← reeboot's tools land here
```

`isStrictModeCompatible` returns true when the schema has no strict-unsupported keyword
(`oneOf`/`allOf`/`not`/`$ref`/`$defs`) and no typeless node. Reeboot's `session_search`/`delegate`
use `Type.Optional` → every property has a `type`, no unsupported keyword → **returns true**.
So the converter coercively rewrites them via `makeStructuredOutputCompatible`:
optional props (limit/peer/timeout) get null-widened (`["number","null"]`), all properties are
moved into `required`, `additionalProperties:false`, and `strict:true`. OpenRouter/OpenAI reject
the null-widened/forced-required shape → `400 Invalid schema ... Missing 'peer'`.

**pi mode does not have this problem.** pi-ai emits the same tools with `strict:false` and the
optional props respected. This is why a shared-schema "fix" (forcing optionals into `required`)
would break pi — the two layers treat identical schemas differently, and reeboot must not couple
them.

## Key constraint (from discovery)

The `strict:true/false` decision is made by `isStrictModeCompatible` **before** the
`schemaConverter` runs, and the `schemaConverter` argument only shapes the *content* of the
strict:true path. There is **no per-tool strict override** in the TanStack tool API
(`@tanstack/ai` 0.64.0 exposes only `inputSchema`/`outputSchema`/`needsApproval`/`lazy`/`metadata`).
Updating to latest TanStack does **not** fix this (openai-base 0.12.2 has the identical gate).

So the fix must live where reeboot already controls the adapter — and reeboot constructs that
adapter itself in `ReeRuntime.createTanStackClient()`.

## Approach

### Part A — Bump the pi runtime (pi → 1.0.2)

Bump `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`
from `0.84.1` to `1.0.2` (exact pins). Discovery verified every source surface reeboot consumes
survives: `createAgentSession` options (`model`/`modelRuntime`/`settingsManager`/`resourceLoader`/
`sessionManager`/`cwd`/`agentDir`), `SessionManager.open/create/inMemory`, `SettingsManager.inMemory`,
`ModelRuntime.create/setRuntimeApiKey`, `AgentSession.subscribe/prompt/abort/bindExtensions`, the
event shapes (`message_update`→`assistantMessageEvent`, `tool_execution_start/end`, `agent_end`→
`messages`), the private `_extensionRunner.emit(session_shutdown)` / `sessionManager.getSessionFile()`
reaches, and pi-ai's `getBuiltinModel`/`getBuiltinProviders` + `Model` (baseUrl/id/name). Reeboot's
tool set does not silently gain pi 0.99+'s built-in extensions (codemode/mcp/tool-search/llama.cpp)
because reeboot builds its own `DefaultResourceLoader` with only its own `extensionFactories`.

### Part B — Bump the TanStack provider group (together)

Bump `@tanstack/ai` → 0.64.0, `@tanstack/ai-openai` → 0.26.0, `@tanstack/ai-anthropic` → 0.19.4,
`@tanstack/ai-groq` → 0.8.2, `@tanstack/ai-mcp` → 0.7.0. They are peer-locked to `@tanstack/ai
^0.64.0` so they must move as one group. Discovery verified the ree usage surface survives:
`chat()`, `toolDefinition()`, `maxIterations()`, `ModelMessage`, the `chat()` options reeboot uses
(`adapter`/`systemPrompts`/`mcp`/`abortController`), `openaiCompatibleText`/`createOpenaiChat`/
`anthropicText`/`groqText`, and `createMCPClient`.

### Part C — Strict-mode fix at the ree integration layer

The fix is a reeboot-owned adapter override, leaving shared tool schemas untouched.

**Where:** `ReeRuntime.createTanStackClient()` builds the OpenAI-compatible text adapter. Replace
the raw `openaiCompatibleText(...)` for the `custom`/`ollama`/`lmstudio` (Chat Completions) provider
branch with a reeboot-owned adapter (subclass the OpenAI-compatible chat adapter, or wrap
`openaiCompatibleText`'s returned adapter) that overrides the tool-emission step.

**What it does:** before/at tool emission, for each tool decide strict mode using the **original
reeboot schema** rather than TanStack's blind `isStrictModeCompatible`. If the tool's schema has
any property **not** listed in `required` (a genuinely-optional param like `limit`/`peer`/`timeout`),
emit `{ strict:false, parameters: original schema }` — the pass-through branch TanStack already has.
Tools whose params are all required may keep `strict:true`.

**Mechanism (proposed):** override `mapOptionsToRequest` (protected on
`OpenAIBaseChatCompletionsTextAdapter`) to run the base conversion, then post-process the returned
`request.tools`: for each tool, decide strict from the reeboot schema (carried on the tool, e.g. via
`tool.metadata`, so the adapter still has the original definition) and rewrite `strict`/`parameters`
as above. This keeps the shared `ToolDefinition` unchanged and confines the change to ree mode.

**Why not edit the schemas:** forcing optionals into `required` in `session_search`/`delegate`
would make pi-ai emit them with optionals forced too (pi currently emits them correctly), silently
degrading pi mode. Rejected.

**Why not a `metadata` marker consumed by a global patch:** reeboot must not patch/pin the
`@tanstack/openai-base` internals; the adapter-subclass keeps the dependency as a normal dependency
while making reeboot's intent explicit at the boundary it already owns.

## Tradeoffs

- **Adapter subclass couples ree mode to TanStack's adapter API**, but that is already the case
  (ree mode is TanStack-native); the tool layer stays SDK-agnostic, which is the stated goal.
- **Post-processing request.tools** relies on TanStack's `mapOptionsToRequest` shape; if it changes
  across the 0.64 bump, the override adapts (the RED test pins the emitted `strict` per tool).
- **Behavior preserved**: no change to how tools execute or how the agent loops; only the wire
  shape for optional-param tools in ree mode changes (strict:true → strict:false).

## Risks

- **Behavioral drift from major bumps (pi 1.0.2, TanStack 0.64)** that the type surface won't catch
  (how streaming/events/tool results are emitted). Mitigated by the full reeboot test suite plus
  the empirical E2E gate (Part F).
- **Azure/Vertex peer-dependency**: ai-anthropic 0.19.4 peers on `@anthropic-ai/vertex-sdk ^0.19.0`;
  only relevant if reeboot wires Vertex (it does not today), so no action.
- **Bumping a broad TanStack group** could surface unrelated ree-mode behavioral changes; these are
  caught by the ree runtime tests and the E2E gate.

## What stays reeboot-owned / unchanged

- The shared `ToolDefinition` schemas (`session_search`, `delegate`, memory, knowledge, etc.) are
  **not modified**.
- pi mode (pi-ai) emission is untouched.
- The `AgentRunner`/`RunnerEvent` interface and the swap seam are unchanged.

## Verification (acceptance gate)

After the migrations + fix, run the agent in **ree mode with the incohub config** (sdk:ree, custom
provider → OpenAI-compatible endpoint, `core.delegate:false`, `extensions.incohub.services:
["register-company"]`), baking the incohub extension + schema + brief, through a logging proxy to a
live OpenAI-compatible backend. Assert:
1. The `register-company` collection turn **completes** (no strict-mode 400) and the agent performs
   at least one schema-driven collection tool call (`set_field`/`add_group_item`/etc.).
2. Reeboot's bundled tools (`session_search`, `delegate`) are emitted with `strict:false` and
   optional params respected.
3. (pi mode) the same tools still emit `strict:false`/optional-respected — confirming no regression.

## Follow-ups (out of scope)

- Wiring custom/local provider runtime streaming via `modelRuntime.registerProvider` (separate).
- A dedicated test-suite/reliability reassessment (separate from this migration).
