import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

describe('Knowledge source deletion (E2)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_sources (
        id           TEXT PRIMARY KEY,
        path         TEXT NOT NULL UNIQUE,
        hash         TEXT NOT NULL,
        source_tier  TEXT NOT NULL,
        confidence   TEXT NOT NULL DEFAULT 'medium',
        filename     TEXT NOT NULL,
        format       TEXT NOT NULL,
        chunk_count  INTEGER NOT NULL DEFAULT 0,
        status       TEXT NOT NULL DEFAULT 'pending',
        ingested_at  TEXT,
        error        TEXT,
        created_at   TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS knowledge_chunks (
        rowid        INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id       TEXT NOT NULL,
        chunk_index  TEXT NOT NULL,
        content      TEXT NOT NULL
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
        content,
        doc_id UNINDEXED,
        chunk_index UNINDEXED,
        source_tier UNINDEXED
      );
    `);
  });

  it('S1: deleteKnowledgeSource removes all rows for a path', async () => {
    // Seed a knowledge_sources row
    db.prepare(
      `INSERT INTO knowledge_sources (id, path, hash, source_tier, confidence, filename, format)
       VALUES ('d1', '/raw/a.md', 'abc123', 'owner', 'high', 'a.md', 'md')`
    ).run();

    // Seed chunks
    db.prepare(
      `INSERT INTO knowledge_chunks (doc_id, chunk_index, content) VALUES ('d1', '0', 'chunk0 content')`
    ).run();
    db.prepare(
      `INSERT INTO knowledge_chunks (doc_id, chunk_index, content) VALUES ('d1', '1', 'chunk1 content')`
    ).run();

    // Seed FTS
    db.prepare(
      `INSERT INTO knowledge_fts (content, doc_id, chunk_index, source_tier) VALUES ('chunk0 content', 'd1', '0', 'owner')`
    ).run();
    db.prepare(
      `INSERT INTO knowledge_fts (content, doc_id, chunk_index, source_tier) VALUES ('chunk1 content', 'd1', '1', 'owner')`
    ).run();

    // Call deleteKnowledgeSource
    const { deleteKnowledgeSource } = await import('@src/knowledge/ingest.js');
    deleteKnowledgeSource(db, '/raw/a.md');

    // Source row gone
    const sourceRow = db.prepare('SELECT id FROM knowledge_sources WHERE path = ?').get('/raw/a.md');
    expect(sourceRow).toBeUndefined();

    // Chunks gone
    const chunkRows = db.prepare('SELECT count(*) as cnt FROM knowledge_chunks WHERE doc_id = ?').get('d1') as { cnt: number };
    expect(chunkRows.cnt).toBe(0);

    // FTS rows gone
    const ftsRows = db.prepare("SELECT count(*) as cnt FROM knowledge_fts WHERE doc_id = 'd1'").get() as { cnt: number };
    expect(ftsRows.cnt).toBe(0);
  });

  it('S2: unknown path is a no-op', async () => {
    const { deleteKnowledgeSource } = await import('@src/knowledge/ingest.js');
    expect(() => deleteKnowledgeSource(db, '/raw/missing.md')).not.toThrow();
  });
});
