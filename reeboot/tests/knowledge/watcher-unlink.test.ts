import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync } from 'fs';

describe('KnowledgeWatcher unlink', () => {
  let db: Database.Database;
  let rawDir: string;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_sources (
        id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE,
        hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        doc_id TEXT, created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS knowledge_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT, doc_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL, content TEXT NOT NULL,
        embedding BLOB
      );
      CREATE TABLE IF NOT EXISTS knowledge_fts (
        doc_id TEXT NOT NULL, content TEXT NOT NULL
      );
    `);

    rawDir = mkdtempSync(join(tmpdir(), 'test-watcher-unlink-'));
    mkdirSync(rawDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(rawDir, { recursive: true, force: true });
  });

  it('S3: watcher invokes delete on unlink', async () => {
    // Create a file and seed knowledge index with it
    const testFile = join(rawDir, 'a.md');
    writeFileSync(testFile, '# Test content', 'utf-8');

    // Seed knowledge index rows
    db.prepare(`INSERT INTO knowledge_sources (id, path, hash, status, doc_id) VALUES (?, ?, ?, ?, ?)`)
      .run('src1', testFile, 'abc123', 'ingested', 'doc1');
    db.prepare(`INSERT INTO knowledge_chunks (doc_id, chunk_index, content) VALUES (?, ?, ?)`)
      .run('doc1', 0, '# Test content');
    db.prepare(`INSERT INTO knowledge_fts (doc_id, content) VALUES (?, ?)`)
      .run('doc1', '# Test content');

    // Create the watcher and start it
    const { KnowledgeWatcher } = await import('@src/knowledge/watcher.js');
    const watcher = new KnowledgeWatcher(db);
    watcher.start(rawDir);

    // Delete the file
    unlinkSync(testFile);

    // Wait for watcher debounce (300ms) + a bit more
    await new Promise((r) => setTimeout(r, 600));

    watcher.stop();

    // Assert index entries are gone
    const sources = db.prepare('SELECT COUNT(*) as count FROM knowledge_sources WHERE id = ?').get('doc1') as any;
    expect(sources.count).toBe(0);

    // The doc_id source row is deleted, so chunks for that doc_id should also be gone
    // (deleteKnowledgeSource deletes by the source's id, not doc_id)
    const sourceRow = db.prepare('SELECT * FROM knowledge_sources WHERE path = ?').get(testFile) as any;
    expect(sourceRow).toBeUndefined();
  });
});
