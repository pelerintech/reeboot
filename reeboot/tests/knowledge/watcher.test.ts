import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadVecExtension } from '../../src/db/index.js';
import { runKnowledgeMigration } from '../../src/db/schema.js';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  loadVecExtension(db);
  runKnowledgeMigration(db);
  return db;
}

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

describe('KnowledgeWatcher', () => {
  let rawDir: string;
  let db: Database.Database;

  beforeEach(() => {
    rawDir = join(tmpdir(), `watcher-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(rawDir, 'owner'), { recursive: true });
    mkdirSync(join(rawDir, 'template'), { recursive: true });
    db = makeDb();
  });

  afterEach(() => {
    db.close();
    try { rmSync(rawDir, { recursive: true, force: true }); } catch {}
  });

  it('detects a new .md file after debounce window', async () => {
    const { KnowledgeWatcher } = await import('../../src/knowledge/watcher.js');
    const watcher = new KnowledgeWatcher(db);
    watcher.start(rawDir);

    // Write a new file
    writeFileSync(join(rawDir, 'owner', 'test.md'), '# Hello world', 'utf-8');

    // Wait for debounce (300ms) + generous buffer for parallelised CI runs
    await delay(800);

    const pending = watcher.getPendingFiles();
    expect(pending.some((p) => p.endsWith('test.md'))).toBe(true);

    watcher.stop();
  });

  it('does not add already-ingested file (same hash) to pending', async () => {
    const { KnowledgeWatcher } = await import('../../src/knowledge/watcher.js');

    // Pre-insert the file hash into knowledge_sources
    const filePath = join(rawDir, 'owner', 'known.md');
    const content = '# Already ingested document';
    writeFileSync(filePath, content, 'utf-8');

    // Compute hash and insert into db
    const { createHash } = await import('crypto');
    const { readFileSync } = await import('fs');
    const hash = createHash('sha256').update(readFileSync(filePath)).digest('hex');

    db.prepare(`
      INSERT INTO knowledge_sources (id, path, hash, source_tier, confidence, filename, format, status)
      VALUES ('id1', ?, ?, 'owner', 'medium', 'known.md', 'md', 'ingested')
    `).run(filePath, hash);

    const watcher = new KnowledgeWatcher(db);
    watcher.start(rawDir);

    // Write the same file again
    writeFileSync(filePath, content, 'utf-8');
    await delay(500);

    const pending = watcher.getPendingFiles();
    expect(pending.every((p) => !p.endsWith('known.md'))).toBe(true);

    watcher.stop();
  });

  it('clearPending empties the pending queue', async () => {
    const { KnowledgeWatcher } = await import('../../src/knowledge/watcher.js');
    const watcher = new KnowledgeWatcher(db);
    watcher.start(rawDir);

    writeFileSync(join(rawDir, 'owner', 'clear-test.md'), '# Content', 'utf-8');
    await delay(500);

    expect(watcher.getPendingFiles().length).toBeGreaterThan(0);

    watcher.clearPending();
    expect(watcher.getPendingFiles()).toHaveLength(0);

    watcher.stop();
  });

  it('does not add binary files to pending queue', async () => {
    const { KnowledgeWatcher } = await import('../../src/knowledge/watcher.js');
    const watcher = new KnowledgeWatcher(db);
    watcher.start(rawDir);

    // Write a binary file (contains null byte)
    writeFileSync(join(rawDir, 'owner', 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d]));
    await delay(500);

    const pending = watcher.getPendingFiles();
    expect(pending.every((p) => !p.endsWith('image.png'))).toBe(true);

    watcher.stop();
  });

  it('stop() prevents new files from being added to pending', async () => {
    const { KnowledgeWatcher } = await import('../../src/knowledge/watcher.js');
    const watcher = new KnowledgeWatcher(db);
    watcher.start(rawDir);
    watcher.stop();

    // Write file after stop
    writeFileSync(join(rawDir, 'owner', 'after-stop.md'), '# After stop', 'utf-8');
    await delay(500);

    expect(watcher.getPendingFiles()).toHaveLength(0);
  });

  it('adds a modified file (new hash) to pending even if previously ingested', async () => {
    const { KnowledgeWatcher } = await import('../../src/knowledge/watcher.js');
    const { createHash } = await import('crypto');

    // Pre-insert the original file hash into knowledge_sources
    const filePath = join(rawDir, 'owner', 'modified.md');
    const originalContent = '# Original content';
    writeFileSync(filePath, originalContent, 'utf-8');
    const originalHash = createHash('sha256').update(Buffer.from(originalContent)).digest('hex');

    db.prepare(`
      INSERT INTO knowledge_sources (id, path, hash, source_tier, confidence, filename, format, status)
      VALUES ('id2', ?, ?, 'owner', 'medium', 'modified.md', 'md', 'ingested')
    `).run(filePath, originalHash);

    const watcher = new KnowledgeWatcher(db);
    watcher.start(rawDir);

    // Modify the file — new content = new hash
    const newContent = '# Modified content with new text';
    writeFileSync(filePath, newContent, 'utf-8');
    await delay(500);

    // Modified file should appear in pending (hash changed)
    const pending = watcher.getPendingFiles();
    expect(pending.some((p) => p.endsWith('modified.md'))).toBe(true);

    watcher.stop();
  });

  it('ignores files in hidden directories (e.g. .git/ inside raw/)', async () => {
    const { KnowledgeWatcher } = await import('../../src/knowledge/watcher.js');

    // Create a .git directory inside raw/
    const gitDir = join(rawDir, '.git');
    mkdirSync(gitDir, { recursive: true });

    const watcher = new KnowledgeWatcher(db);
    watcher.start(rawDir);

    // Write a file inside .git/ — should be ignored
    writeFileSync(join(gitDir, 'config'), '[core]\n\trepositoryformatversion = 0', 'utf-8');
    await delay(500);

    const pending = watcher.getPendingFiles();
    expect(pending.every((p) => !p.includes('/.git/'))).toBe(true);

    watcher.stop();
  });
});
