import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadVecExtension } from '../../src/db/index.js';
import { runKnowledgeMigration } from '../../src/db/schema.js';

// Replace node's fs.watch with a no-op so start() attaches no real watcher
// (no fd leaks / EMFILE), while readFileSync/statSync etc. stay real so the
// pending-queue logic is exercised against actual files.
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, watch: vi.fn(() => ({ close: vi.fn() })) };
});

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  loadVecExtension(db);
  runKnowledgeMigration(db);
  return db;
}

describe('KnowledgeWatcher', () => {
  let rawDir: string;
  let db: Database.Database;

  beforeEach(() => {
    rawDir = join(tmpdir(), `watcher-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(rawDir, 'owner'), { recursive: true });
    mkdirSync(join(rawDir, 'template'), { recursive: true });
    db = makeDb();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    db.close();
    try { rmSync(rawDir, { recursive: true, force: true }); } catch {}
  });

  /** Drive one fs event and let the 300ms debounce elapse, deterministically. */
  async function fire(rawDir: string, watcher: any, relPath: string) {
    watcher.handleFsEvent(rawDir, relPath);
    await vi.advanceTimersByTimeAsync(400);
  }

  it('detects a new .md file after debounce window', async () => {
    const { KnowledgeWatcher } = await import('../../src/knowledge/watcher.js');
    const watcher = new KnowledgeWatcher(db);
    watcher.start(rawDir);

    writeFileSync(join(rawDir, 'owner', 'test.md'), '# Hello world', 'utf-8');
    await fire(rawDir, watcher, join('owner', 'test.md'));

    expect(watcher.getPendingFiles().some((p) => p.endsWith('test.md'))).toBe(true);
    watcher.stop();
  });

  it('does not add already-ingested file (same hash) to pending', async () => {
    const { KnowledgeWatcher } = await import('../../src/knowledge/watcher.js');

    const filePath = join(rawDir, 'owner', 'known.md');
    const content = '# Already ingested document';
    writeFileSync(filePath, content, 'utf-8');

    const { createHash } = await import('crypto');
    const { readFileSync } = await import('fs');
    const hash = createHash('sha256').update(readFileSync(filePath)).digest('hex');

    db.prepare(`
      INSERT INTO knowledge_sources (id, path, hash, source_tier, confidence, filename, format, status)
      VALUES ('id1', ?, ?, 'owner', 'medium', 'known.md', 'md', 'ingested')
    `).run(filePath, hash);

    const watcher = new KnowledgeWatcher(db);
    watcher.start(rawDir);

    await fire(rawDir, watcher, join('owner', 'known.md'));

    expect(watcher.getPendingFiles().every((p) => !p.endsWith('known.md'))).toBe(true);
    watcher.stop();
  });

  it('clearPending empties the pending queue', async () => {
    const { KnowledgeWatcher } = await import('../../src/knowledge/watcher.js');
    const watcher = new KnowledgeWatcher(db);
    watcher.start(rawDir);

    writeFileSync(join(rawDir, 'owner', 'clear-test.md'), '# Content', 'utf-8');
    await fire(rawDir, watcher, join('owner', 'clear-test.md'));

    expect(watcher.getPendingFiles().length).toBeGreaterThan(0);

    watcher.clearPending();
    expect(watcher.getPendingFiles()).toHaveLength(0);
    watcher.stop();
  });

  it('does not add binary files to pending queue', async () => {
    const { KnowledgeWatcher } = await import('../../src/knowledge/watcher.js');
    const watcher = new KnowledgeWatcher(db);
    watcher.start(rawDir);

    writeFileSync(join(rawDir, 'owner', 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d]));
    await fire(rawDir, watcher, join('owner', 'image.png'));

    expect(watcher.getPendingFiles().every((p) => !p.endsWith('image.png'))).toBe(true);
    watcher.stop();
  });

  it('stop() prevents new files from being added to pending', async () => {
    const { KnowledgeWatcher } = await import('../../src/knowledge/watcher.js');
    const watcher = new KnowledgeWatcher(db);
    watcher.start(rawDir);
    watcher.stop();

    writeFileSync(join(rawDir, 'owner', 'after-stop.md'), '# After stop', 'utf-8');
    await fire(rawDir, watcher, join('owner', 'after-stop.md'));

    expect(watcher.getPendingFiles()).toHaveLength(0);
  });

  it('adds a modified file (new hash) to pending even if previously ingested', async () => {
    const { KnowledgeWatcher } = await import('../../src/knowledge/watcher.js');
    const { createHash } = await import('crypto');

    const filePath = join(rawDir, 'owner', 'modified.md');
    writeFileSync(filePath, '# Original content', 'utf-8');
    const originalHash = createHash('sha256').update(Buffer.from('# Original content')).digest('hex');

    db.prepare(`
      INSERT INTO knowledge_sources (id, path, hash, source_tier, confidence, filename, format, status)
      VALUES ('id2', ?, ?, 'owner', 'medium', 'modified.md', 'md', 'ingested')
    `).run(filePath, originalHash);

    const watcher = new KnowledgeWatcher(db);
    watcher.start(rawDir);

    writeFileSync(filePath, '# Modified content with new text', 'utf-8');
    await fire(rawDir, watcher, join('owner', 'modified.md'));

    expect(watcher.getPendingFiles().some((p) => p.endsWith('modified.md'))).toBe(true);
    watcher.stop();
  });

  it('ignores files in hidden directories (e.g. .git/ inside raw/)', async () => {
    const { KnowledgeWatcher } = await import('../../src/knowledge/watcher.js');

    const gitDir = join(rawDir, '.git');
    mkdirSync(gitDir, { recursive: true });

    const watcher = new KnowledgeWatcher(db);
    watcher.start(rawDir);

    const inside = join('.git', 'config');
    writeFileSync(join(rawDir, inside), '[core]\n\trepositoryformatversion = 0', 'utf-8');
    await fire(rawDir, watcher, inside);

    expect(watcher.getPendingFiles().every((p) => !p.includes('/.git/'))).toBe(true);
    watcher.stop();
  });
});
