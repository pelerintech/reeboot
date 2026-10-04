# Capability: tanstack dependency upgrade

Reeboot's TanStack provider group is brought current, as a coordinated group, and reeboot's
ree-mode agent loop keeps working against the new SDK.

## Scenarios

### The TanStack provider group is bumped together

GIVEN reeboot pins the TanStack provider packages at older majors
WHEN the dependency task completes
THEN `reeboot/package.json` declares `@tanstack/ai` at `^0.64.0`
AND `@tanstack/ai-openai` at `^0.26.0`
AND `@tanstack/ai-anthropic` at `^0.19.4`
AND `@tanstack/ai-groq` at `^0.8.2`
AND `@tanstack/ai-mcp` at `^0.7.0`.

### The resolved TanStack tree lands on the new versions

GIVEN the dependency files are updated
WHEN `npm install` runs and the tree is inspected
THEN `npm ls @tanstack/ai` resolves to `0.64.0`
AND `npm ls @tanstack/ai-openai`, `ai-anthropic`, `ai-groq`, `ai-mcp` resolve to their new versions.

### Ree mode still runs the agent loop against the new SDK

GIVEN the TanStack major bump (0.39 → 0.64)
WHEN a ree-mode collection turn runs
THEN `chat()`/`toolDefinition()`/`maxIterations()` still drive the loop
AND tool calls execute and results stream back
AND the `agentLoopStrategy` (maxIterations) is honoured.

### Provider clients still construct correctly

GIVEN ree mode configures a provider
WHEN `createTanStackClient()` builds the adapter
THEN `openaiCompatibleText`/`createOpenaiChat`/`anthropicText`/`groqText` return a usable adapter
AND `createMCPClient` (from `@tanstack/ai-mcp`) still connects with a stdio transport.

### Typecheck and build remain green

GIVEN the provider SDK surface changed across the major bump
WHEN the migration lands
THEN `npm run build` succeeds AND `tsc --noEmit` reports no errors.
