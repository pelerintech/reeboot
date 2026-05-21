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
