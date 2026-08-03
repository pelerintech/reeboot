import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';

describe('consolidation interceptor', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        taskId TEXT NOT NULL,
        context_id TEXT NOT NULL,
        prompt TEXT NOT NULL,
        schedule TEXT NOT NULL,
        origin_channel TEXT,
        origin_peer TEXT,
        next_run TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  });

  it('S2: consolidation sentinel routes to runConsolidation, not the bus', async () => {
    const fakeBus = { publish: vi.fn() };
    const runConsolidationSpy = vi.fn().mockResolvedValue(undefined);
    const stubLlmCall = vi.fn().mockResolvedValue('ADD memory: test result');

    const { createSchedulerTaskHandler } = await import('@src/scheduler-dispatch.js');
    const handler = createSchedulerTaskHandler({
      db,
      bus: fakeBus as any,
      runConsolidation: runConsolidationSpy,
      llmCall: stubLlmCall,
      memoriesDir: mkdtempSync(join(tmpdir(), 'reeboot-memories-')),
      memoryCharLimit: 2200,
      userCharLimit: 1375,
    });

    await handler({
      taskId: '__memory_consolidation__',
      prompt: '__memory_consolidation__: Run the memory consolidation process.',
      origin_channel: null,
      origin_peer: null,
    });

    expect(runConsolidationSpy).toHaveBeenCalledTimes(1);
    expect(fakeBus.publish).not.toHaveBeenCalled();
  });

  it('S3: normal task dispatches to the bus', async () => {
    const fakeBus = { publish: vi.fn() };
    const runConsolidationSpy = vi.fn();

    const { createSchedulerTaskHandler } = await import('@src/scheduler-dispatch.js');
    const handler = createSchedulerTaskHandler({
      db,
      bus: fakeBus as any,
      runConsolidation: runConsolidationSpy,
      llmCall: vi.fn(),
      memoriesDir: mkdtempSync(join(tmpdir(), 'reeboot-memories-')),
      memoryCharLimit: 2200,
      userCharLimit: 1375,
    });

    await handler({
      taskId: 't1',
      prompt: 'remind me',
      origin_channel: null,
      origin_peer: null,
    });

    expect(fakeBus.publish).toHaveBeenCalledTimes(1);
    expect(fakeBus.publish.mock.calls[0][0].channelType).toBe('scheduler');
    expect(runConsolidationSpy).not.toHaveBeenCalled();
  });
});
