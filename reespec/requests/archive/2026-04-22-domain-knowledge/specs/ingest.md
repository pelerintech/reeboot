# Spec: Ingest Pipeline

## Capability

Full ingest pipeline: extract text → chunk → embed → store in vec0 + FTS5 → register in knowledge_sources with source_tier and confidence.

---

## Scenarios

### GIVEN a markdown file at `raw/owner/doc.md`
### WHEN `ingestDocument` is called with source_tier='owner', confidence='medium'
### THEN a row is inserted in `knowledge_sources` with path, hash, source_tier='owner', confidence='medium', status='ingested'
### AND `chunk_count` reflects the number of chunks produced
### AND `ingested_at` is set

---

### GIVEN a document with 3 chunks
### WHEN `ingestDocument` completes
### THEN 3 rows exist in `knowledge_chunks` vec0 table for that doc_id
### AND 3 rows exist in `knowledge_fts` for that doc_id

---

### GIVEN a document that has already been ingested (same path, same hash)
### WHEN `ingestDocument` is called again
### THEN it is skipped (no duplicate rows inserted)
### AND the existing `knowledge_sources` row is unchanged

---

### GIVEN a document that has been re-saved with new content (same path, different hash)
### WHEN `ingestDocument` is called
### THEN old chunks for that doc_id are deleted from `knowledge_chunks` and `knowledge_fts`
### AND new chunks are inserted
### AND the `knowledge_sources` row is updated with the new hash and ingested_at

---

### GIVEN a PDF file at `raw/template/legislation.pdf`
### WHEN `ingestDocument` is called with source_tier='template'
### THEN `knowledge_sources.source_tier` is 'template'
### AND chunks are stored and searchable

---

### GIVEN a file that fails text extraction (e.g. corrupt PDF)
### WHEN `ingestDocument` is called
### THEN `knowledge_sources.status` is set to 'error'
### AND `knowledge_sources.error` contains the error message
### AND no chunks are inserted
