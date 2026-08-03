import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync } from 'fs';

// No-op fs.watch so start() attaches no real watcher (no fd leaks / EMFILE);
// readFileSync/statSync stay real for the delete-on-unlink pipeline.
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, watch: vi.fn(() => ({ close: vi.fn() })) };
});

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
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(rawDir, { recursive: true, force: true });
    db.close();
  });

  it('S3: watcher invokes delete on unlink', async () => {
    const testFile = join(rawDir, 'a.md');
    writeFileSync(testFile, '# Test content', 'utf-8');

    db.prepare(`INSERT INTO knowledge_sources (id, path, hash, status, doc_id) VALUES (?, ?, ?, ?, ?)`)
      .run('src1', testFile, 'abc123', 'ingested', 'doc1');
    db.prepare(`INSERT INTO knowledge_chunks (doc_id, chunk_index, content) VALUES (?, ?, ?)`)
      .run('doc1', 0, '# Test content');
    db.prepare(`INSERT INTO knowledge_fts (doc_id, content) VALUES (?, ?)`)
      .run('doc1', '# Test content');

    const { KnowledgeWatcher } = await import('@src/knowledge/watcher.js');
    const watcher = new KnowledgeWatcher(db);
    watcher.start(rawDir);

    // Delete the file, then drive the fs event directly (deterministic).
    unlinkSync(testFile);
    watcher.handleFsEvent(rawDir, 'a.md');
    await vi.advanceTimersByTimeAsync(10);

    watcher.stop();

    // deleteKnowledgeSource runs synchronously on unlink — the source row is gone.
    const sourceRow = db.prepare('SELECT * FROM knowledge_sources WHERE path = ?').get(testFile) as any;
    expect(sourceRow).toBeUndefined();
  });
});
