import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

async function makeDb() {
  const { runResilienceMigration } = await import('@src/db/schema.js');
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    context_id TEXT NOT NULL,
    schedule TEXT NOT NULL DEFAULT '',
    schedule_type TEXT NOT NULL DEFAULT 'cron',
    schedule_value TEXT NOT NULL DEFAULT '',
    normalized_ms INTEGER,
    status TEXT NOT NULL DEFAULT 'active',
    prompt TEXT NOT NULL DEFAULT '',
    next_run TEXT,
    last_result TEXT,
    context_mode TEXT NOT NULL DEFAULT 'shared',
    catchup TEXT
  )`);
  runResilienceMigration(db);
  return db;
}

// ─── Stale cleanup ────────────────────────────────────────────────────────────

describe('stale cleanup', () => {
  it('logs a warning with the turn_id when a stale row is discarded', async () => {
    vi.resetModules();
    const { cleanStaleJournals } = await import('@src/resilience/startup.js');
    const db = await makeDb();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    db.exec(`INSERT INTO turn_journal (turn_id, context_id, started_at)
             VALUES ('stale-warn-1', 'ctx1', datetime('now', '-25 hours'))`);

    cleanStaleJournals(db);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('stale-warn-1'));
    warnSpy.mockRestore();
  });

  it('deletes turn_journal rows older than 24 hours', async () => {
    const { cleanStaleJournals } = await import('@src/resilience/startup.js');
    const db = await makeDb();

    // Insert a row 25 hours ago
    db.exec(`INSERT INTO turn_journal (turn_id, context_id, started_at)
             VALUES ('stale1', 'ctx1', datetime('now', '-25 hours'))`);

    cleanStaleJournals(db);

    const row = db.prepare('SELECT * FROM turn_journal WHERE turn_id = ?').get('stale1');
    expect(row).toBeUndefined();
  });

  it('does NOT delete turn_journal rows younger than 24 hours', async () => {
    const { cleanStaleJournals } = await import('@src/resilience/startup.js');
    const db = await makeDb();

    // Insert a row 23 hours ago
    db.exec(`INSERT INTO turn_journal (turn_id, context_id, started_at)
             VALUES ('fresh1', 'ctx1', datetime('now', '-23 hours'))`);

    cleanStaleJournals(db);

    const row = db.prepare('SELECT * FROM turn_journal WHERE turn_id = ?').get('fresh1');
    expect(row).toBeTruthy();
  });
});

// ─── Crash recovery ───────────────────────────────────────────────────────────

describe('crash recovery', () => {
  it('safe turn with safe_only mode: requeues and broadcasts', async () => {
    vi.resetModules();
    const { recoverCrashedTurns } = await import('@src/resilience/startup.js');
    const db = await makeDb();

    // Insert an open journal row with no steps (safe turn)
    db.exec(`INSERT INTO turn_journal (turn_id, context_id, prompt)
             VALUES ('t1', 'ctx1', 'hello world')`);

    const config = {
      resilience: {
        recovery: { mode: 'safe_only', side_effect_tools: ['send_email'] },
        scheduler: { catchup_window: '1h' },
        outage_threshold: 3,
        probe_interval: '1h',
      },
    };
    const adapter = { send: vi.fn().mockResolvedValue(undefined) };
    const adapters = new Map([['web', adapter as any]]);
    const requeueFn = vi.fn();

    await recoverCrashedTurns(db, config as any, adapters, requeueFn);

    expect(requeueFn).toHaveBeenCalledWith('ctx1', 'hello world');
    expect(adapter.send).toHaveBeenCalled();
  });

  it('unsafe turn with safe_only mode: broadcasts but does NOT requeue', async () => {
    vi.resetModules();
    const { recoverCrashedTurns } = await import('@src/resilience/startup.js');
    const db = await makeDb();

    db.exec(`INSERT INTO turn_journal (turn_id, context_id, prompt)
             VALUES ('t2', 'ctx1', 'send an email')`);
    db.exec(`INSERT INTO turn_journal_steps (turn_id, seq, tool_name, tool_input)
             VALUES ('t2', 1, 'send_email', '{}')`);

    const config = {
      resilience: {
        recovery: { mode: 'safe_only', side_effect_tools: ['send_email'] },
        scheduler: { catchup_window: '1h' },
        outage_threshold: 3,
        probe_interval: '1h',
      },
    };
    const adapter = { send: vi.fn().mockResolvedValue(undefined) };
    const adapters = new Map([['web', adapter as any]]);
    const requeueFn = vi.fn();

    await recoverCrashedTurns(db, config as any, adapters, requeueFn);

    expect(requeueFn).not.toHaveBeenCalled();
    expect(adapter.send).toHaveBeenCalled();
  });

  it('unsafe turn with always mode: requeues regardless', async () => {
    vi.resetModules();
    const { recoverCrashedTurns } = await import('@src/resilience/startup.js');
    const db = await makeDb();

    db.exec(`INSERT INTO turn_journal (turn_id, context_id, prompt)
             VALUES ('t3', 'ctx1', 'do risky thing')`);
    db.exec(`INSERT INTO turn_journal_steps (turn_id, seq, tool_name, tool_input)
             VALUES ('t3', 1, 'send_email', '{}')`);

    const config = {
      resilience: {
        recovery: { mode: 'always', side_effect_tools: ['send_email'] },
        scheduler: { catchup_window: '1h' },
        outage_threshold: 3,
        probe_interval: '1h',
      },
    };
    const adapter = { send: vi.fn().mockResolvedValue(undefined) };
    const adapters = new Map([['web', adapter as any]]);
    const requeueFn = vi.fn();

    await recoverCrashedTurns(db, config as any, adapters, requeueFn);

    expect(requeueFn).toHaveBeenCalledWith('ctx1', 'do risky thing');
  });

  it('safe turn with never mode: broadcasts but does NOT requeue', async () => {
    vi.resetModules();
    const { recoverCrashedTurns } = await import('@src/resilience/startup.js');
    const db = await makeDb();

    db.exec(`INSERT INTO turn_journal (turn_id, context_id, prompt)
             VALUES ('t4', 'ctx1', 'safe read')`);
    // No steps — safe

    const config = {
      resilience: {
        recovery: { mode: 'never', side_effect_tools: ['send_email'] },
        scheduler: { catchup_window: '1h' },
        outage_threshold: 3,
        probe_interval: '1h',
      },
    };
    const adapter = { send: vi.fn().mockResolvedValue(undefined) };
    const adapters = new Map([['web', adapter as any]]);
    const requeueFn = vi.fn();

    await recoverCrashedTurns(db, config as any, adapters, requeueFn);

    expect(requeueFn).not.toHaveBeenCalled();
    expect(adapter.send).toHaveBeenCalled();
  });
});

describe('restart notification', () => {
  it('does NOT broadcast on first startup (no previous run marker)', async () => {
    vi.resetModules();
    const { notifyRestart } = await import('@src/resilience/startup.js');
    const db = await makeDb();

    const adapter = { send: vi.fn().mockResolvedValue(undefined) };
    const adapters = new Map([['web', adapter as any]]);

    notifyRestart(db, adapters);

    expect(adapter.send).not.toHaveBeenCalled();
  });

  it('broadcasts restart message when previous run marker exists', async () => {
    vi.resetModules();
    const { notifyRestart } = await import('@src/resilience/startup.js');
    const db = await makeDb();

    // Pre-seed a previous run marker
    db.exec(`CREATE TABLE IF NOT EXISTS reeboot_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    db.exec(`INSERT INTO reeboot_state (key, value) VALUES ('last_started_at', datetime('now', '-1 hour'))`);

    const adapter = { send: vi.fn().mockResolvedValue(undefined) };
    const adapters = new Map([['web', adapter as any]]);

    notifyRestart(db, adapters);

    expect(adapter.send).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ type: 'text', text: expect.stringMatching(/restarted/i) })
    );
  });

  it('updates the last_started_at marker on every startup', async () => {
    vi.resetModules();
    const { notifyRestart } = await import('@src/resilience/startup.js');
    const db = await makeDb();

    // Call once (first run)
    const adapter = { send: vi.fn().mockResolvedValue(undefined) };
    notifyRestart(db, new Map([['web', adapter as any]]));

    const row1 = (db.prepare(`SELECT value FROM reeboot_state WHERE key = 'last_started_at'`).get() as any);
    expect(row1).toBeDefined();

    // Call again (simulated restart)
    const adapter2 = { send: vi.fn().mockResolvedValue(undefined) };
    notifyRestart(db, new Map([['web', adapter2 as any]]));

    // Second call should broadcast
    expect(adapter2.send).toHaveBeenCalled();
    // Marker should exist (was updated)
    const row2 = (db.prepare(`SELECT value FROM reeboot_state WHERE key = 'last_started_at'`).get() as any);
    expect(row2).toBeDefined();
  });
});

describe('crash recovery — tool names in notification', () => {
  it('unsafe-turn notification includes specific tool names that fired', async () => {
    vi.resetModules();
    const { recoverCrashedTurns } = await import('@src/resilience/startup.js');
    const db = await makeDb();

    // Insert a journal with two side-effectful steps
    db.exec(`INSERT INTO turn_journal (turn_id, context_id, prompt) VALUES ('t-unsafe', 'ctx1', 'do something')`);
    db.exec(`INSERT INTO turn_journal_steps (turn_id, seq, tool_name, tool_input, tool_output, is_error)
             VALUES ('t-unsafe', 1, 'send_email', '{}', 'ok', 0)`);
    db.exec(`INSERT INTO turn_journal_steps (turn_id, seq, tool_name, tool_input, tool_output, is_error)
             VALUES ('t-unsafe', 2, 'post_slack', '{}', 'ok', 0)`);

    const config = {
      resilience: {
        recovery: { mode: 'safe_only', side_effect_tools: ['send_email', 'post_slack'] },
        scheduler: { catchup_window: '1h' },
        outage_threshold: 3,
        probe_interval: '1h',
      },
    };
    const adapter = { send: vi.fn().mockResolvedValue(undefined) };
    const adapters = new Map([['web', adapter as any]]);
    const requeueFn = vi.fn();

    await recoverCrashedTurns(db, config as any, adapters, requeueFn);

    expect(adapter.send).toHaveBeenCalled();
    const broadcastArg = (adapter.send as any).mock.calls[0][1];
    expect(broadcastArg.text).toContain('send_email');
    expect(broadcastArg.text).toContain('post_slack');
  });
});

// ─── Crash recovery — empty journal and multi-journal ────────────────────────

describe('crash recovery — empty journal and multi-journal', () => {
  it('no unclosed journals — requeueFn not called and no broadcast sent', async () => {
    vi.resetModules();
    const { recoverCrashedTurns } = await import('@src/resilience/startup.js');
    const db = await makeDb();
    // turn_journal table is empty — no crashed turns

    const config = {
      resilience: {
        recovery: { mode: 'safe_only', side_effect_tools: [] },
        scheduler: { catchup_window: '1h' },
        outage_threshold: 3,
        probe_interval: '1h',
      },
    };
    const adapter = { send: vi.fn().mockResolvedValue(undefined) };
    const adapters = new Map([['web', adapter as any]]);
    const requeueFn = vi.fn();

    await recoverCrashedTurns(db, config as any, adapters, requeueFn);

    expect(requeueFn).not.toHaveBeenCalled();
    expect(adapter.send).not.toHaveBeenCalled();
  });

  it('multiple unclosed journals — each handled independently', async () => {
    vi.resetModules();
    const { recoverCrashedTurns } = await import('@src/resilience/startup.js');
    const db = await makeDb();

    // Two open journal rows for different contexts — both safe (no steps)
    db.exec(`INSERT INTO turn_journal (turn_id, context_id, prompt) VALUES ('ta', 'ctx-a', 'request from a')`);
    db.exec(`INSERT INTO turn_journal (turn_id, context_id, prompt) VALUES ('tb', 'ctx-b', 'request from b')`);

    const config = {
      resilience: {
        recovery: { mode: 'safe_only', side_effect_tools: [] },
        scheduler: { catchup_window: '1h' },
        outage_threshold: 3,
        probe_interval: '1h',
      },
    };
    const adapter = { send: vi.fn().mockResolvedValue(undefined) };
    const adapters = new Map([['web', adapter as any]]);
    const requeueFn = vi.fn();

    await recoverCrashedTurns(db, config as any, adapters, requeueFn);

    // Both prompts should be requeued — each into their respective context
    expect(requeueFn).toHaveBeenCalledTimes(2);
    expect(requeueFn).toHaveBeenCalledWith('ctx-a', 'request from a');
    expect(requeueFn).toHaveBeenCalledWith('ctx-b', 'request from b');
    // A notification should have been broadcast for each
    expect(adapter.send).toHaveBeenCalledTimes(2);
  });
});
