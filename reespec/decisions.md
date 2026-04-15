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
