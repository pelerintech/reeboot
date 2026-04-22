# Design: Domain Knowledge

## Approach

The domain knowledge system is split across three concerns, each with a clear home:

1. **Infrastructure** — SQLite schema additions (sqlite-vec, FTS5, metadata tables), embedding model wrapper, text extraction, chunking. Lives in `src/db/` and a new `src/knowledge/` module.
2. **Extension** — `extensions/knowledge-manager.ts` registers the agent tools (`knowledge_search`, `knowledge_ingest`, `knowledge_lint`, `knowledge_file`), watches `raw/` for new files, and handles the ingest notification flow.
3. **Wiki** — Purely filesystem-based (`~/.reeboot/knowledge/wiki/`). The agent writes and maintains wiki files using its native file tools. No special wiki engine — the agent IS the wiki engine, guided by system prompt instructions when `knowledge.wiki.enabled` is true.

## Directory structure

```
~/.reeboot/knowledge/
  raw/
    template/         ← pre-packaged with agent profile (read-only)
    owner/            ← owner-added documents (read-write)
  wiki/               ← only created when wiki.enabled=true
    index.md
    log.md
    concepts/
    sources/
    comparisons/
```

```
reeboot/
  src/
    knowledge/
      embedder.ts     ← nomic-embed-text-v1.5 singleton wrapper
      extractor.ts    ← text extraction per format (md/txt/csv/pdf)
      chunker.ts      ← sliding window chunker with overlap
      ingest.ts       ← full ingest pipeline (extract→chunk→embed→store)
      search.ts       ← hybrid search (vector + FTS5), result formatter
      watcher.ts      ← fs.watch on raw/, debounce, hash dedup
  extensions/
    knowledge-manager.ts  ← pi extension (tools + watcher lifecycle)
  src/config.ts       ← knowledge config schema additions
  src/db/schema.ts    ← sqlite-vec + FTS5 + metadata table migrations
```

## New npm dependencies

```json
"sqlite-vec": "^0.1.9",
"@huggingface/transformers": "^4.0.1",
"pdf-parse": "^1.1.1"
```

`sqlite-vec` is loaded as a SQLite extension via `db.loadExtension(sqliteVec.getLoadablePath())` immediately after `openDatabase()`. This must happen before any `vec0` virtual table operations.

## SQLite schema additions

```sql
-- Vector search (sqlite-vec extension)
CREATE VIRTUAL TABLE knowledge_chunks USING vec0(
  embedding float[768],
  +doc_id TEXT,
  +chunk_index INTEGER,
  +content TEXT
);

-- Raw document registry
CREATE TABLE knowledge_sources (
  id           TEXT PRIMARY KEY,
  path         TEXT NOT NULL UNIQUE,
  hash         TEXT NOT NULL,
  source_tier  TEXT NOT NULL,   -- 'template' | 'owner'
  confidence   TEXT NOT NULL DEFAULT 'medium', -- 'high' | 'medium' | 'low'
  filename     TEXT NOT NULL,
  format       TEXT NOT NULL,   -- 'md' | 'txt' | 'csv' | 'pdf' | 'plain'
  chunk_count  INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'ingested' | 'error'
  ingested_at  TEXT,
  error        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- FTS5 full-text search over chunk content
CREATE VIRTUAL TABLE knowledge_fts USING fts5(
  content,
  doc_id UNINDEXED,
  chunk_index UNINDEXED,
  source_tier UNINDEXED
);

-- Wiki page metadata (content lives in files)
CREATE TABLE wiki_pages (
  id           TEXT PRIMARY KEY,
  path         TEXT NOT NULL UNIQUE,
  page_type    TEXT NOT NULL,   -- 'concept' | 'source' | 'comparison'
  source_tier  TEXT NOT NULL DEFAULT 'wiki-synthesis',
  confidence   TEXT NOT NULL DEFAULT 'low',
  sources      TEXT NOT NULL DEFAULT '[]',  -- JSON array of doc_ids
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## Embedder module (`src/knowledge/embedder.ts`)

Singleton pattern — model loaded once, reused across all embedding calls.

```typescript
// Lazy-loaded on first call, cached for process lifetime
let _extractor: FeatureExtractionPipeline | null = null;

export async function embed(texts: string[], taskPrefix: 'search_document' | 'search_query'): Promise<Float32Array[]>
export async function embedOne(text: string, taskPrefix: ...): Promise<Float32Array>
```

Prepends task instruction prefix to every text before embedding:
- `search_document: <text>` — for corpus chunks at ingest time
- `search_query: <text>` — for user queries at retrieval time

On first call: downloads model if not cached (`~/.cache/huggingface/`), logs a one-time "downloading embedding model" notice via pi notification.

## Extractor module (`src/knowledge/extractor.ts`)

```typescript
export async function extractText(filePath: string): Promise<string>
```

Dispatch by extension:
- `.md`, `.txt`, and unrecognised plain-text → `fs.readFileSync`
- `.csv` → read + transform rows to `"Col1: val, Col2: val"` format per row
- `.pdf` → `pdf-parse` → extracted text

Returns plain string. Caller is responsible for chunking.

## Chunker module (`src/knowledge/chunker.ts`)

```typescript
export function chunk(text: string, chunkSize: number, overlap: number): string[]
```

Sliding window over sentences/paragraphs. Respects word boundaries. Returns array of overlapping text chunks.

## Ingest pipeline (`src/knowledge/ingest.ts`)

```typescript
export async function ingestDocument(
  filePath: string,
  sourceTier: 'template' | 'owner',
  confidence: 'high' | 'medium' | 'low',
  config: KnowledgeConfig,
  db: Database
): Promise<IngestResult>
```

Steps:
1. Extract text via `extractor.ts`
2. Chunk via `chunker.ts`
3. Embed all chunks via `embedder.ts` (batched)
4. Insert chunks into `knowledge_chunks` vec0 table and `knowledge_fts`
5. Insert/update row in `knowledge_sources`
6. Return `{ docId, chunkCount, confidence }`

## Search module (`src/knowledge/search.ts`)

```typescript
export async function hybridSearch(
  query: string,
  limit: number,
  config: KnowledgeConfig,
  db: Database
): Promise<SearchResult[]>
```

1. Embed query with `search_query:` prefix
2. Vector KNN search on `knowledge_chunks` → top-k by cosine distance
3. FTS5 search on `knowledge_fts` → keyword matches
4. Merge and deduplicate by doc_id + chunk_index (vector score takes precedence)
5. Enrich with `knowledge_sources` metadata (filename, source_tier, confidence)
6. Return formatted results with citations

## File watcher (`src/knowledge/watcher.ts`)

Reuses pi-file-watcher pattern:
- `fs.watch` on `raw/` with 300ms debounce
- Binary file detection (skip non-text until extractor handles it)
- Hash check against `knowledge_sources` — skip already-ingested files
- Queues newly detected files
- Closes watcher while agent is processing (pi `agent_end` hook reopens it)

```typescript
export class KnowledgeWatcher {
  start(rawDir: string): void
  stop(): void
  getPendingFiles(): string[]
  clearPending(): void
}
```

## Extension: knowledge-manager.ts

Registers on pi lifecycle hooks:

**`before_agent_start`** — if `knowledge.wiki.enabled`, injects a wiki maintenance instruction block into the system prompt telling the agent how the wiki is structured and what workflows to follow (schema document pattern from Karpathy). Also injects a brief knowledge base status summary (doc count, last ingest date).

**`agent_end`** — restarts file watcher if it was paused. Checks pending files queue — if files are waiting and agent is idle, triggers ingest notification turn.

**`session_shutdown`** — stops file watcher.

Registers four tools:

**`knowledge_search(query, limit?)`** — always registered when `knowledge.enabled`. Calls `hybridSearch`, returns formatted results with citations.

**`knowledge_ingest(filePath, interactive?)`** — always registered when `knowledge.enabled`. Runs ingest pipeline on a specific file. Used by agent during interactive ingest flow.

**`knowledge_file(content, filename, pageType)`** — registered when `knowledge.wiki.enabled`. Files a query insight as a new wiki page. Creates the markdown file, inserts `wiki_pages` metadata row.

**`knowledge_lint()`** — registered when `knowledge.wiki.enabled`. Triggers a lint pass — agent reads wiki files, identifies issues, returns structured report.

## Wiki system prompt block (when wiki.enabled)

Injected into `before_agent_start` when wiki is enabled:

```markdown
## Knowledge Base Wiki

Your wiki lives at ~/.reeboot/knowledge/wiki/. You maintain it entirely.
- wiki/index.md — master catalog, update on every ingest
- wiki/log.md — append-only activity record
- wiki/concepts/ — domain concept pages
- wiki/sources/ — per-document summaries
- wiki/comparisons/ — filed query insights

Every wiki page has YAML frontmatter:
  source_tier: wiki-synthesis
  confidence: low | medium | high
  sources: [list of doc ids]
  updated: YYYY-MM-DD

When answering questions, search the knowledge base first, then check the wiki index.
When filing insights, use knowledge_file tool.
Wiki citations must always note: "verify against primary sources."
```

## Ingest notification flow

When pending files are detected, the extension triggers a new agent turn with this prompt:

```
I found N new document(s) to ingest:
- <filename> (<source_tier>)
...

Would you like to go through them together (interactive), or shall I
process them and send you a summary when done (silent)?
```

Agent responds to owner. Owner replies "together" or "summary". Agent calls `knowledge_ingest` accordingly, driving the interactive or silent path.

## Config schema additions

```typescript
const KnowledgeWikiSchema = z.object({
  enabled: z.boolean().default(false),
  lint: z.object({
    schedule: z.string().default('0 9 * * 1'),
  }).default({}),
});

const KnowledgeConfigSchema = z.object({
  enabled: z.boolean().default(false),
  embeddingModel: z.string().default('nomic-ai/nomic-embed-text-v1.5'),
  dimensions: z.number().int().default(768),
  chunkSize: z.number().int().default(512),
  chunkOverlap: z.number().int().default(64),
  wiki: KnowledgeWikiSchema.default({}),
});
```

Knowledge is `enabled: false` by default — opt-in (unlike memory which is on by default). Wiki is always `false` by default.

## Tradeoffs considered

**Why a `src/knowledge/` module instead of putting everything in the extension?**
The ingest pipeline, embedder, chunker, and search are testable pure functions with no dependency on the pi API. Keeping them in `src/knowledge/` lets tests exercise them directly without mocking the full pi extension lifecycle. The extension becomes a thin orchestration layer.

**Why not embed wiki pages in the vector index?**
Wiki pages are LLM-synthesised artifacts — embedding them risks the agent finding and citing them as if they were primary sources, bypassing the explicit `wiki-synthesis` tier warning. The retrieval path for wiki content is intentionally different: the agent reads `index.md` and navigates by filename, not by similarity. This keeps the epistemics clean.

**Why hybrid search (vector + FTS5) instead of vector only?**
Legal and technical documents often contain precise terminology (statute numbers, clause identifiers, product codes) where keyword match outperforms semantic similarity. FTS5 catches exact-match cases that vector search misses. Vector search catches conceptual matches that keyword search misses. Merging both gives better recall with no additional infrastructure cost.

**Why `knowledge.enabled: false` by default (unlike memory)?**
Memory benefits all deployments immediately. Domain knowledge requires the owner to have a corpus to add — there is no value in enabling it on a fresh install with no documents. The first-run model download (~150MB) also makes silent auto-enable a poor user experience. Owner opts in explicitly when they have documents to add.
