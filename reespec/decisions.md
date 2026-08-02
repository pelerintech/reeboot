### Pi-runner injection scanner discarded modified toolResult — event.result passed instead of toolResult — 2026-05-25 (Request: security-hardening)

During post-evaluation gap remediation, adding proper assertions to the pi-runner tool-scanning tests
revealed a real bug: the injection scanner correctly computed WARNING-prefixed (owner) and BLOCKED-replaced
(end-user) tool results, but the `onEvent(...)` call in the `tool_execution_end` handler passed `event.result`
(the unmodified original) instead of `toolResult` (the modified copy). The scanner logic ran and computed
the right output, but the modified result was silently discarded. Fixed by changing `result: event.result`
to `result: toolResult` in `src/agent-runner/pi-runner.ts`. The existing non-assertion tests (which only
checked `capturedEvents.length >= 0`) could not detect this — the new assertions (checking for WARNING/BLOCKED
in the event) caught it immediately. See request artifacts and evaluation for full context.

# Decisions

Architectural and strategic decisions across all requests.
One decision per entry. One paragraph. Reference the request for details.

## Entry format

### <Decision title> — YYYY-MM-DD (Request: <request-name>)

What was decided and why. What was considered and rejected.
See request artifacts for full context.

---

## What belongs here
- Library or technology choices with rationale
- Architectural patterns adopted
- Approaches explicitly rejected and why
- Deviations from the original plan with explanation
- Decisions that constrain future work

## What does NOT belong here
- Activity entries ("added X", "removed Y", "refactored Z")
- Implementation details available in request artifacts
- Decisions too small to affect future planning

---

<!-- decisions below this line -->

### Delegate tool uses lazy dependency resolution + global runner factory setter — 2025-07-26 (Request: a2a-protocol)

During execution, the evaluation found that the delegate extension was loaded with empty options `{}`
from `loader.ts`, leaving `runnerFactory`, `a2aClient`, and `a2aPeers` all undefined. The original
approach required all dependencies to be injected at registration time, but the loader had no access
to the SDK-specific runner factory (which lives in `server.ts`/`agent-runner/index.ts`) and no
pass-through of the A2A config. Fixed with a hybrid approach: `setDefaultRunnerFactory()` is a
module-level setter called by `server.ts` at startup with a factory that creates `PiAgentRunner`
or `ReeAgentRunner`; A2A peers are resolved from `ctx.config.a2a.peers` at execution time via
`resolveA2APeersFromConfig()`; the A2A HTTP client is lazy-imported from `a2a-client.js` to avoid
circular dependencies. This keeps the delegate tool SDK-agnostic (no direct import of runner
implementations) while making it work in production without pre-registration. Explicit `opts`
still win when provided (for testing and edge cases).

See request `a2a-protocol` artifacts for full context.

### Observability audit view is driven by the `events` table, not `operational_logs` — 2026-07-17 (Request: observability-audit-view)

The operator-facing observability page (a window into what the agent did over time and why tasks
succeeded or failed) is backed by the curated `events` audit trail — typed domain events
(`turn_started`/`turn_completed`/`turn_failed` with reason payloads, budget/channel/capability/
scheduler events, OTEL severity, `trace_id`/`context_id` correlation) — surfaced as a **turn-grouped
rollup** so each task reads as one expandable unit. This reverses the `web-api-readback` approach,
which pointed the page at raw `operational_logs` and, to make that substantive, lowered DB log
persistence from warn+ to info+ (`logger.ts:89`). That was spec-satisfied but the wrong substrate:
raw log lines are low-signal for auditing agent behavior and info-level DB persistence floods the
store (millions of rows under support fan-out), obscuring the signal. Info/debug logs revert to
stdout + rotating file (operator debugging), `operational_logs` returns to warn+, and `events`
growth is deliberately bounded (severity-tiered retention and/or per-context row cap). The audit page
is an operator surface (owner in pi mode, company operator in support mode) — never exposed to end
customers. See the `observability-audit-view` request artifacts for full context.

### Injected test DBs bypass full schema migration — tests must create tables explicitly — 2026-07-17 (Request: web-api-readback)

When `startServer({ db, ... })` is called with an injected `better-sqlite3` handle, the server
calls only `createContextsTable(db)` and creates the `main` context — it does NOT run
`applySchema(db)` which creates `messages`, `tasks`, `channels`, and `usage` tables. This means
tests that seed data into those tables must create them first (e.g., via `CREATE TABLE IF NOT EXISTS`
SQL in a `beforeEach` helper). This is by design: the injected-DB path is used for lightweight
testing where the full schema is overkill. Future tests using this pattern must follow the same
approach — create only the tables their test needs.

### WebSocket sessionId hoisted to factory scope for shared closure access — 2026-07-17 (Request: web-api-readback)

During the full-build integration gate, `tsc` failed with `Cannot find name 'sessionId'` at the
`onMessage` and `onClose` handlers in the WebSocket upgrade factory (`server.ts`). The `sessionId`
was declared with `const` inside `onOpen` but the sibling handlers referenced it out of scope.
Fixed by hoisting `const sessionId = nanoid()` to the factory function scope above the returned
object literal. This is a pre-existing latent bug that was never surfaced because the handlers
return `undefined` for `sessionId` at runtime (peer routing silently broken in production).
Any future work touching the WebSocket handlers should verify that `sessionId` propagates
correctly into `onMessage` and `onClose`.

### Centralized capabilities discovery extension replaces per-tool promptSnippet — 2026-05-22 (Request: agent-capabilities)

A new `capabilities.ts` bundled extension hooks `before_agent_start`, calls `pi.getAllTools()` to discover every registered tool dynamically, filters out pi built-ins, and injects a structured capabilities block into the system prompt. This replaces the scattered `promptSnippet` approach which was easy to forget and missed user extensions entirely. The extension is always-on, placed last in the loader order so it sees the full tool set, and emits a `capabilities_injected` observability event. Per-tool `promptSnippet` additions are no longer required for reeboot bundled tools.

### Memory consolidation job registration moved from extension load to session_start — 2026-05-22 (Request: agent-capabilities)

The memory extension's `__memory_consolidation__` scheduled job was previously registered inside `makeMemoryExtension` at extension load time, when `globalScheduler` was still `noopScheduler`. The fix moves registration to a `session_start` event handler with a module-level `_consolidationRegistered` guard against double-registration. A `noopScheduler` export was added to `scheduler-registry.ts` so the handler can distinguish the real scheduler from the stub. This ensures consolidation actually fires after server startup.

### WhatsApp _connect() is a proper awaitable — resolves on 'open', rejects on 'close'/timeout — 2026-05-21 (Request: whatsapp-resilience)

Previously `_connect()` was async but returned immediately after registering Baileys event handlers. The reconnect handler treated `await this._connect()` as "connection established" when it actually meant "event handlers registered". The fix makes `_connect()` return a `Promise<void>` that resolves when `connection.update { connection: 'open' }` fires and rejects on `connection.update { connection: 'close' }` or `CONNECT_TIMEOUT_MS` (30s) watchdog. This is the foundational change that enables the persistent retry loop. Any future code that calls `_connect()` must be aware it now truly awaits connection establishment.

### WhatsApp reconnect uses persistent _reconnectLoop(), not recursive event handler — 2026-05-21 (Request: whatsapp-resilience)

`_reconnecting` previously served dual purpose: reconnect guard and stop sentinel. It was set to `true` by `stop()` to prevent reconnect and set in the close handler to prevent double-entry. After the ebe5c69 regression, `_reconnecting` would stay `true` permanently if `_connect()` returned without a `'close'` event. The fix: `_stopping` (set only by `stop()`) is the stop sentinel; `_reconnecting` guards loop entry only; `_reconnectLoop()` is a `while (!this._stopping)` loop that properly `await`s each `_connect()` call and retries on rejection with exponential backoff. The `connection.update 'close'` handler on post-connect sockets starts the loop once; subsequent closes during reconnect are handled by the running loop catching the rejection.

### Restart=always with StartLimitBurst=5/120s replaces Restart=on-failure — 2026-05-21 (Request: whatsapp-resilience)

`Restart=on-failure` only triggers on non-zero exits. A hung process (alive but socket dead) never triggers it. `Restart=always` triggers on any exit including clean exits, covering both crash and hung-process scenarios (the hung process requires `reeboot stop` or an OS reboot to trigger restart — but L1/L2 fixes prevent the hung state). `StartLimitBurst=5` within `StartLimitIntervalSec=120` prevents crash loops: if reeboot crashes 5 times in 2 minutes, systemd stops restarting.

### Signal receipt timestamps must be sent in milliseconds, not seconds — 2026-05-15 (Request: presence-feedback)

The `markRead` implementation initially sent `Math.floor(msg.timestamp / 1000)` (converting IncomingMessage's ms timestamp to seconds) to the signal-cli-rest-api `/v1/receipts` endpoint. Source research (signal-cli-rest-api `client.go` + signal-cli `DateUtils.java`) confirms signal-cli passes the timestamp as-is to its internal `sendReceipt -t` command, which expects Java milliseconds (`new Date(timestamp)`). Sending seconds caused the receipt to silently target a message around January 1970. Fixed: `markRead` now sends `msg.timestamp` directly (no conversion). The `_handleIncomingMessage` fallback was also corrected from `Math.floor(Date.now() / 1000)` to `Date.now()`. Any future Signal integration that stores or forwards timestamps must preserve the ms unit throughout.

### Two READMEs and docs/ are the single source of documentation — 2026-05-08 (Request: docs-overhaul)

All user-facing documentation lives in exactly three places: `/README.md` (marketing/presentation), `/reeboot/README.md` (install + usage essentials), and `/docs/` (full reference, feeds the Astro docs site). Any other markdown file that attempts to document user-facing behaviour is redundant and should be removed or migrated. The one exception is `reeboot/src/channels/CHANNEL_CONTRACT.md` — a developer contract spec tightly coupled to the channel test suite. It is mirrored into `docs/extending/channel-adapters.md` but the canonical source remains in `src/channels/` next to the code it governs. Both READMEs and all pages under `docs/` must be kept current as features are added or changed — documentation updates are part of the definition of done for every future request that changes user-facing behaviour.

### Pino as the single operational logger across all reeboot modules — 2026-05-07 (Request: observability-system)

Pino replaces all `console.*` calls across `src/`. A singleton `getLogger()` is exported from `src/observability/logger.ts`, with stdout NDJSON transport and async file transport at `~/.reeboot/logs/`. Channels receive pino child loggers (`logger.child({ component: 'whatsapp' })`) at `warn` level to suppress Baileys protocol noise while surfacing real errors. Using pino as the single structured logger was the only serious option: it was already in the dependency tree via `@whiskeysockets/baileys`, has the lowest overhead of any Node.js logger, and native multistream support allows stdout + file + SSE in one instance. Winston and Bunyan were rejected on performance and API grounds.

### Turn journal promoted to permanent audit record — 2026-05-07 (Request: observability-system)

`TurnJournal.closeTurn()` previously deleted the row on success (leaving only crash evidence as open rows). It now performs `UPDATE turn_journal SET status = 'closed', closed_at = datetime('now')` instead. Closed rows are retained as permanent audit evidence and pruned after `retention_days` (default 30) by `pruneTurns()`. `getOpenJournals()` continues to filter by `status = 'open'` so crash recovery logic is unaffected. The existing `turn-journal.test.ts` test that asserted deletion was updated to assert `status = 'closed'` and `closed_at` is set.

### OTEL-ready schema for events table — 2026-05-07 (Request: observability-system)

All audit events written by `emitEvent()` include `trace_id` (32-char hex, 16 bytes), `span_id` (16-char hex, 8 bytes), `created_ns` (Unix epoch in nanoseconds), and `severity` (OTEL severity numbers: 9=INFO, 13=WARN, 17=ERROR, 21=FATAL). These fields map directly to OTEL `LogRecord` fields without schema migration when the OTEL exporter adapter is added in the next request (`observability-otel`). No OTEL SDK is added in this request — the exporter is a pure read-and-forward step over the existing `events` table.

### SQLite datetime parsing requires UTC suffix when used with JavaScript Date — 2026-05-07 (Request: observability-system)

SQLite's `datetime('now')` returns strings in `'YYYY-MM-DD HH:MM:SS'` format without timezone information. JavaScript's `new Date('2026-05-07 19:20:15')` parses this as local time (not UTC), causing time comparisons to fail when the server runs in a non-UTC timezone. The fix: when parsing SQLite datetime strings in JavaScript, replace the space with `T` and append `Z` before constructing a `Date`: `new Date(str.replace(' ', 'T') + 'Z')`. This is applied in `scheduler.ts`'s retry-after expiry check and should be used consistently anywhere SQLite datetime strings are compared to `Date.now()`.

### US-3 spec prescription (send_message tool) rejected — auto-routing retained — 2026-04-23 (Request: agent-continuity)

The unified-scheduling spec (US-3) required the enriched scheduled-task prompt to instruct the agent to call a `send_message` tool for delivery. The implementation instead uses orchestrator auto-routing: when `channelType === 'scheduler'`, `_reply()` reads `origin_channel`/`origin_peer` from `msg.raw` and routes directly to the correct adapter. A `send_message` tool was rejected because it would create double-delivery (tool delivers AND `_reply` delivers), adds fragility (agent must remember to call the tool), and splits responsibility that belongs in the transport layer. The spec was written before the design settled on this approach. US-5 (delivery reaches correct adapter) is fully satisfied. The JSDoc on `buildScheduledPrompt` now reflects the actual mechanism.

### User message persisted before turn loop, not after success — 2026-04-23 (Request: agent-continuity)

MP-1 requires the user message row to be written on all turn outcomes (success, error, timeout). The initial implementation placed the INSERT after the success `break`, so error and timeout paths returned without writing. Fixed by moving the user-message INSERT to immediately before the `while` retry loop — it fires once, unconditionally (for non-synthetic channels), regardless of how the turn ends. The assistant message INSERT stays in the success path only (MP-3: no assistant row on failed turns).

### Session resume uses .jsonl filter matching pi's actual SessionManager output — 2026-04-23 (Request: agent-continuity)

`getResumedSessionPath` previously filtered for `session-*.json` files. Pi's `SessionManager` creates files named `<ISO-timestamp>_<uuid>.jsonl`. The filter was updated to `f.endsWith('.jsonl')`. The `listSessions` function retains its old `session-*.json` filter — it is used for the REST API session listing, not for resume, and is a separate concern.

### memory-manager and knowledge-manager moved to src/extensions/ — 2026-04-23 (Request: agent-continuity)

Both extensions were in `reeboot/extensions/` which is outside `tsconfig.json`'s `rootDir: "./src"`. They were never compiled into `dist/`. Both moved to `src/extensions/` so they compile alongside all other bundled extensions. The outer `extensions/` directory now only contains the sandbox extension (which has its own build path). Import paths in `knowledge-manager.ts` were corrected from `../src/config.js` to `../config.js`.

### memory-manager receives config as second argument, uses require() for DB and scheduler — 2026-04-23 (Request: agent-continuity)

`makeMemoryExtension` previously called `(pi as any).getConfig?.()`, `(pi as any).getDb?.()`, and `(pi as any).getScheduler?.()` — none of which exist on pi's `ExtensionAPI`. Fixed: config is passed as a second argument from the loader (same pattern as `web-search` and `mcp-manager`); DB is accessed via `require('../db/index.js').getDb()`; scheduler via `require('../scheduler-registry.js').globalScheduler` — same pattern as `scheduler-tool.ts`.

### session_search is always-on — loader always pushes memory-manager factory — 2026-04-23 (Request: agent-continuity)

The loader previously gated the entire memory-manager factory on `memoryEnabled`. Since `session_search` must be always available (per the personal-memory spec), the guard was removed. The factory is now always pushed. `makeMemoryExtension` gates the `memory` tool and `before_agent_start` injection internally based on `config.memory.enabled`.

### Orchestrator writes user+assistant messages to DB after each non-synthetic turn — 2026-04-23 (Request: agent-continuity)

After each successful turn, the orchestrator inserts two rows into the `messages` table: one for the user message, one for the assistant response. Scheduler (`channelType: 'scheduler'`) and recovery turns are excluded — they carry synthetic peer IDs that would pollute the session search index. The write is wrapped in a try/catch so minimal deployments without the messages table are unaffected.

### Channel context header prepended to every non-synthetic prompt — 2026-04-23 (Request: agent-continuity)

Before dispatching to `runner.prompt()`, the orchestrator prepends `[channel: X | peer: Y]\n` to the content for all real channel messages. Scheduler and recovery channel types are excluded (they carry synthetic metadata or already have enriched content). This gives the agent reliable channel and peer identity without requiring a separate tool call.

### timer tool removed — all time-based actions through schedule_task — 2026-04-23 (Request: agent-continuity)

The `timer` tool was removed from `scheduler-tool.ts`. It used an in-memory `setTimeout` that bypassed the orchestrator, survived only for the process lifetime, and had no channel routing. All time-based agent actions now go through `schedule_task` (DB-persisted, survives restart). The `TimerManager` class is retained for the `heartbeat` tool. The sleep interceptor bash hook is retained.

### Scheduler-fired tasks routed via origin_channel/origin_peer in raw field — 2026-04-23 (Request: agent-continuity)

`schedule_task` now accepts and persists `origin_channel` and `origin_peer`. When a task fires, the scheduler passes these fields in `ScheduledTaskRef`, `buildScheduledPrompt` embeds them as routing instructions, and the orchestrator's `_reply` reads them from `msg.raw` when `channelType === 'scheduler'`. If origin is set, reply goes to `_adapters.get(origin_channel)` targeting `origin_peer`. If absent, broadcast to all adapters via `__system__`.

### Channel contract test stubs intentionally fail — 2026-04-23 (Request: channel-policy)

The contract validation stubs (`tests/channels/contract/tier1.contract.test.ts` and `tier2.contract.test.ts`) are designed to fail permanently. They run the shared contract suites against deliberately broken adapter stubs and confirm that every contract clause is exercised. These 10 failures are load-bearing: if they started passing it would mean the contract suite is no longer catching violations. Do not fix them.

### ChannelPolicyLayer wrapping happens in registry, not server.ts — 2026-04-23 (Request: channel-policy)

Tier 1 channel adapters are wrapped in `ChannelPolicyLayer` inside `ChannelRegistry.initChannels()`, before `adapter.init()` is called. This ensures the policy layer intercepts the bus from the moment the channel initialises — wrapping after init would be too late since the inner adapter would already hold a reference to the unwrapped bus. The `TIER1_CHANNEL_TYPES` set in `registry.ts` is the canonical declaration of which channels are Tier 1.

### Contract suite uses setup() hook for adapters requiring transport start — 2026-04-23 (Request: channel-policy)

The Tier 1 contract suite's `Tier1FactoryResult` includes an optional `setup?: () => Promise<void>` function called after `init()` and before inbound/echo tests. This accommodates adapters (like WhatsApp) whose message handlers are only registered after `start()` is called. Signal bypasses this by having `simulateInbound` call `_handleIncomingMessage` directly — the factory is explicitly adapter-aware by design.

### Signal echo dedup uses content-key with 10s TTL, not message ID — 2026-04-23 (Request: channel-policy)

Signal's REST API does not return a stable message ID on send (unlike Baileys which returns `key.id`). Echo deduplication uses a composite key of `${peerId}::${text.slice(0, 64)}` stored in a `_sentKeys` Set with a 10-second TTL via `setTimeout`. The key is deleted on first match (one dedup per send) or after TTL expiry. This is sufficient for the agent-reply → syncMessage echo loop which typically arrives within milliseconds.

### Lost-jobs accumulation checked before outage threshold — 2026-04-22 (Request: resilience)

When a turn fails with a provider error, the check order matters: if an outage is already active (`_activeOutage === true`), the failed turn is recorded as a lost job immediately rather than incrementing the consecutive-failure counter. This avoids double-counting the first few failures after outage declaration and keeps the counter semantics clean: counter is only meaningful pre-outage. The counter is never incremented during an active outage.

### Restart notification uses DB marker, not session file presence — 2026-04-22 (Request: resilience)

`notifyRestart` detects a previous run via a `reeboot_state` SQLite table with a `last_started_at` key, rather than checking for existing session files. The DB marker approach is simpler and avoids false positives (session files could exist from manual copies or partial setups). On first startup the marker is absent — no notification sent. On every subsequent startup the notification fires. The marker is always updated to `now` during startup regardless of whether a notification was sent.

### Session continuity is opt-in via sessionsDir on ContextConfig — 2026-04-22 (Request: resilience)

The pi-runner defaults to `SessionManager.inMemory()` when `context.sessionsDir` is absent. File-based session persistence (required for session continuity across restarts) is activated by providing `sessionsDir` on the `ContextConfig`. This keeps tests and minimal deployments unaffected — they continue using in-memory sessions. Production server.ts passes `sessionsDir = ~/.reeboot/sessions/<contextId>/` and `sessionPath` (from `getResumedSessionPath`) to each runner context, enabling both persistence and session resume.

### LLM-assigned confidence at ingest deferred to v2 — 2026-04-15 (Request: domain-knowledge)

The brief specifies that `confidence` (content quality judgement) is "LLM-assigned at ingest". In v1, `ingestDocument` accepts confidence as a caller-supplied parameter and `knowledge_ingest` defaults it to `'medium'` — no LLM call is made to assess document quality. Making an LLM call inside the ingest pipeline was rejected for v1: it couples a pure, testable pipeline function to the LLM, adds latency for every document (including background/silent ingest), and complicates error handling. The caller-supplied model still allows the agent to pass a reasoned value during interactive ingest. A dedicated v2 task should add an optional `assessConfidence(text, config)` step in `ingestDocument` that makes a brief structured LLM call ("rate this document: high / medium / low, one sentence reason") and uses the result when no caller-supplied value is given. Tracked in agent-roadmap.md.

### sqlite-vec and knowledge migration gated on knowledge.enabled — 2026-04-15 (Request: domain-knowledge)

After evaluation, `loadVecExtension` and `runKnowledgeMigration` were moved out of `openDatabase()` and into `makeKnowledgeExtension`. They now only run when `knowledge.enabled: true` — consistent with the spec's intent. The knowledge extension calls both functions during its init phase (after resolving `db` from `pi.getDb()`). This keeps zero-cost deployments truly zero-cost: no sqlite-vec extension load, no vec0 table creation, no FTS index for knowledge unless the feature is explicitly enabled.

### pdf-parse v2 uses class-based constructor API — 2026-04-15 (Request: domain-knowledge)

pdf-parse v2 (2.4.x) is a complete API rewrite from v1. The v2 API: `new PDFParse({ verbosity: 0, data: Uint8Array })`, then `parser.load()` (no args — data is in constructor options), then `parser.getText()` which returns `{ text, pages, total }`. The v1 API (`pdfParse(buffer)` as a plain function returning `{ text }`) no longer exists. The extractor was updated to use the v2 class API. Post-extraction, PDF structural markers (object markers, stream delimiters) are stripped via regex to ensure clean text output.

### knowledge_lint performs real wiki analysis, not just metadata counts — 2026-04-15 (Request: domain-knowledge)

The initial knowledge_lint implementation returned only page counts and low-confidence counts. After evaluation, it was upgraded to perform actual lint analysis: (1) orphan detection — checks filesystem for pages registered in db but missing on disk; (2) missing concept pages — scans index.md for wiki-link and header references that lack a concepts/ page; (3) stale claims — compares wiki page `updated_at` against source `ingested_at` to flag pages referencing re-ingested (updated) documents; (4) contradiction detection — reads concept page content for explicit contradiction markers (CONTRADICTS, ⚠️, vs.). The output includes all four categories as structured fields alongside a flat `issues` array.

### Watcher uses close-while-processing pattern via pause/resume — 2026-04-15 (Request: domain-knowledge)

`KnowledgeWatcher` gained `pause()` and `resume()` methods to support the brief's "close-while-processing, reopen on agent_end" pattern. `pause()` stops the fs.watch without clearing pending files (unlike `stop()` which clears pending). `resume()` restarts watching on the same rawDir. The extension always registers `before_agent_start` (not just when wiki is enabled) to call `watcher.pause()` at the start of each agent turn, and `agent_end` calls `watcher.resume()` before checking pending files. This prevents file events from accumulating in debounce timers during agent processing.

### sqlite-vec auxiliary columns must be TEXT, not INTEGER — 2026-04-15 (Request: domain-knowledge)

During implementation of the ingest pipeline (Task 8), discovered that sqlite-vec auxiliary columns (defined with `+colname TYPE`) enforce strict type binding from `better-sqlite3` prepared statements. An auxiliary column declared as `+chunk_index INTEGER` rejects integer values bound from JavaScript, throwing "Auxiliary column type mismatch: The auxiliary column chunk_index has type INTEGER, but FLOAT was provided." The root cause is that better-sqlite3 promotes JavaScript integers to SQLite REAL in some binding paths. Workaround: declare all auxiliary columns as TEXT and store integers as string representations (`String(i)`). The `knowledge_chunks` schema was updated accordingly: `+chunk_index TEXT`. All retrieval code parses chunk_index back to integer with `parseInt(r.chunk_index, 10)`. INTEGER auxiliary columns remain a known limitation of sqlite-vec's pre-v1 status.

### Memory is instance-level, not context-level — 2026-04-15 (Request: personal-memory)

Persistent memory (`MEMORY.md` / `USER.md`) lives at the reeboot instance level — one set of memory files shared across all contexts within a single deployment. Per-context memory was considered but rejected: contexts are a routing and isolation mechanism, not a persona mechanism. The deployment model is one reeboot instance = one agent = one soul. If an owner wants genuinely separate memories (e.g. two different clients), they deploy two separate reeboot instances rather than using contexts to split a single instance.

### session_search is always-on, independent of memory feature flag — 2026-04-15 (Request: personal-memory)

The `session_search` tool (FTS5 full-text search over the `messages` table) is registered as a core agent capability regardless of whether `memory.enabled` is true or false. Session search and memory write paths (the `memory` tool) are separate concerns that share infrastructure. Gating session search behind the memory flag was rejected because the ability to query past conversations is independently valuable and has no meaningful cost or risk associated with it.

### Memory write has two paths: immediate tool and background consolidation — 2026-04-15 (Request: personal-memory)

Memory is written via two complementary paths. Path 1 (immediate): the agent uses a `memory` tool during a session when the owner gives an explicit instruction ("remember that...") or the agent recognises a strong correction — written to disk immediately, visible from the next session. Path 2 (consolidation): a scheduled background process mines the `messages` table across multiple past sessions, distils cross-session patterns, and updates `MEMORY.md`/`USER.md`. Running consolidation only after sessions end (not during) was chosen because it can see patterns across multiple sessions and avoids any mid-session prompt cache invalidation. Both paths write to the same files; consolidation deduplicates against existing entries.

### Memory self-manages capacity with observability logging — 2026-04-15 (Request: personal-memory)

When memory files reach capacity, the agent auto-consolidates (merges and replaces existing entries) to make room — no interruption to the owner. Every auto-consolidation event is written to a `memory_log` table as a hook for the future structured audit log request. If auto-consolidation fires too frequently it signals that the configured character limits should be revisited. The alternative (surfacing capacity warnings to the owner) was rejected as too noisy for what should be a background concern.

### Live external sources are skill/MCP concerns, not corpus — 2026-04-15 (Request: domain-knowledge)

The domain knowledge corpus (Loop 2) covers only locally-stored documents: template knowledge shipped with agent profiles and owner-added private documents. Live external data sources — legislation APIs, client repository syncs, real-time databases — are explicitly out of scope for the corpus and belong to the skill/MCP layer. This keeps the corpus bounded, offline-capable, and free of external API dependencies. The distinction maps to a clean two-tier model: `raw/template/` (pre-packaged) and `raw/owner/` (operator-added), both feeding the same local vector index.

### Vector search stays in SQLite via sqlite-vec, no separate vector database — 2026-04-15 (Request: domain-knowledge)

Embeddings are stored in a `vec0` virtual table using the `sqlite-vec` extension on the existing `reeboot.db`, rather than introducing a separate vector database (ChromaDB, LanceDB, Qdrant). This keeps reeboot's zero-extra-process philosophy intact — one SQLite file, one process. sqlite-vec is pre-v1 but Mozilla-backed and already used in production by large open-source agents. Dedicated vector stores were rejected due to added infrastructure complexity and the split-storage mental model they introduce. FTS5 (already available in SQLite) provides complementary full-text search with no additional dependency.

### nomic-embed-text-v1.5 as the local embedding model — 2026-04-15 (Request: domain-knowledge)

`nomic-ai/nomic-embed-text-v1.5` is used for local ONNX embedding via `@huggingface/transformers`, rather than `Xenova/gte-base` or `bge-small`. Key reasons: (1) 8192 token context window handles long legal, medical, and technical documents without truncation; (2) Matryoshka Representation Learning allows dimension reduction (768→256) for storage-constrained deployments; (3) task instruction prefixes (`search_document:` / `search_query:`) meaningfully improve RAG retrieval quality; (4) native Transformers.js ONNX support confirmed on the model card. The model downloads once on first use and is cached locally — no API key, no server, no ongoing cost.

### Wiki content in filesystem, metadata in SQLite — 2026-04-15 (Request: domain-knowledge)

Wiki synthesis pages live as markdown files in `~/.reeboot/knowledge/wiki/` (filesystem), while structured metadata (path, source_tier, confidence, updated_at, sources) is mirrored in a `wiki_pages` SQLite table. Storing full wiki content in SQLite was considered but rejected: it removes human readability, breaks git portability, conflicts with the agent's native file tools, and creates a sync problem (which representation is ground truth?). The chosen split has a clear mental model — files are content, db is index — with no sync conflict because the db metadata points to files rather than duplicating content.

### Memory is on by default, wiki synthesis is opt-in — 2026-04-15 (Request: personal-memory, domain-knowledge)

Personal memory (`memory.enabled`) defaults to true — it is a core capability that benefits all deployments immediately and has no meaningful downside for single-owner agents. The wiki synthesis layer (`knowledge.wiki.enabled`) defaults to false. When disabled, the agent operates in pure RAG mode: vector search + FTS5 over raw documents, no LLM-maintained markdown pages. Wiki is enabled explicitly by the owner or as part of an agent profile configuration. This decision reflects the hallucination contamination risk identified in research (synthesised cross-references can look authoritative), the token cost of ingest-time wiki updates, and the principle of zero-friction defaults. Simple deployments (product support, FAQ agents) need pure RAG. Complex deployments (legal researcher, academic analyst) opt into synthesis.

### Domain knowledge corpus uses two provenance fields, not one — 2026-04-15 (Request: domain-knowledge)

Every ingested document and wiki page carries two separate metadata fields: `source_tier` (`template` | `owner` | `wiki-synthesis`, rule-based, always accurate) and `confidence` (`high` | `medium` | `low`, LLM-assigned at ingest based on content quality). A single combined field was considered but rejected because the two signals answer different questions: `source_tier` answers "how many LLM hands has this passed through?" (epistemic distance from raw source) while `confidence` answers "how trustworthy is the content itself?" (domain quality judgement). High-stakes domains (legal, medical) need both: a template document can be low confidence (outdated), and an owner document can be high confidence (primary source). Both fields appear in citations.

### Sandbox wrapper injected via DI, not which-package mock — 2026-04-14 (Request: permission-tiers)

`McpServerPool` accepts an optional `sandboxWrapper` constructor parameter (defaulting to `defaultSandboxWrapper`) so tests can inject a mock wrapper directly instead of mocking the `which` package via `vi.mock`. The `which` package is a CJS module — vitest's ESM dynamic import mocking (`vi.mock` + `await import()` inside the module under test) proved unreliable for it. `mcpManagerExtension` also accepts an optional pre-built `pool` parameter for the same reason. The production code path remains unchanged: the default wrapper uses `which` to locate `sandbox-exec`/`bwrap` at runtime. This DI approach is preferred over module-level mocking for any CJS dependency used via dynamic import.

### MCP client uses proxy tool, not direct registration — 2026-04-13 (Request: mcp-client)

All MCP server tools are exposed through a single `mcp` proxy tool (~200 tokens) rather than registered as individual native pi tools (150–300 tokens each). The agent discovers tools via `mcp({ action: "list", server })` then invokes them via `mcp({ action: "call", ... })`. Direct registration was rejected because token cost scales linearly with tool count — a single server with 75 tools would consume 10k+ tokens regardless of whether any are used.

### pi-mcp-adapter rejected in favour of native implementation — 2026-04-13 (Request: mcp-client)

`pi-mcp-adapter` (nicobailon) is the most mature community MCP extension for pi but hardcodes `~/.pi/agent/` for all config and cache paths. Reeboot uses `~/.reeboot/agent/` as its agentDir. Adopting the package would split the user's configuration across two directories. Forking was considered and rejected (maintenance burden). Decision: build `mcp-manager.ts` as a native bundled extension with config in `~/.reeboot/config.json → mcp.servers`.

### MCP client v1 is stdio-only, lazy-start — 2026-04-13 (Request: mcp-client)

Servers are spawned as child processes on first tool call (not at session start) and killed on `session_shutdown`. HTTP/SSE transport deferred to v2. No wizard setup step in v1 — manual config only.

### TypeScript 6 did not require tsconfig `types` array — 2026-04-07 (Request: typescript-v6)

The brief predicted TS 6 would default `types` to `[]`, requiring an explicit `"types": ["node"]` in tsconfig to preserve global Node.js types. In practice, TS 6.0.2 compiled reeboot cleanly with no tsconfig changes — `tsc` exited 0 immediately after the pin bump. The `types` defaulting change either did not land in the 6.0 final release as described in the RC notes, or TS still auto-includes `@types/node` when it is present as a devDependency. No tsconfig change was made; the existing config is sufficient for TS 6.

### cron-parser v5 .next() returns CronDate directly, not an iterator result — 2026-04-07 (Request: cron-parser-v5)

The brief (and upstream changelog) described cron-parser v5's `.next()` as returning an ES iterator result `{ value: CronDate, done: boolean }`, requiring `.next().value.toDate()`. At runtime, v5's `.next()` returns a `CronDate` directly — the call chain is identical to v4 (`.next().toDate()`). The TypeScript type declaration (`CronExpression.d.ts`) confirms `next(): CronDate`. The only real breaking change for reeboot was the import API: `parseExpression(expr)` → `CronExpressionParser.parse(expr)` and dropping the `createRequire` CJS hack. Also discovered: stale compiled `.js` files in `src/` were shadowing TypeScript sources for the vitest runner — these were deleted.

### External packages managed via pi's DefaultPackageManager, not custom npm — 2026-03-21 (Request: package-install-fix)

Reeboot's original `packages.ts` reimplemented package management (npm install to `~/.reeboot/packages/`, tracking in `config.json`). This was broken: pi's `DefaultPackageManager` reads package lists from `agentDir/settings.json`, not `config.json`. Packages were installed but never discovered by the loader. The fix delegates to pi's `DefaultPackageManager` directly — it handles installation, settings.json tracking, and discovery on reload. User-scope npm packages are installed globally (`npm install -g`) consistent with how pi itself works. A one-time migration moves legacy `config.json` packages to `settings.json` on startup.

### authMode splits auth from identity in pi session — 2026-03-21 (Request: agent-isolation)

Reeboot's pi-runner was accidentally delegating model selection, API key resolution, and persona to `~/.pi/agent/` because pi's `DefaultResourceLoader` uses `agentDir` for both identity (AGENTS.md, extensions) and auth (auth.json, settings.json). The fix splits these: `agentDir` is always `~/.reeboot/agent/` for persona/extensions; auth/model is driven by `authMode: "pi" | "own"` in config.json. `authMode: "pi"` delegates to pi's own files; `authMode: "own"` injects credentials as runtime overrides via pi's `AuthStorage` API. Considered a single shared agentDir with pi (Option B) — rejected because user's personal pi extensions, settings, and persona bleed into reeboot.

### Pi is a bundled dependency, not an assumed host installation — 2026-03-21 (Request: agent-isolation)

Pi (`@mariozechner/pi-coding-agent`) is listed in reeboot's `package.json` dependencies and ships inside reeboot's `node_modules`. No separate pi installation is required on the host or in Docker. The user's personal pi installation (if present) is only relevant for `authMode: "pi"` auth delegation — the binary, runtime, and code are always reeboot's bundled copy.

### Docker headless config via env vars, existing config wins — 2026-03-21 (Request: agent-isolation)

For headless Docker deployments, `REEBOOT_*` env vars are translated to `--no-interactive` flags by `entrypoint.sh` only when no `config.json` exists. If a config.json is already present (volume mount from host setup), it is used as-is and env vars are ignored. `REEBOOT_AGENTS_MD` is an exception — it writes directly to `~/.reeboot/agent/AGENTS.md` before start, enabling persona injection without a wizard. A future platform can implement richer config bundle injection (URL fetch, base64 decode) as an entrypoint wrapper outside reeboot core.

### Resilience startup split into DB-only phase and deferred channel phase — 2026-04-22 (Request: resilience)

`server.ts` resilience startup is now two phases. Phase 1 (before channel init): `runResilienceMigration` and `applyScheduledCatchup` — these only need the DB. Phase 2 (after `_orchestrator.start()`): `notifyRestart` and `recoverCrashedTurns` — these need the populated channel adapters Map and a live bus for `requeueFn`. Previously both ran together before `initChannels`, passing the empty initial Map to the broadcast calls so all notifications were silently dropped. Moving phase 2 post-orchestrator also enables the requeueFn to call `bus.publish()` on a subscribed orchestrator. The `recovery` channel type is used for re-queued prompts; it routes to the default context (`main`) and has no adapter, so replies from the orchestrator during recovery are silently dropped (acceptable: the broadcast already notified the user).

### Pino SSE transport uses in-process Writable stream parser, not pino.transport() — 2026-05-07 (Request: observability-system)

To fan pino log records into the SSE stream, `createLogger()` was extended with a third `pino.multistream` destination: a custom `Writable` stream that receives pino's raw NDJSON output, parses each line as JSON, and calls `emitLogRecord(record)` via a lazy `import()` to avoid circular dependency. `pino.transport({ target: './sse-transport' })` (worker thread approach) was considered but rejected: it requires a separate file path resolvable in both source and compiled contexts, adds worker thread complexity, and the in-process writable stream achieves the same result with zero overhead for a single-process server.

### patchDb monkey-patches prepare() in-place rather than wrapping Database type — 2026-05-07 (Request: observability-system)

The original `wrapDb()` returned a `WrappedDatabase` interface — a limited type that doesn't satisfy `Database.Database`. This made wiring into `openDatabase()` difficult since callers expect the full database type. The fix introduces `patchDb(db)` which monkey-patches `db.prepare` directly on the `Database.Database` instance and returns the same object. The original `wrapDb()` is retained for backward compatibility with its tests. `patchDb()` is called inside `openDatabase()` after all migrations, so every query in production goes through the debug wrapper transparently.

### Channel event emissions use getDb() singleton with graceful degradation — 2026-05-07 (Request: observability-system)

`channel_connected` and `channel_disconnected` events are emitted from `whatsapp.ts` and `signal.ts` using `getDb()` from the db index. Since channels may connect before or during server startup before the DB is fully initialised, all `emitEvent(getDb(), ...)` calls are wrapped in `try { } catch { /* db not ready */ }`. This avoids crashes on early connect events while ensuring that once the DB is open, all subsequent channel status changes are recorded.

### operational_logs wired via createLogger(config, db) second argument — 2026-05-07 (Request: observability-system)

The pino logger's `createLogger` function was extended to accept an optional `Database` second argument. When provided, a fourth `pino.multistream` destination is added: an in-process `Writable` stream that parses each NDJSON line and inserts records with `level >= 40` (warn+) into `operational_logs`. The server calls `initLogger({ level }, db)` after migrations complete, re-initialising the singleton with the DB attached. This avoids a circular startup dependency (logger needed before DB, DB needed for logger persistence) by separating creation (boot) from DB attachment (post-migration). The approach is consistent with the existing SSE Writable stream pattern already used in the logger.

### Signal channel uses module-level child logger, not per-call getLogger() — 2026-05-07 (Request: observability-system)

`src/channels/signal.ts` previously called `getLogger().warn({ component: 'signal' }, ...)` on every log call site. This works but doesn't satisfy the spec's explicit requirement for `logger.child({ component: 'signal' })`. Changed to `const _log = getLogger().child({ component: 'signal' })` at module level. The child logger binds the `component` field once, reducing per-call overhead and satisfying the contract. The test was strengthened from checking string presence to asserting `.child(...)` is used and that no per-call `getLogger().xxx(...)` pattern remains.

### rate_limits.provider sourced from config, not pi event field — 2026-05-07 (Request: observability-system)

The `provider` field stored in `rate_limits` rows now comes from `opts.configProvider` (passed to `makeObservabilityExtension` by the loader as `config.agent.model.provider`) rather than `event.provider`. This ensures the scheduler can find the recorded row: both sides agree on the same key. The scheduler is also now constructed with `{ provider: appConfig?.agent?.model?.provider }` in `server.ts` so its `getLatestRateLimit` lookup uses the same string. If pi's `after_provider_response` event carries a different provider identifier, it is now ignored in favour of the config value. The fallback is `'unknown'` on both sides, keeping them consistent in minimal deployments.

### operation_type propagated via workspace meta file — 2026-05-07 (Request: token-budget)

The orchestrator knows the `channelType` of each message (scheduler, heartbeat, memory, recovery, user_message), but the `token-meter.ts` extension knows only `ctx.cwd`. Rather than adding cross-boundary communication (IPC, shared state, event fields), the bridge uses a tiny JSON file written by the orchestrator before each `runner.prompt()` call: `~/.reeboot/contexts/<contextId>/workspace/.reeboot_turn_meta.json` with `{ operationType, turnId }`. The token-meter reads this file during `agent_end` and defaults to `'user_message'` if absent. This pattern follows existing reeboot conventions (`ctx.cwd` → `contextId`) and requires zero new infrastructure.

### Per-task budget is extension-scoped, not orchestrator-scoped — 2026-05-07 (Request: token-budget)

Per-task budgets (set via `set_budget()`) live entirely within the `budget-manager.ts` extension closure. The extension accumulates cost on every `turn_end` event, injects a wrap-up instruction on the next `turn_start` when the budget is exhausted, and clears state on `agent_end`. This keeps the orchestrator clean of agentic budget logic and aligns with the agentic self-management philosophy — the agent is instructed to stop, not forcibly killed. Global limits (Layer 1, via BudgetGuard in the orchestrator) remain the true hard stop. The extension writes `.task_budget.json` to the workspace for observability; this file is deleted on `agent_end`.

### Pi's ModelRegistry is the authoritative pricing source — no custom table — 2026-05-07 (Request: token-budget)

`AssistantMessage.usage.cost.total` (calculated by pi from its built-in ModelRegistry) is persisted as `cost_usd` in the usage table. No custom pricing table is maintained in reeboot. Pi already prices all major providers (Anthropic, OpenAI, Google, Groq) with per-token input/output/cacheRead/cacheWrite costs. For models without pricing (local/Ollama), `cost.total` returns 0 — this is detected by checking whether all usage rows have `cost_usd = 0` and surfaced to the user as "cost unavailable for this model" rather than falsely showing $0.00.

### budget_status vs check_budget serve different audiences — 2026-05-07 (Request: token-budget)

Two distinct tools exist with different purposes. `check_budget()` is for the agent itself — returns structured data about the active per-task budget (spend within the current session task), returns "No active task budget" if none is set. `budget_status({ period, operationType })` is for the owner — returns a human-readable summary answering questions like "how much did you spend today?" or "how much did the last memory run cost?" by querying the `usage` table with date and operation_type filters. Both tools are registered by `makeBudgetManagerExtension` and are always available regardless of whether a task budget is active.

### before_agent_start is the correct pi hook for system prompt injection — 2026-05-07 (Request: token-budget)

The initial implementation used `pi.on('turn_start', ...)` with a non-existent `ctx.injectSystemPrompt()` call for the budget exhaustion wrap-up instruction. Pi's `turn_start` ExtensionHandler returns `void` — there is no mechanism to inject content there. The correct hook is `pi.on('before_agent_start', handler)` which returns `BeforeAgentStartEventResult { systemPrompt?: string }`. Returning `{ systemPrompt: existing + instruction }` from this handler prepends content into the system prompt for the next LLM call. This pattern is also used by the memory-manager extension. Any future feature that needs to inject text into the agent's context must use `before_agent_start` returning `{ systemPrompt }`, not `turn_start`.

### Daily budget limits are per-context, not instance-wide — 2026-05-07 (Request: token-budget)

The initial BudgetGuard daily token/cost queries summed usage across ALL contexts, meaning ctx2's spend could block ctx1. The evaluator correctly flagged this as diverging from spec intent ("tokens consumed today for this context"). The queries were updated to add `context_id = ?`. This means `daily_tokens` and `daily_cost_usd` in config.json are per-context per-day limits. A deployment with N active contexts has N independent daily buckets. This is the least surprising semantics for a single-owner agent and is consistent with how session limits already worked (session limits were already per-context).

### InquirerPrompter rewritten to use @inquirer/prompts individual functions — 2026-05-10 (Request: setup-wizard-improvements)

`InquirerPrompter` was rewritten to use the individual function API from `@inquirer/prompts` (`select`, `input`, `password`, `checkbox`, `confirm`) instead of the legacy `inquirer.prompt([{ type: '...' }])` pattern. Inquirer v13 (pinned at `^13.4.0`) rewrote the API entirely — the old pattern silently fell back to plain text input on Linux SSH terminals. The `Prompter` interface and `FakePrompter` are unchanged. The overwrite-confirmation prompt in `runSetupCommand` was also updated to use `confirm` from `@inquirer/prompts`.

### Cloud provider step reordered to provider → API key → model — 2026-05-10 (Request: setup-wizard-improvements)

The cloud provider flow was reordered from provider → model → API key to provider → API key → model. This enables live model fetching: after the key is entered, the wizard calls `fetchCloudModels(provider, apiKey)` (3s timeout), shows the live list, and falls back to static curated lists on failure. The static fallback ensures the wizard still works without network access or when the provider API is unavailable.

### Start-now confirm moved from launch step to wizard orchestrator — 2026-05-10 (Request: setup-wizard-improvements)

The "Start the agent now?" confirm prompt was moved from `runLaunchStep` to the end of `runSetupWizard`. The launch step now only writes config. This enables injectable `_deps.startAgent` for testing the full wizard without starting a real server. Tests that previously provided `prompter([true/false])` to `runLaunchStep` for start-now were updated to no longer need that answer, while the wizard-level tests now provide it.

### Local providers follow same models.json pattern as Ollama — 2026-05-10 (Request: setup-wizard-improvements)

llama.cpp, LM Studio, and Custom endpoint use the identical `models.json` + `baseUrl` mechanism as Ollama. No new templates were needed — `writeOllamaModelsJson` is reused for all local providers. The local branch was generalised from `if (provider === 'ollama')` to `if (provider in LOCAL_PROVIDERS)`. This keeps local inference support zero-cost in terms of code surface area.

### OpenRouter uses unified cloud flow (provider → API key → model), not a special-cased order — 2026-05-10 (Request: setup-wizard-improvements)

The original spec described an OpenRouter-specific ordering where the model list is fetched before the API key is entered, and the API key is asked *after* model selection. This was reconsidered: the implementation pre-fetches the public OpenRouter models list in the background before asking for the API key, then presents the model select (using those pre-fetched results) in the normal position. The user experience is identical to other cloud providers — provider → API key → model — with the only difference being that OpenRouter's model list is already available without waiting for a new fetch. Deviating from the unified flow for one provider was rejected because it adds UI inconsistency without user-visible benefit: the pre-fetch happens silently and the API key is still needed before the user can proceed. The spec was updated to reflect this intent.

### registerJob() in scheduler-registry defers until real scheduler is set — 2026-05-24 (Request: service-bootstrap)

`scheduler-registry.ts` now exports a `registerJob(job)` function that either forwards to the real scheduler if one is already set, or pushes to an internal `_pending` queue if not. When `setGlobalScheduler()` is called, the pending queue is drained in order and cleared. This eliminates the startup race where extensions could register jobs before the scheduler was initialised — previously those calls were silently dropped into `noopScheduler`. The deferred queue is a simple in-memory array; jobs are not persisted across process restarts, but bootstrap re-registers them on every startup and the scheduler's `registerJob()` is idempotent (skips existing rows).

### Background jobs declared via registerServerJobs(), bootstrapped in bootstrap.ts — 2026-05-24 (Request: service-bootstrap)

Each extension that needs a background cron job exports a `registerServerJobs(db, scheduler, config)` function. A central `src/bootstrap.ts` module calls each one explicitly after `setGlobalScheduler()` in `server.ts`. This pattern ("Shape A" from discovery) was chosen over a central manifest because it keeps cohesion — everything a feature needs (tools, hooks, background jobs) lives in one file — and makes adding a new capability as simple as adding one export to the extension and one call in `bootstrap.ts`. The two existing background jobs (`__memory_consolidation__` and `__knowledge_lint__`) now use this pattern. The `session_start` handler that previously tried to register the consolidation job is removed.

### pi-runner calls bindExtensions() for full session lifecycle participation — 2026-05-24 (Request: service-bootstrap)

`_getOrCreateSession()` in `pi-runner.ts` now calls `session.bindExtensions()` after `createAgentSession()`, with a `shutdownHandler` that routes pi-internal shutdown requests to the runner's `reset()` path. This is the missing piece that enables `session_start` and `session_shutdown` events to fire for all extensions — bundled and user-defined. Without it, extensions that depend on `session_start` (including user extensions) were silently broken, and MCP child processes leaked on reset. The `shutdownHandler` is a zero-complexity bridge: if any extension calls `ctx.shutdown()`, the runner just resets.

### docker-compose build context and Dockerfile path corrected to reeboot/ — 2026-05-24 (Request: docker-setup)

The design specified `context: .` (repo root) with `dockerfile: container/Dockerfile`, assuming the Dockerfile lived at `./container/Dockerfile`. The actual repo layout places the Dockerfile at `reeboot/container/Dockerfile` — the repo root has no `container/` directory and no `package.json`. Changed to `context: reeboot/` with `dockerfile: container/Dockerfile`, which resolves to `reeboot/container/Dockerfile` and gives the Dockerfile's `COPY package*.json ./` a valid source. The alternative (keeping context `.` with `dockerfile: reeboot/container/Dockerfile`) was rejected because COPY commands in the Dockerfile would still reference repo root paths (no `package.json` there), requiring more invasive Dockerfile changes.

### getBundledFactories accepts context to correctly scope per-context paths — 2026-05-24 (Request: service-bootstrap)

`getBundledFactories(config)` was changed to `getBundledFactories(context: ContextConfig, config: Config)`. The `context` argument provides the workspace path, which `budget-manager` was previously getting from `process.cwd()` — always the reeboot package root, not the actual context workspace. The knowledge-manager factory also now passes `config` and the DB explicitly to `makeKnowledgeExtension(pi, config, db)` rather than relying on phantom `pi.getConfig?.()` / `pi.getDb?.()` calls that always returned `{}`/`undefined`.

### Support runtime implements the existing AgentRunner interface, not a parallel runtime — 2026-07-03 (Request: support-runtime)

The support runtime is implemented as a second `AgentRunner` implementation (`SupportAgentRunner`, selected by `config.agent.runner = "support"`) rather than a new top-level runtime that bypasses the orchestrator. This was chosen over a parallel host abstraction because the `AgentRunner` interface (`prompt`/`abort`/`dispose`/`reset`) is already clean and SDK-agnostic, and implementing it means the support runner plugs into the existing orchestrator, channels, inactivity timers, and `createRunner` factory with zero changes to those systems. The consequence: dynamic per-peer chat creation is NOT solved by this request — the orchestrator still receives a fixed `Map<string, AgentRunner>` and the support runtime manages chats internally keyed by chatId. Dynamic peer→chat routing is a separate follow-up request (`support-chat-routing`) that will extend the orchestrator. The interface only needs to change if a future runtime forces it.

### Minimal non-streaming agent loop for the support runtime; production hardening deferred — 2026-07-03 (Request: support-runtime)

The support runtime's agent loop (`runAgentLoop`) is deliberately minimal: non-streaming, single provider call per turn, no multi-provider abstraction, no retry/rate-limit logic inside the loop. This was chosen because the request's primary goal is to prove the `ExtensionAPI` abstraction holds across two adapters and to establish the multi-chat foundation — not to ship a production LLM client. The orchestrator already handles turn timeouts and rate-limit retries at its layer, so the loop can stay simple. Full production hardening (streaming responses, multi-provider support, in-loop retries, scale/load testing) is deferred to the `support-production-loop` request. Anyone building on the support runtime before that request lands must treat the loop as a bootstrap, not production-ready.

### "Extensions must not change" — interface-leak detection principle for the second adapter — 2026-07-03 (Request: support-runtime)

When wiring the support-relevant extension subset (observability, session-name, token-meter, capabilities) through `SupportExtensionAdapter`, if an extension file must be modified to work on the second adapter, that is treated as evidence the `ExtensionAPI` abstraction leaked — and the fix MUST go in the interface or the adapter, never in the extension. The support-runtime task suite enforces this with a git-diff assertion: the four extension files must be byte-identical to their `sdk-pluggability` state. This principle was adopted because an abstraction with one implementer is not proven; the second adapter is the stress test, and per-extension special-casing would silently re-couple extensions to a specific SDK, defeating the entire `sdk-pluggability` effort. Future SDK adapters inherit the same rule.

### ExtensionAPI event types are reeboot-owned with adapter transformation, not pi mirrors — 2026-07-02 (Request: sdk-pluggability)

The v1 implementation of `extension-api.ts` defined event types that were identical mirrors of pi's types — same field names, same shapes — and the adapter's `transformEvent()` was a bare `return piEvent as ExtensionEventMap[K]` cast with zero transformation. This meant if pi changed an event shape, reeboot would break at runtime, and future SDK adapters had no reeboot-defined shape to target. The fix: (1) event types now have reeboot-owned fields — `TurnEndEvent` has `turnId: string` (not pi's `turnIndex: number`), `sessionId`, and `usage?: TurnUsage`; `ToolResultEvent` is a single interface with `input: Record<string, unknown>` in the base (was a union missing it); `SessionShutdownEvent` has `sessionId`; `AfterProviderResponseEvent` has `contextId` and `provider`. (2) `PiExtensionAdapter.transformEvent()` now has a switch statement with explicit per-event transformation logic for these 4 events, while other events with identical shapes pass through. (3) Context ID is derived from the workspace path (`~/.reeboot/contexts/<id>/workspace`), and provider from config. This pattern — reeboot defines its own event shapes, adapter transforms SDK → reeboot — is the contract all future SDK adapters must follow. See request artifacts for full context.

### ree-sdk: one SDK per process, selected by config — 2026-07-06 (Request: ree-sdk)

A reeboot process runs exactly ONE SDK — `pi` or `ree` — selected at startup by config (`config.sdk` or the existing `config.agent.runner` field, extended). The two modes are mutually exclusive within a single process: a pi instance cannot serve multi-chat traffic, and a ree instance cannot run the owner's personal-assistant loop. This is a deployment-shape decision, not a code-enforcement decision. The isolation between the owner's soul (MEMORY.md consolidation) and transactional customer chats is achieved by running two separate processes with different config — never by gating within one process. The `createRunner` factory in `src/agent-runner/index.ts` is the seam: it branches on the configured SDK and returns the matching `AgentRunner` implementation. The non-selected branch is never loaded. This supersedes the `support-chat-routing` assumption that static owner contexts and dynamic support chats coexist in one orchestrator — they do not. A ree instance is purely a dynamic-chat host with no owner/static context.

### ree-sdk: TanStack AI as the foundation library — 2026-07-06 (Request: ree-sdk)

`ree` (the second SDK adapter alongside pi) is built on TanStack AI (`@tanstack/ai`, MIT, beta v0.39.x), not Vercel AI SDK, Mastra, or LangGraph. TanStack AI was chosen because: (1) it is a pure library where we own the agent loop (`chat()` returns an `AsyncIterable<StreamChunk>` consumed directly on the server — no HTTP/UI required); (2) it is the lightest candidate (5 core deps, ~44KB gzip); (3) it has no platform association ("pure library, no gateway, no implicit associations"), unlike Vercel AI SDK's optional platform coupling; (4) per-model literal type narrowing (even for custom models) is stronger than Vercel AI SDK's per-provider types; (5) AG-UI native end-to-end (future-proofs structured client affordances). The accepted risk: it is beta, pre-1.0, 9 months old — expect breaking changes and unfinished edges. The insurance: reeboot's `ExtensionAPI` adapter insulates the harness from the underlying library, so a future swap to Vercel AI SDK (or a post-1.0 TanStack) is feasible without rewriting extensions. Vercel AI SDK remains the documented fallback if TanStack AI's beta churn proves unmanageable. Mastra was excluded (too heavy: `@mastra/core` = 32 deps / 62.8MB) and LangGraph was excluded (checkpoint runtime is unspent machinery — reeboot does not own durability in the agent layer; see next decision).

### ree-sdk: durability lives at the reeboot layer, not in the agent SDK — 2026-07-06 (Request: ree-sdk)

Reeboot is an AI assistant product, not a workflow runner or durable-execution engine. Long-lived paused-and-resumed workflow state (e.g., the legal-SaaS payment → document-generation pipeline) lives OUTSIDE reeboot entirely — reeboot's job ends at handoff. Therefore LangGraph's checkpoint runtime and Mastra's durable agents are unspent machinery and were excluded. What `ree` DOES need is its OWN per-chat conversation-history persistence that survives process restart — but this is NOT pi's `SessionManager` file (that format is pi-shaped and per-context, not reusable by a TanStack-based loop). The `ree` adapter writes and reads per-chat history from a reeboot-owned store (likely the existing `messages` table extended with a chat/peer key, or a parallel `chats` table). This is consistent with how reeboot already wraps pi without pi owning reeboot's persistence.

### ree-sdk: no cross-session consolidation for ree chats; RAG corpus is the competence layer — 2026-07-06 (Request: ree-sdk)

In `ree` mode (multi-user, transactional), customer conversations are NEVER consolidated into `MEMORY.md` or any soul. The data is too private to mix across sessions, and consolidation across customer chats is unsafe. The memory-manager's background consolidation job (which mines the `messages` table to update `MEMORY.md`/`USER.md`) does not run on a ree instance — this is free because a ree process runs only the ree SDK (no pi, no memory-manager consolidation wired). The agent's domain competence in ree mode comes entirely from the RAG knowledge corpus (the existing `domain-knowledge` subsystem, reused as-is per the lego principle), configured per deployment. The corpus is the constant; the customer is the variable. The orchestrator's `messages`-table write rule (currently fires for every non-synthetic turn) still needs a ree-mode decision: skip / route to a per-chat table pruned on handoff/eviction / tag-and-exclude — this is a plan-phase design decision. The `session_search` tool (always-on, independent of the memory flag per existing decision) needs the same gating review for ree mode.

### ree-sdk: auth-gated dynamic tool sets are a toolcalling/MCP concern — 2026-07-06 (Request: ree-sdk)

In ree deployments (support, legal SaaS), a conversation may start unauthenticated and transition to authenticated mid-conversation. After authentication, the agent's tool set expands (retrieve customer data, call business APIs via MCP, etc.). This is a dynamic-capability-gating requirement at the tool-registration layer — NOT a memory concern. It belongs to the tool/MCP surface of the ree adapter. Pi binds tools at session creation; ree (TanStack AI) must support mid-conversation tool-set changes. This is a concrete requirement for the ree agent loop but is scoped to the tool/MCP layer, not to memory or persistence.

### TanStack AI v0.39 uses `adapter` not `model` in chat() — agent loop design needs update — 2026-07-06 (Request: ree-sdk)

The design.md described TanStack AI's `chat()` as taking `model: openaiText(...)` based on early research. The actual v0.39 API uses `adapter: openaiText(...)` with a different option shape. Additionally, the stream chunk types (`StreamChunk`) and AG-UI event mapping may differ from what was documented. This means tasks 22-23 (wire real TanStack client, MCP support) require investigating the actual v0.39 API before implementation. The core infrastructure (ReeChat, ReeRuntime, ReeExtensionAdapter, ReeAgentRunner, history store, factory wiring) is complete and tested independently of the TanStack client — the agent loop in ReeAgentRunner.prompt() currently uses a stub that emits basic lifecycle events. The full TanStack-backed loop is a follow-up that requires reading TanStack AI's actual type definitions and adapting the mapping table accordingly.

### ree-sdk: mock-fetch test strategy for TanStack provider wiring — 2026-07-07 (Request: ree-sdk)

Task 22 (wire real TanStack AI client) was tested using a custom `fetch` function injected via `config.ree.model.fetch` that returns OpenAI chat-completions SSE — no real provider key, no network, no `nock` dependency. The `openaiCompatibleText` adapter (from `@tanstack/ai-openai/compatible`) is used for `custom`/`ollama`/`lmstudio` providers and accepts `fetch` as a pass-through `ClientOptions` field. For the `openai` provider, `createOpenaiChat(model, apiKey, config)` is used when an explicit key is provided (since `openaiText` omits `apiKey` and reads from env). The `google` provider is unsupported (`@tanstack/ai-google` was never published to npm — 404). This mock-fetch approach is more reliable than `nock` for SSE streaming and allows testing the full agent loop (TanStack `chat()` → AG-UI events → RunnerEvents) without real API calls.

### ree-sdk: abort detection after stream completion — 2026-07-07 (Request: ree-sdk)

TanStack AI's `chat()` catches fetch AbortErrors and emits a `RUN_ERROR` AG-UI event instead of throwing. This means the `for await` loop in `runReeAgentLoop` ends gracefully on abort rather than rejecting. To satisfy the ree-runner spec S7 ("prompt rejects with AbortError"), `runReeAgentLoop` checks `reeChat.abortController.signal.aborted` after the stream completes and throws a `DOMException('Aborted', 'AbortError')` if the signal was aborted. The catch block also re-throws AbortErrors that do propagate. This dual-path abort detection handles both TanStack's graceful error-to-event translation and direct throw cases.

### ree-sdk: MCP client lifecycle at runtime level with test seam — 2026-07-07 (Request: ree-sdk)

MCP clients are managed at the `ReeRuntime` level (shared across all chats, not per-chat) per the design. `initMcpClients()` is async and creates `createMCPClient` instances from `config.ree.mcp.servers` (same `{ name, command, args, env }` shape as the existing `mcp-manager`, translated to TanStack stdio transport). `ReeAgentRunner.prompt()` calls `await runtime.initMcpClients()` before the first prompt. A `setMcpClients(clients)` test-only seam allows injecting pre-built clients (e.g., from `InMemoryTransport` + `createMCPClientFromTransport`) for testing without spawning child processes. `shutdown()` closes all MCP clients. The `InMemoryTransport` approach (from `@modelcontextprotocol/sdk/inMemory.js`) with a real MCP SDK `Server` instance is the test strategy for MCP integration — it exercises the real MCP protocol without stdio process management.

### Ree history store wired into ReeRuntime with lazy DB resolution + idle/explicit prune split — 2026-07-07 (Request: ree-sdk)

The `ree-history.ts` store module (persistTurn/loadHistory/pruneHistory) was built and unit-tested in isolation but never wired into `ReeRuntime`/`ReeAgentRunner`/`ree-agent-loop.ts` — a post-evaluation gap. The wiring: `ReeRuntime` now owns a history DB handle resolved one of three ways — (1) an injected `db` handle (test seam), (2) an explicit `dbPath` (durable file via `initReeHistory`), or (3) lazily from the reeboot `getDb()` better-sqlite3 singleton via an async `initHistoryDb()` called by `ReeAgentRunner.prompt()` before `getOrCreateChat` (production path). The lazy singleton resolution is wrapped in try/catch with graceful degradation — deployments without an initialised DB silently no-op persistence, matching the observability pattern. `createChat` hydrates `chat.history` from `loadHistory` on resume; `ReeAgentRunner.prompt` calls `runtime.persistTurn` after the loop resolves successfully (aborted/errored turns are not persisted since the loop throws before returning). The critical prune semantic: `disposeChat(chatId, 'idle')` (called by `sweepIdle` and `_evictOldestIdle`) calls `pruneHistory` (deletes rows — resumed chat starts empty, per spec S4), while explicit dispose (`dispose()` with no reason) calls `markChatDisposed` (preserves rows so resume works across voluntary restarts, per spec S3). Considered making `initHistoryDb` synchronous via `createRequire` but rejected — the async `import('../db/index.js')` matches the existing loader pattern and the runner already awaits `initMcpClients` in the same spot.

### ree-sdk: async extension init via extensionsReady promise on ReeChat — 2026-07-07 (Request: ree-sdk)

Post-evaluation gap: `getReeFactories` and `ReeRuntime.setFactories` existed but were never wired into the production path — `createRunner` never called `setFactories`, and `createChat` never ran factories against the chat's adapter, so the four extension subset (observability, session-name, token-meter, capabilities) did not actually run in ree mode despite passing in isolation. Fixed by: (1) `createRunner` now calls `runtime.setFactories(getReeFactories(config))` after constructing the singleton; (2) `ReeRuntime.createChat` runs each factory against `chat.adapter` via a new `_initExtensions(chat)` method. The factories are async (dynamic imports via `importExt`), but `createChat` is synchronous and many existing tests depend on that. Rather than making `createChat` async (which would break ~15 existing test call sites and `getOrCreateChat`'s sync contract), the init promise is stored on a new `ReeChat.extensionsReady: Promise<void>` field. `ReeAgentRunner.prompt()` awaits `chat.extensionsReady` before running the agent loop, ensuring extensions are registered before `before_agent_start` fires. Factory failures are logged-and-skipped (best-effort), matching the observability graceful-degradation pattern. Considered making `createChat` async but rejected as too invasive for the existing test surface; considered fire-and-forget (no await in prompt) but rejected because capabilities' `before_agent_start` handler would race the loop's emission.

### webchat-ui: Vite + React + TypeScript SPA with Tailwind CSS — 2026-07-08 (Request: webchat-ui)

The webchat SPA is built with Vite + React 19 + TypeScript + Tailwind CSS v4 (via @tailwindcss/postcss). The SPA builds into `reeboot/webchat/dist/` and is served by Hono's `serveStatic` middleware after all API routes. The old static HTML webchat (`index.html`, `logs.js`, `settings.js`) was replaced — the old `index.html` was backed up to `index.old.html`. The WebSocket hook (`useWebSocket`) connects to `/ws/chat/:contextId` with auto-reconnect. Message rendering uses a custom markdown renderer (no external library) that handles bold, italic, inline code, code blocks, and links. Tailwind v4 requires `@tailwindcss/postcss` as the PostCSS plugin (not `tailwindcss` directly). Testing uses Vitest + React Testing Library + jsdom with 33 tests across 3 files (Message, ToolCall, useWebSocket). The Navigation component supports two variants: sidebar (desktop, 50px wide) and bottom bar (mobile, <768px). The Chat page uses placeholder messages and simulated responses — WebSocket integration is wired but the Chat page's message handling will be enhanced in future tasks to use the real WebSocket hook for live messaging.

### Deployment model is single-tenant: one process = one product — 2026-07-17 (Request: ree-scope-discovery)

A reeboot deployment serves exactly ONE product: either the owner's personal assistant (pi SDK) OR a single-company dedicated agent such as a support/triage agent (ree SDK) — never both, never multiple tenants, in one process. This confirms and extends the earlier "one SDK per process" decision from the deployment side. The consequence for the ree/multi-user path: "no cross-user leakage" only ever means per-CHAT privacy inside one trusted deployment (customer A must not see customer B's conversation), NOT per-tenant row-level isolation. The scary roadmap option (session_search gated via per-tenant DB views/RLS) is therefore out of scope; a single `better-sqlite3` file per process is sufficient. Domain competence for the support use case comes from the RAG knowledge corpus, not from accumulating customer conversations into a shared soul.

### If multi-tenant is ever adopted: dedicated DB per tenant, shared engine — 2026-07-17 (Request: ree-scope-discovery)

Should reeboot ever go multi-tenant, the desired implementation is a database PER TENANT with only the "engine" (the reeboot codebase/runtime image) shared — i.e. more processes, each with its own config and its own DB file — never a single shared DB with row-level/tenant-scoped isolation. This is just the "one process = one product" model scaled out as a deploy topology, so no shared-DB isolation code needs to exist in the codebase. The storage layer already supports this: `openDatabase(dbPath?)` (`src/db/index.ts:26`) takes a configurable path (default `~/.reeboot/reeboot.db`) and `_db` is a process-level singleton that actively prevents two tenants sharing one process. The only deploy nuance is that co-locating instances on one host requires distinct home dirs or explicit `dbPath` values. No code change is required now to keep this future open.

### Ree emitBeforeAgentStart composes all extension systemPrompt returns (not last-wins) — 2026-07-17 (Request: deployment-readiness)

`ReeChat.emitBeforeAgentStart` previously used last-wins semantics for returned `systemPrompt` values: each handler returned the full prompt (base + its block), and only the last handler's value was kept. This meant multiple `before_agent_start` listeners (e.g., capabilities + injection-guard) could not both contribute to the system prompt — whichever ran first was silently overwritten. The fix updates `event.systemPrompt` to the accumulated value before each handler call, so each handler sees and builds on contributions from all prior handlers. This is the same compose pattern pi's adapter uses naturally since pi passes event objects by reference. Only `ReeChat.emitBeforeAgentStart` needed the fix — the `ree-adapter.ts` and `ree-agent-loop.ts` call sites are unchanged.

### DB log persistence reverts to warn+ — observability audit moves to the `events` table — 2026-07-17 (Request: observability-audit-view)

The `web-api-readback` request lowered `operational_logs` DB persistence from warn+ to info+ (`logger.ts` `< 30` → `< 40` gate, stream `level: 'warn'` → `'info'`) to make a raw-log observability page "substantive". That was the wrong substrate: raw log lines are low-signal for auditing agent behaviour and info-level DB persistence floods the store (millions of rows under support fan-out), obscuring the signal that matters. Reverted: `createDbStream` again gates at `level < 40` and the stream entry is `level: 'warn'`, realigning the code with its own JSDoc ("warn+ records, level >= 40"). stdout, file, and SSE sinks are unchanged — operator debuggability is preserved via stdout/file; only DB persistence narrows. The operator-facing audit view is repointed at the curated `events` table (typed domain events with OTEL severity, `trace_id`/`context_id` correlation) surfaced as a turn-grouped rollup via `GET /api/events`. `tests/observability/info-log-persistence.test.ts` (the web-api-readback spec test) was removed; its S2/S3 coverage is now in `warn-only-log-persistence.test.ts`, and `operational-logs-persist.test.ts`'s info assertion was flipped to assert non-persistence. See the `observability-audit-view` request for full context.

### Structured tool views — view field on tool results propagates through both SDK paths — 2026-07-26 (Request: structured-tool-views)

### PlanView component renders structured plan blocks via the view system — 2026-07-26 (Request: visual-planning)

The `PlanView` React component renders 5 block types (diagram, wireframe, annotated-code, decision, file-tree) as structured inline content, using SVG for diagrams and styled cards for other types. It is registered in `ToolCall.tsx` as a handler for `view.type === 'plan'`, the same pattern as `DataTable` and `DataChart`. The skill file at `reeboot/skills/visual-planning.md` instructs the agent on the structured output format for `/visual-plan` and `/visual-recap` commands. No separate rendering engine was added — the LLM outputs structured data and `PlanView` renders it inline. See request artifacts for full context.

Tools registered via `ExtensionAPI.registerTool()` can now return an optional `view` field on their result (`ToolResult.view`). The field propagates through both SDK paths: (1) the ree path wraps `view` in the TanStack tool server handler return and unwraps it in `TOOL_CALL_RESULT`, and (2) the pi path reads `view` from the tool's return in `tool_execution_end`. The WS broadcast flows automatically because `JSON.stringify(event)` includes all own properties. The WebChat `ToolCall` component switches on `view.type` and renders `DataTable`, `DataChart`, or falls back to the existing JSON card for unrecognized/absent views. The `mcp` proxy tool was equipped as the first consumer: `action: "list"` returns a data-table view, and `action: "call"` attempts structured JSON parsing for table rendering. The approach (structured result types with view hint, not a full `defineAction` abstraction) was chosen over Agent-Native's pattern because reeboot's pi/ree runtimes are sufficient and no new abstraction layer was needed. See request artifacts for full context.

### Delegate tool + A2A protocol — 2026-07-26 (Request: a2a-protocol)

The delegate extension at `reeboot/src/extensions/delegate.ts` registers a `delegate` tool via `ExtensionAPI.registerTool()` that accepts `{ task, peer?, timeout? }`. Same-process delegation uses a `runnerFactory` (SDK-agnostic via `AgentRunner` interface). Cross-process delegation uses an A2A client at `reeboot/src/extensions/a2a-client.ts` that sends HTTP POST to configured peers. A2A server endpoints (`GET /a2a/capabilities`, `POST /a2a/invoke`) are mounted on the existing Hono server. Peers are configured in `config.json` under `a2a.peers`. Both endpoints support optional API key auth via `Bearer` token. Timeout is enforced via `Promise.race` with `AbortController`. See request artifacts for full context.

### PlanView diagram uses SVG marker for directed edges, FileTreeView builds nested tree from flat paths — 2026-07-27 (Request: visual-planning)

During evaluation gap remediation, two rendering fidelity issues in `PlanView.tsx` were fixed. (1) Diagram edges were undirected plain `<line>` elements; fixed by adding an SVG `<defs><marker>` arrowhead definition and applying `markerEnd="url(#arrowhead)"` to each edge line. (2) FileTreeView rendered paths as a flat list (`📄 path` per entry); fixed by building a nested `TreeNode` structure via `buildTree()` that splits paths on `/`, aggregates shared directory prefixes into folder nodes (`📁`), and renders indented with file nodes (`📄`) at leaves. The `buildRecapView` helper in `tests/visual-planning/helpers.ts` was also extended with `extractBeforeAfterFiles()` that parses RED steps ("before" — files that didn't exist) and ACTION steps ("after" — files created/modified) from `tasks.md`, outputting two `file-tree` blocks titled "Before" and "After" — satisfying the brief's "before/after visual summary" requirement. The E2E recap test was strengthened to assert on both `Before` and `After` file-tree blocks. See request `visual-planning` artifacts and `evaluations.md` for full context.

### `'plan'` added as a first-class ToolView discriminant — 2026-07-27 (Request: visual-planning)

During evaluation gap remediation, `'plan'` was added to `VIEW_TYPES` in `src/structured-views.ts` and a `PlanBlock` interface + `{ type: 'plan'; blocks: PlanBlock[] }` variant was added to the `ToolView` discriminated union. Previously, `'plan'` was only handled as a one-off `if` branch in `ToolCall.tsx` — it was NOT a registered view type, violating the brief's stated dependency as "a downstream consumer of the structured tool views system." The `PlanBlock` interface is generic (`{ type: string; title?: string; [key: string]: unknown }`) to avoid coupling the type system to the full PlanBlock hierarchy defined in `PlanView.tsx.` The rendering dispatch in `ToolCall.tsx` remains a hard-coded `if` branch (consistent with how `data-table`, `data-chart`, etc. are dispatched) but the type system now recognizes `'plan'` as a valid discriminant, and `extractViewFromToolResult` accepts it transitively. The E2E tests in `tests/visual-planning/` were also upgraded from hard-coded fixture literals to a `buildPlanView`/`buildRecapView` helper that reads real reespec fixture files — proving the data flow from filesystem to structured output. See request `visual-planning` for full context.

### Pi-mode `setDefaultRunnerFactory` wiring in server.ts — 2027-07-27 (Request: a2a-protocol)

### Views are produced by thin wrapper tools, not parsed from LLM text — 2026-07-28 (Request: interactive-tool-views)

Structured views (data-table, data-chart, plan, form, confirm) are produced by dedicated tools that the LLM calls, not parsed from the LLM's free-text response. The LLM does the thinking and structuring; the tool just validates the input and returns it as a `view` on the tool result. The LLM-text-parsing approach (where a skill instructs the LLM to output raw JSON with a `view` field in its text response) was rejected because: (1) it requires fragile parsing of the assistant's markdown output, (2) it only works in webchat, and (3) it has no fallback for non-visual channels. The tool-result path already works end-to-end (proven by MCP data-table).

### Passive vs Interactive views — 2026-07-28 (Request: interactive-tool-views)

Views fall into two categories:
- **Passive (display only)**: data-table, data-chart, plan — the tool returns the view, the turn completes, the UI renders it. No user response needed.
- **Interactive (user response needed)**: form, confirm — the tool returns the view, the UI renders it, the user must respond, and the response must reach the agent.

Interactive views use the A2UI-inspired "structured action message" pattern: the user's form submission or confirm click is sent as a structured WebSocket message (`{ type: "action", action: "form_submit", fields: {...} }`), which the server injects into the conversation as a new user message. The LLM sees the structured data and continues. This avoids the complexity of pausing and resuming tool execution across network roundtrips. The alternative (tool-level pause/resume via ExtensionUIContext) was rejected because it requires long-lived tool state across channels and doesn't fit the existing streaming architecture.

### Channel-aware view fallback via `content` field — 2026-07-28 (Request: interactive-tool-views)

All tools that return a `view` MUST also return a `content` text field. The `content` is the universal fallback for non-webchat channels (WhatsApp, Signal, Telegram, CLI). Each channel adapter interprets the view according to its capabilities:
- Webchat: renders the full interactive widget + captures structured response
- WhatsApp: can use interactive message buttons for confirm, text fallback for forms
- Signal/Telegram: renders as text with reply instructions
- CLI: uses the existing Inquirer-based ExtensionUIContext primitives

The channel adapter is responsible for mapping the view type to the appropriate channel-specific interaction pattern. No view type assumes a particular rendering capability exists on every channel.

### Multi-step dynamic flows remain conversational — 2026-07-28 (Request: interactive-tool-views)

Multi-step, branching interactions (e.g., "create a company" where each answer changes what to ask next) are handled by the LLM talking naturally to the user. Forms are for collecting multiple fields at once (efficiency). Confirms are for yes/no safety gates. The LLM does NOT need special infrastructure for dynamic branching — it already handles this through ordinary conversation. A multi-field form is appropriate when the LLM knows exactly what fields it needs upfront and wants to reduce back-and-forth.

### Proactive + slash-command triggers — 2026-07-28 (Request: interactive-tool-views)

The LLM should call view-producing tools both:
- **Reactively** via slash commands (`/visual-plan`, `/visual-recap`) — skill files instruct the LLM to call the tool when it sees these commands
- **Proactively** via natural language understanding — tool descriptions and prompt guidelines teach the LLM when to call `render_plan`, `render_chart`, `render_form`, or `render_confirm` based on user intent

Post-evaluation gap remediation revealed that `server.ts` only called `setDefaultRunnerFactory()` in the ree-mode branch, leaving the pi-mode branch (default, config.sdk === 'pi') without a registered runner factory. Same-process `delegate({task})` calls in pi mode would fail in production with "Sub-agent runner is not available." Fixed by adding an identical `setDefaultRunnerFactory` call in the pi-mode branch, creating runners with `__a2a__${randomUUID()}` context IDs and their own workspace at `contexts/__a2a__/workspace`. The mechanism was already correct — `createRunner({ id, workspacePath }, appConfig)` creates a `PiAgentRunner` that inherits the main agent's model config. The only gap was the missing registration call. See evaluation entry `2027-07-27 14:25` and `server.ts` lines 270-273 for the fix.

### WhatsApp reconnection webchat timers + AbortController are stable across polling re-renders — 2026-07-28 (Request: whatsapp-web-reconnect)

Post-evaluation remediation added two webchat behaviours required by the specs: (1) `ChannelQrDialog` shows a "QR not working? Try phone number instead" fallback link after 30s and fires `onScanTimeout` after 2 min of an unscanned QR; (2) `Channels.tsx` passes an `AbortSignal` to the `/qr` and `/pair` fetches and aborts on unmount so navigation away cancels the in-flight link flow (no leaks / dangling requests / setState-on-unmounted). The critical detail: the dialog's timer effect depends on `onScanTimeout`, so `Channels.tsx` MUST pass a stable callback (`useCallback`) — otherwise the 5s channel-status poll re-renders Channels every 5s, passing a fresh inline arrow, which re-runs the dialog effect and resets the 30s/120s timers so they never fire. `handleScanTimeout` is therefore `useCallback(() => setDialogMode('timeout'), [])`. The other dialog callbacks (onClose/onRetryQr/onTryPairing/onPairingSubmit) remain plain functions — they are not in the timer effect deps (only used in onClick handlers), and the auto-close effect's re-runs are harmless because it early-returns when `isConnected` is false. The abort guards (`if (isLinkAborted(controller)) return`) prevent setState after navigation-away even when the mock fetch resolves post-abort; a real `fetch` would reject with AbortError and land in the same guard.

### Jina web-reader sidekick with self-host fallback — 2026-08-02 (Request: jina-web-reader)

Web reading is powered by an optional self-hosted Jina Reader sidekick
(`ghcr.io/jina-ai/reader:oss`, Apache-2.0, permissive) rather than a hosted
`r.jina.ai` API dependency, keeping reeboot self-contained ("self-contained with
optional self-hosted power-ups"). When `config.web.jina_base_url` is unset or the
sidekick is unhealthy, the extension registers nothing and reeboot keeps its existing
`fetch_url`/`web_search` baseline — the same graceful-degradation philosophy as the
SearXNG→DuckDuckGo web-search fallback, so the agent never loses capability it already
has. A new `web` config block (not overloading `search`) was added with
`jina_base_url`/`enabled`/`default_engine`. The browser/interactive tier (Steel,
browser-use, Playwright-driven browsing) was explicitly deferred — this request is
read/extract/search only. Security posture: the website blocklist (`isDomainBlocked`)
is applied to any target hostname BEFORE the URL is delegated to the local container,
so blocked URLs never reach the sidekick; `jina_read` is the must-have and `jina_search`
is best-effort.

**Refinement (2026-08-02): `jina_search` is NOT registered when the search route is
unavailable.** The OSS image smoke-test confirmed the search-that-reads route returns
400 (`Domain 'search' could not be resolved`), so while `jina_read` was confirmed working
against the real container, `jina_search` was initially implemented as a best-effort tool
that degraded to an explicit "search unavailable on this build" result. That was
reconsidered: registering a tool known to never return a usable result pollutes the
agent's tool set and prompts for no benefit — especially since a working `web_search`
already exists. The `jinaSearch()` implementation is kept for future builds that add the
route, but the tool is now gated behind a load-time search-route probe: `jina_search` is
registered (and its guidance injected) only when `GET {base}/search` actually responds
OK, mirroring the "never advertise a dead tool" philosophy. On the current OSS build the
agent sees only `jina_read` + its guidance and continues to use `web_search` for search.
See request artifacts for full context.
