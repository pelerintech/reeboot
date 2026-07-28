# Spec — knowledge-source-delete (WS-E2)

Deleting a source file removes its chunks, FTS entries, and source row from the knowledge index.

## S1 — deleteKnowledgeSource removes all rows for a path
- **GIVEN** a `knowledge_sources` row for path `/raw/a.md` (doc_id `d1`) with matching
  `knowledge_chunks` and `knowledge_fts` rows
- **WHEN** `deleteKnowledgeSource(db, '/raw/a.md')` is called
- **THEN** the `knowledge_sources` row for that path is gone, and `knowledge_chunks` / `knowledge_fts`
  have zero rows for `d1`.

## S2 — unknown path is a no-op
- **GIVEN** no source row for `/raw/missing.md`
- **WHEN** `deleteKnowledgeSource(db, '/raw/missing.md')` is called
- **THEN** it completes without error and changes no rows.

## S3 — watcher invokes delete on unlink
- **GIVEN** the watcher observing a `raw/` dir with an ingested file
- **WHEN** the file is removed and the debounce elapses
- **THEN** `deleteKnowledgeSource` is invoked for that path (index no longer returns its chunks).
