# Tasks — hot memory

## 1. Hot memory file utilities

Create the core file operations: init, read, write, parse, and format hot memory entries.
This is the data layer — no LLM, no hooks, no pi dependencies.

- [x] **RED** — Write `reeboot/tests/extensions/hot-memory.test.ts`:
  - `initHotMemoryFile(dir)` creates `hot-memory.md` with a `# HOT MEMORY` header when absent; is a no-op when it exists
  - `readHotMemoryFile(dir)` returns empty string when no file exists
  - `formatHotMemoryEntry({ date, title, summary, conclusions })` returns a properly formatted markdown block
  - `parseHotMemoryFile(content)` parses entries back into structured objects
  - Run `npx vitest run reeboot/tests/extensions/hot-memory.test.ts` — fails (no imports resolve)
- [x] **ACTION** — Create `reeboot/src/extensions/hot-memory.ts` with:
  - `HOT_MEMORY_HEADER = '# HOT MEMORY — Recent Sessions\n\n'`
  - `HotMemoryEntry` interface: `{ date: string; title: string; summary: string; conclusions?: string }`
  - `initHotMemoryFile(dir: string): void` — creates file with header if absent
  - `readHotMemoryFile(dir: string): string` — reads file, returns '' if absent
  - `formatHotMemoryEntry(entry: HotMemoryEntry): string` — formats as `## date — title\nSummary: ...\nConclusions: ...\n`
  - `parseHotMemoryFile(content: string): HotMemoryEntry[]` — parses entries from markdown
  - Export all functions
- [x] **GREEN** — Run `npx vitest run reeboot/tests/extensions/hot-memory.test.ts` — passes

## 2. Prune hot memory entries (rolling window)

Keep the hot memory bounded: max 6 entries, min 4, entries older than 3 days pruned.

- [x] **RED** — Add tests to `reeboot/tests/extensions/hot-memory.test.ts`:
  - `pruneEntries(entries, 6, 3)` with 8 entries keeps the 6 most recent
  - `pruneEntries(entries, 6, 3)` with entries older than 3 days prunes them, but keeps minimum 4
  - `pruneEntries(entries, 6, 3)` with 2 entries (under min) keeps all 2
  - Run `npx vitest run reeboot/tests/extensions/hot-memory.test.ts` — fails (pruneEntries doesn't exist)
- [x] **ACTION** — Add `pruneEntries` to `reeboot/src/extensions/hot-memory.ts`:
  - `pruneEntries(entries: HotMemoryEntry[], maxEntries?: number, maxDays?: number): HotMemoryEntry[]`
  - Sort entries by date descending (most recent first)
  - Remove entries older than `maxDays` unless fewer than `minEntries` would remain
  - If still over `maxEntries`, keep the `maxEntries` most recent
  - Defaults: `maxEntries=6`, `maxDays=3` (hardcoded, used internally)
  - `minEntries` is computed as `Math.min(4, maxEntries)`
  - Export the function
- [x] **GREEN** — Run `npx vitest run reeboot/tests/extensions/hot-memory.test.ts` — passes

## 3. Build hot memory system prompt block

Format the hot memory content into a system prompt block with retrieval instructions.

- [x] **RED** — Add tests to `reeboot/tests/extensions/hot-memory.test.ts`:
  - `buildHotMemoryBlock(content)` with entries returns a string containing `[HOT MEMORY]`, the entries, and instructions about `session_search`
  - `buildHotMemoryBlock('')` returns `''` (empty string for empty hot memory)
  - The instructions mention checking hot memory first, then using `session_search`
  - Run `npx vitest run reeboot/tests/extensions/hot-memory.test.ts` — fails (buildHotMemoryBlock doesn't exist)
- [x] **ACTION** — Add `buildHotMemoryBlock` to `reeboot/src/extensions/hot-memory.ts`:
  - If content is empty, return `''`
  - Otherwise return a formatted block with:
    - Opening `[HOT MEMORY]` header
    - Retrieval instructions: "If the user references a past conversation, check this hot memory for a matching topic. If found, call session_search with relevant terms. If no match, ask the user if it was from more than a few sessions ago and do a broader session_search."
    - The hot memory entries
    - Closing `[END HOT MEMORY]`
- [x] **GREEN** — Run `npx vitest run reeboot/tests/extensions/hot-memory.test.ts` — passes

## 4. Distillation: hook session_shutdown to generate session summary

When a session closes (inactivity reset), read recent messages from the DB, call the LLM to distill, and write to hot memory.

This task creates the distillation pipeline. The LLM call is abstracted behind a function parameter (injectable for testing).

- [x] **RED** — Write `reeboot/tests/extensions/hot-memory-distill.test.ts`:
  - Create a temp directory with empty hot memory file
  - Create an in-memory SQLite DB with `messages` table seeded with 3 messages from a conversation
  - Call `distillSession({ db, hotMemoryDir, llmCall })` where `llmCall` is a mock that returns a known summary
  - Assert the hot memory file now contains an entry matching the mock summary
  - Assert the entry has the correct format (date, title, summary)
  - Run `npx vitest run reeboot/tests/extensions/hot-memory-distill.test.ts` — fails
- [x] **ACTION** — Add `distillSession` to `reeboot/src/extensions/hot-memory.ts`:
  - `async function distillSession(opts: { db: Database; hotMemoryDir: string; lastDistillTimestamp?: string; llmCall: (prompt: string) => Promise<string> }): Promise<void>`
  - Query `messages` table for messages since `lastDistillTimestamp` (or all messages if none)
  - If no new messages, return early (no-op)
  - Build a prompt: "Generate a 2-3 line summary of this conversation. Include the main topic, key conclusions, and any open threads. Be brief. Then suggest a short title (max 6 words). Format: TITLE: <title>\nSUMMARY: <summary>\nCONCLUSIONS: <conclusions>"
  - Call `llmCall(prompt)`
  - Parse the response into a `HotMemoryEntry`
  - Read current file, prepend new entry, prune, write back
  - The `llmCall` parameter is the abstraction boundary — tests inject a mock; production code uses the agent's configured model (see task 5)
- [x] **GREEN** — Run `npx vitest run reeboot/tests/extensions/hot-memory-distill.test.ts` — passes

## 5. Wire distillation into session_shutdown hook

Connect the session_shutdown event (fired on runner.reset) to the distillSession function via the pi extension API.

- [x] **RED** — Write `reeboot/tests/extensions/hot-memory-wiring.test.ts`:
  - Create a mock ExtensionAPI that records which hooks are registered
  - Call `makeHotMemoryExtension(mockApi, config)` 
  - Assert `on('session_shutdown', handler)` was called
  - Run `npx vitest run reeboot/tests/extensions/hot-memory-wiring.test.ts` — fails
- [x] **ACTION** — Add `makeHotMemoryExtension(pi: ExtensionAPI, config: any)` to `reeboot/src/extensions/hot-memory.ts`:
  - Registers `pi.on('session_shutdown', handler)` where handler:
    - Checks `event.reason === 'new'` (skip quit/timeout reasons)
    - Gets DB via dynamic `import('../db/index.js').getDb()`
    - Gets hot memory dir: `join(homedir(), '.reeboot', 'memories')`
    - Calls `distillSession` with a production `llmCall` that uses the **agent's own configured model** from `config.agent.model.provider` + `config.agent.model.id`
    - The production `llmCall` resolves the API key via `resolveProviderEnvKey` (from pi-runner.ts) and makes a direct HTTP request to the provider's chat completions endpoint — no hardcoded model, no pi SDK dependency
    - Wraps everything in try/catch so failures don't crash the process
  - Registers `pi.on('before_agent_start', handler)` where handler:
    - Reads hot memory file
    - Calls `buildHotMemoryBlock(content)` 
    - If non-empty, injects into system prompt: `return { systemPrompt: (event.systemPrompt ?? '') + block }`
  - Exports `makeHotMemoryExtension` and the default export function
- [x] **GREEN** — Run `npx vitest run reeboot/tests/extensions/hot-memory-wiring.test.ts` — passes

## 6. Register hot memory extension in loader

Add the hot-memory extension to the bundled extension factories in the loader, loaded after memory-manager.

- [x] **RED** — Add test to `reeboot/tests/extensions/hot-memory-wiring.test.ts`:
  - Call `getBundledFactories(context, config)` with default config
  - Find the hot-memory factory in the returned list
  - Assert it's present and registered after the memory-manager factory
  - Run test — fails (hot-memory not in factories)
- [x] **ACTION** — In `reeboot/src/extensions/loader.ts`:
  - Add a `hotMemoryEnabled` flag (defaults to true, no config flag needed — always on like capabilities)
  - Import hot-memory extension factory via `importExt('hot-memory')`
  - Push it into the factories list AFTER memory-manager and BEFORE capabilities (capabilities must be last since it discovers all tools)
  - Re-export `makeHotMemoryExtension` for testing
- [x] **GREEN** — Run test — passes. Also run `npx vitest run reeboot/tests/extensions/hot-memory-wiring.test.ts` — passes

## 7. Integration: verify end-to-end hot memory flow

Full end-to-end test: server starts, messages exchanged, session reset triggers distillation, new session sees hot memory.

- [x] **RED** — Write `reeboot/tests/hot-memory-integration.test.ts`:
  - Create temp server environment (reusable from existing integration test patterns)
  - Seed `messages` table with several conversation turns
  - Call `distillSession` directly (simulating session_shutdown)
  - Verify hot memory file now has an entry
  - Verify `buildHotMemoryBlock` returns non-empty when called with that file
  - Assert the output contains the expected topic
  - Run test — currently fails because nothing exists yet
- [x] **ACTION** — No separate code change — all implementation steps are covered by tasks 1-6. This test verifies the integration works end to end.
- [x] **GREEN** — Run `npx vitest run reeboot/tests/hot-memory-integration.test.ts` — passes. Also run full test suite: `npx vitest run reeboot/tests/ --reporter=verbose` — passes.

## 8. Verify no regression on session_search, memory tool, and consolidation

Ensure existing memory/session systems are unaffected by the new extension.

- [x] **RED** — Run existing memory and session tests BEFORE any implementation changes:
  - `npx vitest run reeboot/tests/extensions/memory-manager.test.ts` — passes
  - `npx vitest run reeboot/tests/memory-consolidation.test.ts` — passes (if exists)
  - `npx vitest run reeboot/tests/extensions/ --reporter=verbose` — records baseline
  - Assertion: all existing memory tests pass before changes
- [x] **ACTION** — No code change — verification step only
- [x] **GREEN** — After all implementation tasks (1-7), re-run the same tests:
  - `npx vitest run reeboot/tests/extensions/memory-manager.test.ts` — still passes
  - `npx vitest run reeboot/tests/memory-consolidation.test.ts` — still passes
  - `npx vitest run reeboot/tests/extensions/ --reporter=verbose` — all pass, same as baseline
