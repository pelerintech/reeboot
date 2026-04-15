# Spec: Database Schema

## Capability

SQLite schema additions for domain knowledge: sqlite-vec extension loading, `knowledge_chunks` vec0 virtual table, `knowledge_sources` registry, `knowledge_fts` FTS5 table, and `wiki_pages` metadata table.

---

## Scenarios

### GIVEN a fresh reeboot.db
### WHEN the knowledge schema migration runs
### THEN `knowledge_sources` table exists with columns: id, path, hash, source_tier, confidence, filename, format, chunk_count, status, ingested_at, error, created_at

---

### GIVEN a fresh reeboot.db
### WHEN the knowledge schema migration runs
### THEN `knowledge_fts` FTS5 virtual table exists with columns: content, doc_id, chunk_index, source_tier

---

### GIVEN a fresh reeboot.db
### WHEN the knowledge schema migration runs
### THEN `wiki_pages` table exists with columns: id, path, page_type, source_tier, confidence, sources, updated_at

---

### GIVEN sqlite-vec is loaded
### WHEN the knowledge schema migration runs
### THEN `knowledge_chunks` vec0 virtual table exists with embedding float[768] and auxiliary columns doc_id, chunk_index, content

---

### GIVEN the migration has already run
### WHEN the migration runs again
### THEN no error is thrown (idempotent — all CREATE TABLE IF NOT EXISTS)
