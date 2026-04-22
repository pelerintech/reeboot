import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { loadVecExtension } from '../../src/db/index.js';
import { runKnowledgeMigration } from '../../src/db/schema.js';

function applyBaseSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contexts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      context_id TEXT NOT NULL REFERENCES contexts(id),
      channel TEXT NOT NULL,
      peer_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL
    );
  `);
}

describe('knowledge schema migration', () => {
  it('creates knowledge_sources table with correct columns', () => {
    const db = new Database(':memory:');
    loadVecExtension(db);
    applyBaseSchema(db);

    runKnowledgeMigration(db);

    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_sources'")
      .get() as { name: string } | undefined;
    expect(row).toBeDefined();

    const cols = (db.pragma('table_info(knowledge_sources)') as Array<{ name: string }>).map(
      (c) => c.name
    );
    expect(cols).toContain('id');
    expect(cols).toContain('path');
    expect(cols).toContain('hash');
    expect(cols).toContain('source_tier');
    expect(cols).toContain('confidence');
    expect(cols).toContain('filename');
    expect(cols).toContain('format');
    expect(cols).toContain('chunk_count');
    expect(cols).toContain('status');
    expect(cols).toContain('ingested_at');
    expect(cols).toContain('error');
    expect(cols).toContain('created_at');

    db.close();
  });

  it('creates knowledge_fts FTS5 virtual table with correct columns', () => {
    const db = new Database(':memory:');
    loadVecExtension(db);
    applyBaseSchema(db);

    runKnowledgeMigration(db);

    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_fts'")
      .get() as { name: string } | undefined;
    expect(row).toBeDefined();

    // Verify it's actually an FTS5 table by inserting and searching
    expect(() => {
      db.exec(`INSERT INTO knowledge_fts(content, doc_id, chunk_index, source_tier) VALUES ('test content', 'doc1', 0, 'owner')`);
      db.prepare(`SELECT rowid FROM knowledge_fts WHERE knowledge_fts MATCH ?`).all('test');
    }).not.toThrow();

    db.close();
  });

  it('creates wiki_pages table with correct columns', () => {
    const db = new Database(':memory:');
    loadVecExtension(db);
    applyBaseSchema(db);

    runKnowledgeMigration(db);

    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='wiki_pages'")
      .get() as { name: string } | undefined;
    expect(row).toBeDefined();

    const cols = (db.pragma('table_info(wiki_pages)') as Array<{ name: string }>).map(
      (c) => c.name
    );
    expect(cols).toContain('id');
    expect(cols).toContain('path');
    expect(cols).toContain('page_type');
    expect(cols).toContain('source_tier');
    expect(cols).toContain('confidence');
    expect(cols).toContain('sources');
    expect(cols).toContain('updated_at');

    db.close();
  });

  it('creates knowledge_chunks vec0 virtual table', () => {
    const db = new Database(':memory:');
    loadVecExtension(db);
    applyBaseSchema(db);

    runKnowledgeMigration(db);

    // Verify vec0 table exists by trying to insert and query
    expect(() => {
      const vec = new Float32Array(768).fill(0.1);
      const buf = Buffer.from(vec.buffer);
      db.prepare(
        `INSERT INTO knowledge_chunks (embedding, doc_id, chunk_index, content)
         VALUES (?, 'doc1', '0', 'test chunk')`
      ).run(buf);
    }).not.toThrow();

    db.close();
  });

  it('chunk_index stored as TEXT round-trips correctly as integer semantics', () => {
    // sqlite-vec auxiliary columns must be TEXT (not INTEGER) due to better-sqlite3
    // type binding constraints. This test verifies that storing chunk indices as
    // string representations and parsing back with parseInt preserves integer semantics.
    const db = new Database(':memory:');
    loadVecExtension(db);
    applyBaseSchema(db);
    runKnowledgeMigration(db);

    const vec = new Float32Array(768).fill(0.1);
    const buf = Buffer.from(vec.buffer);

    // Insert multiple chunks with different index values
    for (let i = 0; i < 3; i++) {
      db.prepare(
        `INSERT INTO knowledge_chunks (embedding, doc_id, chunk_index, content)
         VALUES (?, 'doc1', ?, ?)`
      ).run(buf, String(i), `chunk content ${i}`);
    }

    // Retrieve and verify integer round-trip via parseInt
    const rows = db.prepare(
      `SELECT doc_id, chunk_index, content FROM knowledge_chunks WHERE doc_id = 'doc1'`
    ).all() as Array<{ doc_id: string; chunk_index: string; content: string }>;

    expect(rows).toHaveLength(3);

    // Verify chunk_index values are stored as strings
    expect(typeof rows[0].chunk_index).toBe('string');

    // Verify parseInt round-trip preserves integer semantics
    const indices = rows.map((r) => parseInt(r.chunk_index, 10));
    expect(indices).toContain(0);
    expect(indices).toContain(1);
    expect(indices).toContain(2);

    // Verify all parsed indices are valid integers (not NaN)
    for (const idx of indices) {
      expect(Number.isInteger(idx)).toBe(true);
    }

    db.close();
  });

  it('migration is idempotent — running twice does not throw', () => {
    const db = new Database(':memory:');
    loadVecExtension(db);
    applyBaseSchema(db);

    expect(() => runKnowledgeMigration(db)).not.toThrow();
    expect(() => runKnowledgeMigration(db)).not.toThrow();

    db.close();
  });
});
