## Evaluation — 2026-04-15 17:39

### chunking-embedding
verdict: ✅ SATISFIED
reason: Spec requires sliding-window chunker with overlap, `embed(texts, 'search_document')` prepending `"search_document: "`, `embedOne(query, 'search_query')` prepending `"search_query: "`, Float32Array of length 768, and singleton reuse — all implemented in `src/knowledge/chunker.ts` and `src/knowledge/embedder.ts`, covered by passing tests in `tests/knowledge/chunker.test.ts` and `tests/knowledge/embedder.test.ts` (72 tests, all pass).

---

### knowledge-config
verdict: ✅ SATISFIED
reason: Spec requires defaults `enabled=false`, `embeddingModel="nomic-ai/nomic-embed-text-v1.5"`, `dimensions=768`, `chunkSize=512`, `chunkOverlap=64`, `wiki.enabled=false`, `wiki.lint.schedule="0 9 * * 1"` — all confirmed in `src/config.ts` (KnowledgeConfigSchema / KnowledgeWikiLintSchema). Conditional init of dirs, sqlite-vec loading, schema migration, watcher start, and wiki tool registration on `enabled=true` / `wiki.enabled=true` confirmed in `extensions/knowledge-manager.ts` and covered by `tests/knowledge-config.test.ts`.

---

### extraction
verdict: ✅ SATISFIED
reason: Spec requires `.md`/`.txt` pass-through, `.csv` column-context transform, `.pdf` via `pdf-parse`, unrecognised extensions read as plain text, and binary files throwing with clear message — all implemented in `src/knowledge/extractor.ts` and covered by 7 passing tests in `tests/knowledge/extractor.test.ts`.

---

### ingest-pipeline
verdict: ⚠️ PARTIAL
reason: Spec states `confidence` is "LLM-assigned at ingest" — brief says "Content quality judgement" is set by the LLM, not the caller. In practice, `ingestDocument` accepts `confidence` as a caller-supplied parameter and `knowledge_ingest` defaults it to `'medium'` when not provided; no LLM call to assess content quality is made anywhere in the ingest pipeline. All other pipeline steps (hash dedup, re-ingest with old chunk deletion, error status recording, vec0 + FTS5 insertion) are correctly implemented and tested.
focus: `extensions/knowledge-manager.ts` lines 329–350, `src/knowledge/ingest.ts` — LLM-assigned confidence judgement at ingest is absent; confidence is purely caller-supplied.

---

### schema
verdict: ✅ SATISFIED
reason: Spec requires `knowledge_sources` (with all 13 listed columns), `knowledge_fts` FTS5 virtual table, `wiki_pages` table, `knowledge_chunks` vec0 virtual table, and idempotent migration — all present in `src/db/schema.ts` (`runKnowledgeMigration`) and covered by 6 passing tests in `tests/db/knowledge-schema.test.ts`.

---

### hybrid-search
verdict: ✅ SATISFIED
reason: Spec requires hybrid vector KNN + FTS5 search, at most `limit` results, each with `content`, `filename`, `source_tier`, `confidence`, `doc_id`, `chunk_index`, deduplication with vector score taking precedence, and empty corpus returning `[]` — all implemented in `src/knowledge/search.ts` and covered by 6 passing tests in `tests/knowledge/search.test.ts`.

---

### knowledge-tools
verdict: ⚠️ PARTIAL
reason: Four tools (`knowledge_search`, `knowledge_ingest`, `knowledge_file`, `knowledge_lint`) are registered with correct gating logic and pass 17 tests in `tests/extensions/knowledge-manager.test.ts`. However, the brief specifies the `knowledge_lint` report must include "contradictions, orphan pages, missing concept pages, stale claims" and also "low-confidence clusters, and suggests next investigations" — all present. One gap: the `before_agent_start` wiki schema block is injected but the spec scenario says "the block describes wiki structure, workflows, and citation rules" — `buildWikiBlock` only describes directory structure and brief workflow; it does not include explicit citation rules. Additionally, the `knowledge_file` tool always writes `confidence='low'` for wiki pages regardless of the agent's assessment; the brief implies wiki-synthesis pages carry LLM-assigned confidence.
focus: `extensions/knowledge-manager.ts` `buildWikiBlock` function (citation rules absent from injected block); `knowledge_file` execute handler (confidence hardcoded to `'low'`, no LLM-assigned value accepted).

---

### file-watcher
verdict: ✅ SATISFIED
reason: Spec requires 300ms debounce, hash dedup against `knowledge_sources`, `getPendingFiles()`, `clearPending()`, binary file skip, ignored directory skip, and `stop()` clearing pending — all implemented in `src/knowledge/watcher.ts` and covered by 7 passing tests in `tests/knowledge/watcher.test.ts`. The `pause()`/`resume()` lifecycle (close-while-processing pattern from brief) is also implemented and tested.

---

## Triage

✅ Safe to skip: chunking-embedding, knowledge-config, extraction, schema, hybrid-search, file-watcher

⚠️ Worth a look:
- **ingest-pipeline** — brief says confidence is "LLM-assigned at ingest" (content quality judgement); actual implementation accepts it as a caller-supplied parameter with a `'medium'` default. No LLM call to assess document quality occurs anywhere in the ingest pipeline.
- **knowledge-tools** — (1) `buildWikiBlock` injects wiki directory structure but omits explicit citation rules that the spec requires ("the block describes wiki structure, workflows, and **citation rules**"). (2) `knowledge_file` hardcodes `confidence='low'` on all wiki pages regardless of agent assessment; brief allows LLM-assigned confidence on wiki pages.

❓ Human call: none — contract is sufficiently specified to judge all capabilities.

---

## Evaluation — 2026-04-15 16:52

### database-schema
verdict:  ⚠️ PARTIAL
reason:   The spec requires `knowledge_chunks` vec0 with "embedding float[768] and auxiliary columns doc_id, chunk_index, content" where `chunk_index` is implied INTEGER. The implementation defines `+chunk_index TEXT` — a deliberate deviation due to a sqlite-vec runtime constraint. All other columns and tables (`knowledge_sources`, `knowledge_fts`, `wiki_pages`, idempotency) are present and tested.
focus:    `reeboot/src/db/schema.ts` line 176 — `+chunk_index TEXT` vs. the spec's integer-semantics chunk_index

### knowledge-config
verdict:  ⚠️ PARTIAL
reason:   The spec states "GIVEN `knowledge.enabled: true` WHEN the extension initialises THEN sqlite-vec extension is loaded AND knowledge schema migration runs" — both are unconditional in `openDatabase()` regardless of `knowledge.enabled`. Spec treats these as gated on the feature flag; they now run for all deployments. Defaults, overrides, and wiki init scenarios are satisfied.
focus:    `reeboot/src/db/index.ts` lines 46 and 52 — `loadVecExtension` and `runKnowledgeMigration` called unconditionally

### text-extraction
verdict:  ⚠️ PARTIAL
reason:   md, txt, unrecognised extensions, binary detection, and CSV column-context are tested. The spec requires for PDF: "extracted text content is returned AND PDF metadata/headers are stripped." The PDF test mocks `pdf-parse` entirely — it cannot verify actual extraction or metadata stripping against a real PDF buffer.
focus:    `reeboot/tests/knowledge/extractor.test.ts` — PDF test uses a full mock; "PDF metadata/headers are stripped" is unverified

### chunking-embedding
verdict:  ⚠️ PARTIAL
reason:   All chunker scenarios and embedder scenarios are present. However, the spec states "adjacent chunks share overlap characters" — the test only checks that the last word of chunk[0] appears somewhere in chunk[1], not that `overlap` characters are shared. Overlap character-count assertion is weak.
focus:    `reeboot/tests/knowledge/chunker.test.ts` lines 34–38 — overlap verification checks one word only, not character count

### ingest-pipeline
verdict:  ⚠️ PARTIAL
reason:   The spec requires "3 rows exist in `knowledge_chunks` vec0 table for that doc_id" — the test only verifies FTS rows, not vec0 rows. Spec scenario "GIVEN a PDF file at raw/template/legislation.pdf … THEN chunks are stored and searchable" has no test. Brief states "confidence (content quality, LLM-assigned)" — `ingestDocument` accepts confidence as a caller-supplied parameter; no LLM call is made to assign confidence.
focus:    `reeboot/tests/knowledge/ingest.test.ts` — vec0 row count not verified; no PDF+template test; `reeboot/src/knowledge/ingest.ts` — no LLM confidence assignment

### hybrid-search
verdict:  ⚠️ PARTIAL
reason:   Empty corpus, field presence, limit, tier identification, and deduplication scenarios are tested. The spec requires "GIVEN corpus containing 'contractual obligations' WHEN hybridSearch('obligations between parties') THEN semantically related chunks returned even without exact keyword match" — this scenario is absent. With the embedder mocked to return identical fixed vectors, semantic differentiation cannot be verified.
focus:    `reeboot/tests/knowledge/search.test.ts` — semantic retrieval scenario ("without exact keyword match") is untested

### file-watcher
verdict:  ⚠️ PARTIAL
reason:   New file detection, already-ingested skip, clearPending, binary skip, and stop() are tested. Two spec scenarios are absent: "GIVEN a file has been ingested but then modified (new hash) THEN it DOES appear in getPendingFiles()" and "GIVEN a file in an ignored directory (.git/ inside raw/) THEN it does NOT appear in getPendingFiles()". The brief specifies "close-while-processing, reopen on `agent_end`" — the watcher is never paused at `before_agent_start` nor restarted at `agent_end`; it runs continuously.
focus:    `reeboot/tests/knowledge/watcher.test.ts` — missing re-ingest and ignored-directory scenarios; `reeboot/extensions/knowledge-manager.ts` — close-while-processing pattern absent

### knowledge-tools
verdict:  ⚠️ PARTIAL
reason:   Tool registration gating, knowledge_search citation format, knowledge_ingest result, knowledge_file creation, wiki_pages row, and wiki system prompt injection are satisfied. The spec requires knowledge_lint() to return a report that "includes: contradictions, orphan pages, missing concept pages, stale claims" — the implementation returns only page counts by type and low_confidence count. No contradiction, orphan, missing-concept, or stale-claim analysis is performed; the issues array is always empty unless the wiki has zero pages.
focus:    `reeboot/extensions/knowledge-manager.ts` lines 308–343 — knowledge_lint handler returns metadata counts only; no actual lint analysis

## Triage

✅ Safe to skip:  none fully satisfied without caveats
⚠️  Worth a look:
- **database-schema** — chunk_index stored as TEXT vs. implied INTEGER; runtime constraint documented but spec mismatch remains
- **knowledge-config** — sqlite-vec load and schema migration run unconditionally at DB open, not gated on knowledge.enabled as the spec describes
- **text-extraction** — PDF metadata/header stripping is unverified (mock-only test)
- **chunking-embedding** — overlap character-count assertion is weak; one word checked instead of overlap character count
- **ingest-pipeline** — vec0 row count untested; no PDF+template scenario; LLM confidence assignment absent (caller supplies value instead)
- **hybrid-search** — semantic retrieval scenario (no exact keyword match) is untested due to mocked embedder
- **file-watcher** — modified-file re-ingest scenario missing; ignored-directory scenario missing; close-while-processing pattern not implemented
- **knowledge-tools** — knowledge_lint returns page counts only; no contradiction/orphan/missing-concept/stale-claim analysis

---

## Evaluation — 2026-04-15 17:19

### chunking-embedding
verdic:   ✅ SATISFIED
reason:   Spec requires sliding-window chunker with overlap, singleton embedder with `search_document:` / `search_query:` prefixes, Float32Array of length 768, and singleton reuse. All 6 scenarios are covered by `src/knowledge/chunker.ts`, `src/knowledge/embedder.ts`, and passing tests (`tests/knowledge/chunker.test.ts` + `tests/knowledge/embedder.test.ts`, 10 tests).

### config
verdict:  ✅ SATISFIED
reason:   Spec requires defaults (enabled=false, embeddingModel, dimensions=768, chunkSize=512, chunkOverlap=64, wiki.enabled=false, wiki.lint.schedule), directory creation on enable, tool registration gating, and Matryoshka truncation. All present in `src/config.ts` (KnowledgeConfigSchema) and `extensions/knowledge-manager.ts`. `tests/knowledge-config.test.ts` covers 4 scenarios, all pass.

### extraction
verdict:  ✅ SATISFIED
reason:   Spec requires .md/.txt pass-through, CSV column-context transform, PDF via pdf-parse, unknown extensions as plain text, and binary-file error. All 7 scenarios implemented in `src/knowledge/extractor.ts` and covered by `tests/knowledge/extractor.test.ts` (7 tests, all pass).

### ingest
verdict:  ✅ SATISFIED
reason:   Spec requires extract→chunk→embed→store in vec0+FTS5→upsert knowledge_sources with source_tier and confidence, skip on same hash, re-ingest on new hash (delete old chunks), error status on failure. All 6 scenarios implemented in `src/knowledge/ingest.ts` and covered by `tests/knowledge/ingest.test.ts` (7 tests, all pass).

### schema
verdict:  ✅ SATISFIED
reason:   Spec requires `knowledge_sources` (12 columns), `knowledge_fts` FTS5 with content/doc_id/chunk_index/source_tier, `wiki_pages` with 7 columns, `knowledge_chunks` vec0 with float[768] and aux columns, and idempotency. All defined in `src/db/schema.ts::runKnowledgeMigration` and verified by `tests/db/knowledge-schema.test.ts` (6 tests, all pass).

### search
verdict:  ✅ SATISFIED
reason:   Spec requires hybrid KNN+FTS5 with limit, citation fields (content, filename, source_tier, confidence, doc_id, chunk_index), deduplication with vector score precedence, empty-corpus no-error, and cross-tier results. All 6 scenarios implemented in `src/knowledge/search.ts::hybridSearch` and covered by `tests/knowledge/search.test.ts` (6 tests, all pass).

### tools
verdict:  ⚠️ PARTIAL
reason:   `knowledge_search`, `knowledge_ingest`, `knowledge_file`, and `knowledge_lint` register correctly per config gates. The lint report includes contradictions, orphan pages, missing concept pages, and stale claims — satisfying the tools spec scenarios. The tools spec scenario "GIVEN knowledge.wiki.enabled is true / WHEN before_agent_start fires / THEN wiki schema block is injected / AND the block describes wiki structure, workflows, and citation rules" is satisfied (`buildWikiBlock` in `extensions/knowledge-manager.ts`). However, the brief's retrieval step 3 — "If wiki enabled: read wiki/index.md → drill into relevant concept pages" — is absent from `knowledge_search`; the tool only calls `hybridSearch` with no wiki augmentation. Additionally, the brief's lint goals mention "low-confidence clusters" and "suggested next investigations" which are absent from the lint report JSON. Both gaps exist in the brief but are not captured as spec scenarios.
focus:    `extensions/knowledge-manager.ts` — `knowledge_search` execute handler has no wiki drill-in; lint report lacks `suggested_next_investigations` (brief goals, not spec scenarios — advisory only).

### watcher
verdict:  ✅ SATISFIED
reason:   Spec requires 300ms debounce, hash-based dedup, `getPendingFiles()`, `clearPending()`, binary-file skip, hidden-dir skip (`.git/`), and `stop()` clearing all state. All 7 scenarios implemented in `src/knowledge/watcher.ts` and covered by `tests/knowledge/watcher.test.ts` (7 tests, all pass). Spec capability description says "pauses while the agent is processing" — the `pause()`/`resume()` lifecycle in `extensions/knowledge-manager.ts` satisfies this exactly.

## Triage

⚠️  Worth a look:
- **tools** — `knowledge_search` does not read wiki/index.md or drill into concept pages when wiki is enabled (brief retrieval step 3, absent from search spec); lint report omits "low-confidence clusters" and "suggested next investigations" (brief goals, not spec scenarios).

❓  Human call:
- Brief defines two ingest paths — "Interactive (default): one document at a time, agent reads source, shares takeaways, owner steers emphasis" vs. "Silent + notify: background processing with structured summary". The implementation sends a single notification message and relies on the agent to handle both modes conversationally via `knowledge_ingest`. No spec captures this two-path flow — human should decide whether the conversational LLM-driven approach satisfies "interactive default" or whether a structured pipeline distinction is required.

---
