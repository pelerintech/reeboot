---
title: "Domain Knowledge"
description: "Ingest your documents and let the agent search them with local vector embeddings — no cloud required."
---

# Domain Knowledge

Domain knowledge lets you build a searchable corpus from your own documents. The agent uses local vector embeddings to find relevant chunks and synthesise answers — no data leaves your machine.

Domain knowledge is **disabled by default**. Enable it explicitly:

```json
{
  "knowledge": { "enabled": true }
}
```

---

## How It Works

```
  Your documents
       │
       ▼
  Chunking (512 tokens, 64 overlap)
       │
       ▼
  Embedding (nomic-embed-text-v1.5, local ONNX)
       │
       ▼
  sqlite-vec (vec0 virtual table in reeboot.db)
       │
       ▼
  FTS5 full-text index (in reeboot.db)
       │
       ▼
  Agent tools: knowledge_search, knowledge_ingest, knowledge_lint
```

The embedding model downloads once on first use and is cached locally. No API key or internet connection is required after that.

---

## Document Tiers

| Tier | Path | Purpose |
|---|---|---|
| `template` | `~/.reeboot/knowledge/raw/template/` | Pre-packaged knowledge shipped with agent profiles |
| `owner` | `~/.reeboot/knowledge/raw/owner/` | Documents you add (PDFs, Markdown, text files) |

Both tiers feed the same vector index. The `source_tier` field on every chunk tells the agent where a piece of knowledge came from.

---

## Ingesting Documents

Drop files into `~/.reeboot/knowledge/raw/owner/` — reeboot watches this directory and ingests new files automatically.

Or ask the agent directly:

```
Ingest this document: [paste content or file path]
```

Supported formats: plain text, Markdown, PDF.

---

## Wiki Synthesis Mode

Wiki synthesis is an optional layer on top of RAG. When enabled, the agent maintains a set of Markdown pages in `~/.reeboot/knowledge/wiki/` that synthesise knowledge across documents — cross-referencing, resolving contradictions, and building a structured knowledge base.

Enable it:

```json
{
  "knowledge": {
    "enabled": true,
    "wiki": { "enabled": true }
  }
}
```

**Tradeoffs**: wiki synthesis adds LLM processing at ingest time, carries a risk of hallucination contamination (synthesised cross-references can look authoritative), and requires more storage. For most use cases, pure RAG mode (wiki disabled) is recommended.

---

## Agent Tools

| Tool | What it does |
|---|---|
| `knowledge_search` | Vector + FTS5 search over the corpus |
| `knowledge_ingest` | Ingest a document into the corpus |
| `knowledge_lint` | Check for orphaned pages, stale claims, contradictions |

---

## Configuration Reference

| Field | Type | Default | Description |
|---|---|---|---|
| `knowledge.enabled` | boolean | `false` | Enable domain knowledge. When false, no vector index or FTS5 table is created. |
| `knowledge.embeddingModel` | string | `"nomic-ai/nomic-embed-text-v1.5"` | Local ONNX model for embeddings. 8192-token context, no API key needed. |
| `knowledge.dimensions` | number | `768` | Embedding vector dimensions. Must match the model. |
| `knowledge.chunkSize` | number | `512` | Token chunk size for document splitting. |
| `knowledge.chunkOverlap` | number | `64` | Overlap in tokens between consecutive chunks. |
| `knowledge.wiki.enabled` | boolean | `false` | Enable wiki synthesis mode. |
| `knowledge.wiki.lint.schedule` | string | `"0 9 * * 1"` | Cron schedule for wiki lint. Default: 9 AM every Monday. |

---

## Developer Notes

- Vector storage uses [sqlite-vec](https://github.com/asg017/sqlite-vec) (`vec0` virtual table). sqlite-vec is pre-v1 but Mozilla-backed and production-tested.
- Auxiliary columns in sqlite-vec are declared as `TEXT`, not `INTEGER`, due to a known type-binding limitation in better-sqlite3. Integer values are stored as strings and parsed on retrieval.
- Wiki content lives as Markdown files (filesystem); metadata is mirrored in the `wiki_pages` SQLite table. Files are the source of truth.
