import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

describe('Resilience abort journal (E5)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS turn_journal (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        turn_id TEXT NOT NULL UNIQUE,
        context_id TEXT NOT NULL,
        prompt TEXT NOT NULL,
        session_path TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TEXT DEFAULT (datetime('now')),
        closed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS contexts (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    `);
    db.prepare("INSERT INTO contexts (id, name) VALUES ('main', 'Main')").run();
  });

  it('S1+S2: abort closes the journal and excludes it from getOpenJournals', async () => {
    const { Orchestrator } = await import('@src/orchestrator.js');
    const { getOpenJournals } = await import('@src/resilience/turn-journal.js');

    // A runner whose prompt() rejects with AbortError
    const mockRunner = {
      prompt: vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })),
      abort: vi.fn(),
      getSessionPath: vi.fn().mockReturnValue(undefined),
    };

    const bus = {
      publish: vi.fn(),
      onMessage: vi.fn().mockReturnValue(() => {}),
    };

    const orchestrator = new Orchestrator(
      {
        routing: { default: 'main' },
        channels: {},
        agent: {},
        budget: {},
      } as any,
      bus as any,
      new Map(),
      new Map([['main', mockRunner as any]]),
      db
    );

    orchestrator.start();

    // Publish a message — runner will reject with AbortError
    const { createIncomingMessage } = await import('@src/channels/interface.js');
    const msg = createIncomingMessage({
      channelType: 'web',
      peerId: 'user1',
      content: 'hello',
    });

    // The orchestrator handles the message asynchronously
    const { _handleMessage } = orchestrator as any;
    await _handleMessage.call(orchestrator, msg);

    // Wait a tick for async dispatch
    await new Promise((r) => setTimeout(r, 50));

    // Assert 0 open journal rows
    const openCount = (db.prepare("SELECT COUNT(*) as count FROM turn_journal WHERE status = 'open'").get() as any).count;
    expect(openCount).toBe(0);

    // Assert getOpenJournals excludes the aborted turn
    const openJournals = getOpenJournals(db);
    expect(openJournals.length).toBe(0);

    orchestrator.stop();
  });

  it('S3: timeout still leaves journal open (regression guard)', async () => {
    const { Orchestrator } = await import('@src/orchestrator.js');

    // A runner that never resolves (simulates timeout)
    const mockRunner = {
      prompt: vi.fn().mockReturnValue(new Promise(() => {})), // never resolves
      abort: vi.fn(),
      getSessionPath: vi.fn().mockReturnValue(undefined),
    };

    const bus = {
      publish: vi.fn(),
      onMessage: vi.fn().mockReturnValue(() => {}),
    };

    const orchestrator = new Orchestrator(
      {
        routing: { default: 'main' },
        channels: {},
        agent: { turnTimeout: 50 }, // 50ms timeout
        budget: {},
      } as any,
      bus as any,
      new Map(),
      new Map([['main', mockRunner as any]]),
      db
    );

    orchestrator.start();

    const { createIncomingMessage } = await import('@src/channels/interface.js');
    const msg = createIncomingMessage({
      channelType: 'web',
      peerId: 'user1',
      content: 'hello',
    });

    const { _handleMessage } = orchestrator as any;
    await _handleMessage.call(orchestrator, msg);

    // Wait for timeout to trigger
    await new Promise((r) => setTimeout(r, 200));

    // Timeout should leave the journal open
    const openCount = (db.prepare("SELECT COUNT(*) as count FROM turn_journal WHERE status = 'open'").get() as any).count;
    expect(openCount).toBe(1);

    orchestrator.stop();
  });
});
