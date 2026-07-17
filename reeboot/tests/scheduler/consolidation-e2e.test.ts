import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';

describe('consolidation e2e', () => {
  let db: Database.Database;
  let memoriesDir: string;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY, taskId TEXT NOT NULL, context_id TEXT NOT NULL,
        prompt TEXT NOT NULL, schedule TEXT NOT NULL,
        origin_channel TEXT, origin_peer TEXT, next_run TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS memory_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trigger TEXT NOT NULL,
        sessions_processed INTEGER DEFAULT 0,
        ops_applied INTEGER DEFAULT 0,
        memory_chars_before INTEGER DEFAULT 0,
        memory_chars_after INTEGER DEFAULT 0,
        user_chars_before INTEGER DEFAULT 0,
        user_chars_after INTEGER DEFAULT 0,
        ran_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        context_id TEXT NOT NULL DEFAULT 'main',
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Seed some messages for consolidation to process
    db.prepare(`INSERT INTO messages (context_id, role, content, created_at) VALUES (?, ?, ?, datetime('now'))`).run('main', 'user', 'I really prefer dark mode for the interface');

    memoriesDir = mkdtempSync(join(tmpdir(), 'test-consolidation-e2e-'));
    mkdirSync(memoriesDir, { recursive: true });
    writeFileSync(join(memoriesDir, 'MEMORY.md'), '# Memory\n\nGeneral notes about the user.\n');
    writeFileSync(join(memoriesDir, 'USER.md'), '# User\n\nNo preferences recorded yet.\n');
  });

  afterEach(() => {
    rmSync(memoriesDir, { recursive: true, force: true });
  });

  it('S4: consolidation task updates memory via runConsolidation, no agent turn', async () => {
    const fakeBus = { publish: vi.fn() };
    const stubLlmCall = vi.fn().mockResolvedValue('ADD memory: user prefers dark mode');

    const { runConsolidation } = await import('@src/extensions/memory-manager.js');
    const { createSchedulerTaskHandler } = await import('@src/scheduler-dispatch.js');

    const handler = createSchedulerTaskHandler({
      db,
      bus: fakeBus as any,
      runConsolidation,
      llmCall: stubLlmCall,
      memoriesDir,
      memoryCharLimit: 2200,
      userCharLimit: 1375,
    });

    await handler({
      taskId: '__memory_consolidation__',
      prompt: '__memory_consolidation__: Run the memory consolidation process.',
      origin_channel: null,
      origin_peer: null,
    });

    // Assert memory_log row was written
    const logRow = db.prepare('SELECT * FROM memory_log ORDER BY id DESC LIMIT 1').get() as any;
    expect(logRow).toBeTruthy();
    expect(logRow.trigger).toBe('consolidation');

    // Assert MEMORY.md was updated
    const memoryContent = readFileSync(join(memoriesDir, 'MEMORY.md'), 'utf-8');
    expect(memoryContent).toContain('dark mode');

    // Assert NO scheduler message was published
    expect(fakeBus.publish).not.toHaveBeenCalled();
  });
});
