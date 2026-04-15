# Tasks: Domain Knowledge

Read before starting: `brief.md`, `design.md`, `specs/`

---

### 1. Install new dependencies

- [ ] **RED** — Check: `reeboot/package.json` does not contain `sqlite-vec`, `@huggingface/transformers`, or `pdf-parse`. Assertion fails — packages are absent.
- [ ] **ACTION** — In `reeboot/`: run `npm install sqlite-vec @huggingface/transformers pdf-parse`. Verify `package.json` and `package-lock.json` are updated.
- [ ] **GREEN** — Verify: `package.json` contains all three packages. Run `npm run build` → exits 0 (no type errors from new deps).

---

### 2. sqlite-vec extension loading

- [ ] **RED** — Write `tests/db/sqlite-vec.test.ts`: open an in-memory better-sqlite3 db, attempt to create a `vec0` virtual table, assert it fails (extension not loaded). Load sqlite-vec extension, retry, assert `vec0` table creation succeeds and a KNN query runs without error. Run `vitest run tests/db/sqlite-vec.test.ts` → fails (no loader).
- [ ] **ACTION** — In `src/db/index.ts`: after `openDatabase()`, load sqlite-vec via `db.loadExtension(sqliteVec.getLoadablePath())`. Import `sqlite-vec` at the top. Export a `loadVecExtension(db)` helper for testability.
- [ ] **GREEN** — Run `vitest run tests/db/sqlite-vec.test.ts` → all assertions pass.

---

### 3. Knowledge schema migration

- [ ] **RED** — Write `tests/db/knowledge-schema.test.ts`: open an in-memory db with sqlite-vec loaded, run knowledge schema migration, assert `knowledge_sources`, `knowledge_chunks` (vec0), `knowledge_fts` (FTS5), and `wiki_pages` tables all exist with correct columns. Run migration twice, assert no error (idempotent). Run `vitest run tests/db/knowledge-schema.test.ts` → fails.
- [ ] **ACTION** — In `src/db/schema.ts`: add `runKnowledgeMigration(db)` that creates all four tables/virtual tables. Call from `applySchema` / `runMigration` path.
- [ ] **GREEN** — Run `vitest run tests/db/knowledge-schema.test.ts` → all assertions pass.

---

### 4. Knowledge config schema

- [ ] **RED** — Write `tests/knowledge-config.test.ts`: parse config with no `knowledge` key, assert defaults (enabled=false, embeddingModel="nomic-ai/nomic-embed-text-v1.5", dimensions=768, chunkSize=512, chunkOverlap=64, wiki.enabled=false, wiki.lint.schedule="0 9 * * 1"). Parse config with `knowledge.enabled: true, knowledge.dimensions: 512`, assert values respected. Run `vitest run tests/knowledge-config.test.ts` → fails.
- [ ] **ACTION** — In `src/config.ts`: add `KnowledgeWikiSchema`, `KnowledgeConfigSchema`, add `knowledge` field to `ConfigSchema` with `default({})`.
- [ ] **GREEN** — Run `vitest run tests/knowledge-config.test.ts` → all assertions pass.

---

### 5. Text extractor

- [ ] **RED** — Write `tests/knowledge/extractor.test.ts`: create tmp files — a `.md` file, a `.txt` file, a `.csv` file with headers + 2 rows, a mock `.pdf` (use pdf-parse with a real minimal PDF buffer or mock the module). Assert `extractText` returns raw content for md/txt, returns column-context rows for csv, returns text content for pdf. Assert binary detection throws an error. Run `vitest run tests/knowledge/extractor.test.ts` → fails.
- [ ] **ACTION** — Create `src/knowledge/extractor.ts`: implement `extractText(filePath)` with format dispatch — md/txt/plain → `fs.readFileSync`, csv → column-context transform, pdf → `pdf-parse`. Add binary detection (null byte check). Export for testability.
- [ ] **GREEN** — Run `vitest run tests/knowledge/extractor.test.ts` → all assertions pass.

---

### 6. Chunker

- [ ] **RED** — Write `tests/knowledge/chunker.test.ts`: assert `chunk("", 512, 64)` returns `[]`. Assert short text returns one chunk. Assert long text (>1024 chars) with chunkSize=512, overlap=64 returns multiple chunks where adjacent chunks share content, no chunk exceeds chunkSize. Run `vitest run tests/knowledge/chunker.test.ts` → fails.
- [ ] **ACTION** — Create `src/knowledge/chunker.ts`: implement sliding window `chunk(text, chunkSize, overlap)`. Respect word boundaries — don't split mid-word. Export for testability.
- [ ] **GREEN** — Run `vitest run tests/knowledge/chunker.test.ts` → all assertions pass.

---

### 7. Embedder

- [ ] **RED** — Write `tests/knowledge/embedder.test.ts`: mock `@huggingface/transformers` pipeline to return known fixed-length Float32Array results. Call `embed(["hello world"], 'search_document')`, assert the input was prefixed with "search_document: " before the mock was called. Call `embedOne("query", 'search_query')`, assert "search_query: " prefix. Assert singleton — second call does not re-initialise the pipeline (mock called once). Run `vitest run tests/knowledge/embedder.test.ts` → fails.
- [ ] **ACTION** — Create `src/knowledge/embedder.ts`: implement singleton `embed` and `embedOne` with task prefix prepending. Lazy-load `@huggingface/transformers` pipeline on first call. Apply Matryoshka truncation if `dimensions < 768`. Export `resetEmbedder()` for test isolation.
- [ ] **GREEN** — Run `vitest run tests/knowledge/embedder.test.ts` → all assertions pass.

---

### 8. Ingest pipeline — happy path

- [ ] **RED** — Write `tests/knowledge/ingest.test.ts`: open in-memory db with sqlite-vec + knowledge schema, mock embedder to return known Float32Array, create a tmp md file. Call `ingestDocument(filePath, 'owner', 'medium', config, db)`. Assert `knowledge_sources` row inserted with correct source_tier, confidence, status='ingested'. Assert `chunk_count` > 0. Assert rows exist in `knowledge_chunks` and `knowledge_fts`. Run `vitest run tests/knowledge/ingest.test.ts` → fails.
- [ ] **ACTION** — Create `src/knowledge/ingest.ts`: implement `ingestDocument` — extract → chunk → embed → store in vec0 + FTS5 → upsert `knowledge_sources`. Hash file content for dedup. Return `IngestResult`.
- [ ] **GREEN** — Run `vitest run tests/knowledge/ingest.test.ts` → happy path assertions pass.

---

### 9. Ingest pipeline — dedup and re-ingest

- [ ] **RED** — In `tests/knowledge/ingest.test.ts`: add tests — call `ingestDocument` on the same file twice (same hash), assert `knowledge_sources` has exactly 1 row, chunks not duplicated. Modify file content (new hash), call again, assert old chunks deleted and new chunks inserted, `knowledge_sources` updated. Add test for extraction failure — mock extractor to throw, assert `knowledge_sources.status='error'` and `error` field populated. Run → fails.
- [ ] **ACTION** — In `src/knowledge/ingest.ts`: add hash-based skip for unchanged files. Add delete-old-chunks logic for re-ingest. Add error handling that writes status='error' to `knowledge_sources`.
- [ ] **GREEN** — Run `vitest run tests/knowledge/ingest.test.ts` → all assertions pass.

---

### 10. Hybrid search

- [ ] **RED** — Write `tests/knowledge/search.test.ts`: open in-memory db, mock embedder, ingest two documents with known content. Call `hybridSearch("known term", 5, config, db)`. Assert results are returned with filename, source_tier, confidence, content excerpt. Assert deduplication — same chunk doesn't appear twice. Assert empty corpus returns `[]`. Run `vitest run tests/knowledge/search.test.ts` → fails.
- [ ] **ACTION** — Create `src/knowledge/search.ts`: implement `hybridSearch` — embed query with `search_query:` prefix, vector KNN on `knowledge_chunks`, FTS5 on `knowledge_fts`, merge + dedup, enrich with `knowledge_sources` metadata, return `SearchResult[]`.
- [ ] **GREEN** — Run `vitest run tests/knowledge/search.test.ts` → all assertions pass.

---

### 11. File watcher

- [ ] **RED** — Write `tests/knowledge/watcher.test.ts`: create a tmp raw/ dir with an in-memory db (knowledge schema loaded). Instantiate `KnowledgeWatcher`, start it on the tmp dir. Write a new `.md` file, wait >300ms, assert file appears in `getPendingFiles()`. Write the same file again (unchanged), assert it does NOT appear again. Call `clearPending()`, assert `getPendingFiles()` empty. Write a binary file (Buffer with null byte), assert it does NOT appear in pending. Call `stop()`, write another file, assert it does NOT appear. Run `vitest run tests/knowledge/watcher.test.ts` → fails.
- [ ] **ACTION** — Create `src/knowledge/watcher.ts`: implement `KnowledgeWatcher` class — `fs.watch` with 300ms debounce, binary detection, hash check against `knowledge_sources`, `start/stop/getPendingFiles/clearPending` API.
- [ ] **GREEN** — Run `vitest run tests/knowledge/watcher.test.ts` → all assertions pass.

---

### 12. Knowledge extension — tool registration and config gating

- [ ] **RED** — Write `tests/extensions/knowledge-manager.test.ts`: build mock pi API. Register extension with `knowledge.enabled=false`, assert no tools registered. Register with `knowledge.enabled=true, wiki.enabled=false`, assert `knowledge_search` and `knowledge_ingest` registered, `knowledge_file` and `knowledge_lint` NOT registered. Register with `knowledge.enabled=true, wiki.enabled=true`, assert all four tools registered. Run `vitest run tests/extensions/knowledge-manager.test.ts` → fails.
- [ ] **ACTION** — Create `extensions/knowledge-manager.ts`: implement pi extension — register tools based on config flags. Wire `KnowledgeWatcher`, `hybridSearch`, `ingestDocument` from `src/knowledge/`.
- [ ] **GREEN** — Run `vitest run tests/extensions/knowledge-manager.test.ts` → tool registration assertions pass.

---

### 13. Knowledge extension — knowledge_search tool

- [ ] **RED** — In `tests/extensions/knowledge-manager.test.ts`: add test — mock `hybridSearch` to return known results, call `knowledge_search` tool handler with a query, assert results are returned in the expected citation format (filename, source_tier, confidence, excerpt). Run → fails.
- [ ] **ACTION** — In `knowledge-manager.ts`: implement `knowledge_search` handler — call `hybridSearch`, format results as citation strings, return.
- [ ] **GREEN** — Run `vitest run tests/extensions/knowledge-manager.test.ts` → search tool assertions pass.

---

### 14. Knowledge extension — knowledge_ingest tool

- [ ] **RED** — In `tests/extensions/knowledge-manager.test.ts`: add test — mock `ingestDocument` to return a known `IngestResult`, call `knowledge_ingest` tool handler with a file path, assert `ingestDocument` was called with correct args and result is returned. Run → fails.
- [ ] **ACTION** — In `knowledge-manager.ts`: implement `knowledge_ingest` handler — resolve file path, call `ingestDocument`, return result summary.
- [ ] **GREEN** — Run `vitest run tests/extensions/knowledge-manager.test.ts` → ingest tool assertions pass.

---

### 15. Knowledge extension — watcher lifecycle + ingest notification

- [ ] **RED** — In `tests/extensions/knowledge-manager.test.ts`: add test — start extension with `knowledge.enabled=true`, simulate `agent_end` with pending files in watcher, assert a `sendUserMessage` was called with a notification listing the pending files and offering interactive/summary choice. Simulate `session_shutdown`, assert watcher is stopped. Run → fails.
- [ ] **ACTION** — In `knowledge-manager.ts`: implement `agent_end` handler — check `watcher.getPendingFiles()`, if non-empty and agent idle, call `pi.sendUserMessage` with ingest notification prompt. Implement `session_shutdown` handler — call `watcher.stop()`.
- [ ] **GREEN** — Run `vitest run tests/extensions/knowledge-manager.test.ts` → lifecycle assertions pass.

---

### 16. Wiki tools — knowledge_file and knowledge_lint

- [ ] **RED** — In `tests/extensions/knowledge-manager.test.ts`: add tests — with `wiki.enabled=true` and tmp wiki dir, call `knowledge_file` handler with content, filename="test.md", pageType="comparison", assert file created at `wiki/comparisons/test.md`, assert `wiki_pages` row inserted with source_tier='wiki-synthesis', confidence='low'. Call `knowledge_lint` handler, assert a structured report string is returned. Run → fails.
- [ ] **ACTION** — In `knowledge-manager.ts`: implement `knowledge_file` handler — write file to correct wiki subdirectory, insert `wiki_pages` row. Implement `knowledge_lint` handler — read wiki files, build lint prompt, call LLM, return structured report.
- [ ] **GREEN** — Run `vitest run tests/extensions/knowledge-manager.test.ts` → wiki tool assertions pass.

---

### 17. Wiki system prompt injection

- [ ] **RED** — In `tests/extensions/knowledge-manager.test.ts`: add test — build mock pi with `wiki.enabled=true`, fire `before_agent_start`, assert the injected system prompt suffix contains wiki structure description, workflow instructions, and citation rules. With `wiki.enabled=false`, assert no wiki block injected. Run → fails.
- [ ] **ACTION** — In `knowledge-manager.ts`: implement `before_agent_start` handler — if `wiki.enabled`, inject wiki schema block into system prompt suffix. Include wiki directory map, workflow instructions, frontmatter format, and citation rules.
- [ ] **GREEN** — Run `vitest run tests/extensions/knowledge-manager.test.ts` → wiki prompt injection assertions pass.

---

### 18. Wiki lint scheduled task

- [ ] **RED** — Write `tests/knowledge-lint-schedule.test.ts`: build mock scheduler, register extension with `wiki.enabled=true, wiki.lint.schedule="0 9 * * 1"`, assert a lint task is registered with that schedule. With `wiki.enabled=false`, assert no lint task registered. Run `vitest run tests/knowledge-lint-schedule.test.ts` → fails.
- [ ] **ACTION** — In `knowledge-manager.ts`: on init, if `knowledge.enabled && wiki.enabled`, register a lint scheduled task with `globalScheduler` using the configured schedule. Task triggers `knowledge_lint` and delivers report via `sendToDefaultChannel`.
- [ ] **GREEN** — Run `vitest run tests/knowledge-lint-schedule.test.ts` → schedule assertions pass.

---

### 19. Wire knowledge-manager into server startup + directory init

- [ ] **RED** — Write `tests/knowledge-integration.test.ts`: start a minimal reeboot server with `knowledge.enabled=true` pointing to a tmp dir. Assert `raw/template/` and `raw/owner/` directories are created. Assert `knowledge_sources`, `knowledge_chunks`, `knowledge_fts`, `wiki_pages` tables exist in db. With `wiki.enabled=true`, assert `wiki/`, `wiki/index.md`, `wiki/log.md` are created. Run `vitest run tests/knowledge-integration.test.ts` → fails.
- [ ] **ACTION** — In `src/server.ts`: add `knowledge-manager.ts` to bundled extensions. Add `initKnowledgeDirs(knowledgeDir, wikiEnabled)` that creates raw/template/, raw/owner/, and optionally wiki/ with index.md and log.md stubs. Call on startup when `knowledge.enabled`.
- [ ] **GREEN** — Run `vitest run tests/knowledge-integration.test.ts` → startup assertions pass.

---

### 20. Update agent-roadmap.md

- [ ] **RED** — Check: `agent-roadmap.md` Knowledge & RAG section shows `💡 idea` for local RAG / embedded knowledge base. Assertion fails — status is not `🔄`.
- [ ] **ACTION** — Update `/Users/bn/p/pel/reeboot/agent-roadmap.md`: change local RAG / embedded knowledge base status to `🔄 in progress [domain-knowledge]`.
- [ ] **GREEN** — Verify: `agent-roadmap.md` Knowledge & RAG section shows `🔄 in progress [domain-knowledge]`.
