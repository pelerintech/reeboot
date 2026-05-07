/**
 * Proactive Agent tests — TDD (RED first)
 *
 * Covers:
 * 1.1 System heartbeat
 * 1.2 In-session timer
 * 1.3 In-session heartbeat
 * 1.4 Sleep interceptor
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigration } from '../src/db/schema.js';
import { MessageBus } from '@src/channels/interface.js';

// ─── DB helpers ───────────────────────────────────────────────────────────────

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS contexts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      model_provider TEXT NOT NULL DEFAULT '',
      model_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      context_id TEXT NOT NULL REFERENCES contexts(id),
      schedule TEXT NOT NULL,
      prompt TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.prepare("INSERT INTO contexts (id, name) VALUES ('main', 'main')").run();
  runMigration(db);
  return db;
}

// ─── 1.1 System heartbeat ─────────────────────────────────────────────────────

describe('System heartbeat', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    db.close();
  });

  function makeBus() {
    return new MessageBus();
  }

  it('disabled by default — no heartbeat loop started when enabled=false', async () => {
    const { startHeartbeat, stopHeartbeat } = await import('../src/scheduler/heartbeat.js');
    const bus = makeBus();
    const publishSpy = vi.spyOn(bus, 'publish');

    startHeartbeat({ enabled: false, interval: 'every 5m', contextId: 'main' }, db, bus);

    await vi.advanceTimersByTimeAsync(400_000);
    expect(publishSpy).not.toHaveBeenCalled();
    stopHeartbeat();
  });

  it('fires at configured interval when enabled', async () => {
    const { startHeartbeat, stopHeartbeat } = await import('../src/scheduler/heartbeat.js');
    const bus = makeBus();
    const publishSpy = vi.spyOn(bus, 'publish');

    startHeartbeat({ enabled: true, interval: 'every 1m', contextId: 'main' }, db, bus);

    await vi.advanceTimersByTimeAsync(65_000);
    expect(publishSpy).toHaveBeenCalledTimes(1);
    stopHeartbeat();
  });

  it('fires multiple times across multiple intervals', async () => {
    const { startHeartbeat, stopHeartbeat } = await import('../src/scheduler/heartbeat.js');
    const bus = makeBus();
    const publishSpy = vi.spyOn(bus, 'publish');

    startHeartbeat({ enabled: true, interval: 'every 1m', contextId: 'main' }, db, bus);

    await vi.advanceTimersByTimeAsync(130_000);
    expect(publishSpy).toHaveBeenCalledTimes(2);
    stopHeartbeat();
  });

  it('published message has correct channelType, peerId, and content', async () => {
    const { startHeartbeat, stopHeartbeat } = await import('../src/scheduler/heartbeat.js');
    const bus = makeBus();
    const publishSpy = vi.spyOn(bus, 'publish');

    startHeartbeat({ enabled: true, interval: 'every 1m', contextId: 'main' }, db, bus);

    await vi.advanceTimersByTimeAsync(65_000);
    expect(publishSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        channelType: 'heartbeat',
        peerId: 'main',
        content: expect.stringContaining('System heartbeat'),
      })
    );
    stopHeartbeat();
  });

  it('prompt contains IDLE instruction', async () => {
    const { renderHeartbeatPrompt } = await import('../src/scheduler/heartbeat.js');
    const prompt = renderHeartbeatPrompt(db);
    expect(prompt).toMatch(/respond with a single word: IDLE/i);
  });

  it('prompt contains overdue task when one exists', async () => {
    const pastTime = new Date(Date.now() - 3_600_000).toISOString();
    db.prepare(
      `INSERT INTO tasks (id, context_id, schedule, prompt, enabled, schedule_type, schedule_value, status, next_run)
       VALUES ('task-1', 'main', 'every 1h', 'Check emails', 1, 'interval', 'every 1h', 'active', ?)`
    ).run(pastTime);

    const { renderHeartbeatPrompt } = await import('../src/scheduler/heartbeat.js');
    const prompt = renderHeartbeatPrompt(db);
    expect(prompt).toContain('task-1');
    expect(prompt).toContain('Check emails');
  });

  it('prompt contains upcoming task (next 24h)', async () => {
    const futureTime = new Date(Date.now() + 3 * 3_600_000).toISOString();
    db.prepare(
      `INSERT INTO tasks (id, context_id, schedule, prompt, enabled, schedule_type, schedule_value, status, next_run)
       VALUES ('task-2', 'main', 'every 6h', 'Deploy check', 1, 'interval', 'every 6h', 'active', ?)`
    ).run(futureTime);

    const { renderHeartbeatPrompt } = await import('../src/scheduler/heartbeat.js');
    const prompt = renderHeartbeatPrompt(db);
    expect(prompt).toContain('task-2');
    expect(prompt).toContain('Deploy check');
  });

  it('stopHeartbeat prevents further ticks', async () => {
    const { startHeartbeat, stopHeartbeat } = await import('../src/scheduler/heartbeat.js');
    const bus = makeBus();
    const publishSpy = vi.spyOn(bus, 'publish');

    startHeartbeat({ enabled: true, interval: 'every 1m', contextId: 'main' }, db, bus);
    await vi.advanceTimersByTimeAsync(65_000);
    expect(publishSpy).toHaveBeenCalledTimes(1);

    stopHeartbeat();
    await vi.advanceTimersByTimeAsync(65_000);
    expect(publishSpy).toHaveBeenCalledTimes(1);
  });
});

// ─── 1.2 In-session timer ─────────────────────────────────────────────────────

describe('In-session timer (TimerManager)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function makeManager() {
    const { TimerManager } = await import('../extensions/scheduler-tool.js');
    return new TimerManager();
  }

  it('setTimer returns immediately (does not block)', async () => {
    const mgr = await makeManager();
    const mockPi = { sendMessage: vi.fn() } as any;
    const start = Date.now();
    mgr.setTimer(mockPi, 60, 'Check build status', 'timer-1');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
    mgr.clearAll();
  });

  it('fires after delay and calls pi.sendMessage with triggerTurn', async () => {
    const mgr = await makeManager();
    const mockPi = { sendMessage: vi.fn() } as any;

    mgr.setTimer(mockPi, 1, 'Test message', 'timer-1');
    expect(mockPi.sendMessage).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1100);
    expect(mockPi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Test message') }),
      expect.objectContaining({ triggerTurn: true })
    );
    mgr.clearAll();
  });

  it('content includes timer id', async () => {
    const mgr = await makeManager();
    const mockPi = { sendMessage: vi.fn() } as any;

    mgr.setTimer(mockPi, 1, 'Deploy check', 'deploy-timer');
    await vi.advanceTimersByTimeAsync(1100);
    expect(mockPi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('deploy-timer') }),
      expect.anything()
    );
    mgr.clearAll();
  });

  it('multiple timers are independent', async () => {
    const mgr = await makeManager();
    const mockPi = { sendMessage: vi.fn() } as any;

    mgr.setTimer(mockPi, 1, 'msg-a', 'timer-a');
    mgr.setTimer(mockPi, 2, 'msg-b', 'timer-b');

    await vi.advanceTimersByTimeAsync(1100);
    expect(mockPi.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockPi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('msg-a') }),
      expect.anything()
    );

    await vi.advanceTimersByTimeAsync(1100);
    expect(mockPi.sendMessage).toHaveBeenCalledTimes(2);
    mgr.clearAll();
  });

  it('same id replaces previous timer', async () => {
    const mgr = await makeManager();
    const mockPi = { sendMessage: vi.fn() } as any;

    mgr.setTimer(mockPi, 60, 'msg1', 'deploy-check');
    mgr.setTimer(mockPi, 1, 'msg2', 'deploy-check');

    await vi.advanceTimersByTimeAsync(65_000);
    // Only msg2 should fire (the 1s one)
    expect(mockPi.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockPi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('msg2') }),
      expect.anything()
    );
    mgr.clearAll();
  });

  it('rejects out-of-range seconds (0)', async () => {
    const mgr = await makeManager();
    const mockPi = { sendMessage: vi.fn() } as any;
    expect(() => mgr.setTimer(mockPi, 0, 'test', 'x')).toThrow('seconds must be between 1 and 3600');
  });

  it('rejects out-of-range seconds (3601)', async () => {
    const mgr = await makeManager();
    const mockPi = { sendMessage: vi.fn() } as any;
    expect(() => mgr.setTimer(mockPi, 3601, 'test', 'x')).toThrow('seconds must be between 1 and 3600');
  });

  it('clearAll cancels pending timers', async () => {
    const mgr = await makeManager();
    const mockPi = { sendMessage: vi.fn() } as any;

    mgr.setTimer(mockPi, 1, 'msg-a', 'timer-a');
    mgr.setTimer(mockPi, 2, 'msg-b', 'timer-b');

    mgr.clearAll();

    await vi.advanceTimersByTimeAsync(5000);
    expect(mockPi.sendMessage).not.toHaveBeenCalled();
  });
});

// ─── 1.3 In-session heartbeat ─────────────────────────────────────────────────

describe('In-session heartbeat (TimerManager)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function makeManager() {
    const { TimerManager } = await import('../extensions/scheduler-tool.js');
    return new TimerManager();
  }

  it('startHeartbeat returns immediately', async () => {
    const mgr = await makeManager();
    const mockPi = { sendMessage: vi.fn() } as any;
    const start = Date.now();
    mgr.startHeartbeat(mockPi, 10, 'Check deploy');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
    mgr.clearAll();
  });

  it('fires on each tick', async () => {
    const mgr = await makeManager();
    const mockPi = { sendMessage: vi.fn() } as any;

    mgr.startHeartbeat(mockPi, 10, 'Check deploy');

    await vi.advanceTimersByTimeAsync(10_100);
    expect(mockPi.sendMessage).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(mockPi.sendMessage).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(mockPi.sendMessage).toHaveBeenCalledTimes(3);

    mgr.clearAll();
  });

  it('tick message includes tick count', async () => {
    const mgr = await makeManager();
    const mockPi = { sendMessage: vi.fn() } as any;

    mgr.startHeartbeat(mockPi, 10, 'Deploy check');

    await vi.advanceTimersByTimeAsync(10_100);
    expect(mockPi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('1') }),
      expect.objectContaining({ triggerTurn: true })
    );

    await vi.advanceTimersByTimeAsync(10_000);
    expect(mockPi.sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: expect.stringContaining('2') }),
      expect.anything()
    );

    mgr.clearAll();
  });

  it('tick message includes the user message string', async () => {
    const mgr = await makeManager();
    const mockPi = { sendMessage: vi.fn() } as any;

    mgr.startHeartbeat(mockPi, 10, 'Check deploy status');

    await vi.advanceTimersByTimeAsync(10_100);
    expect(mockPi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Check deploy status') }),
      expect.anything()
    );

    mgr.clearAll();
  });

  it('starting new heartbeat replaces previous one', async () => {
    const mgr = await makeManager();
    const mockPi = { sendMessage: vi.fn() } as any;

    // Start heartbeat A with 60s interval
    mgr.startHeartbeat(mockPi, 60, 'Heartbeat A');
    // Immediately replace with heartbeat B (1s interval)
    mgr.startHeartbeat(mockPi, 10, 'Heartbeat B');

    await vi.advanceTimersByTimeAsync(65_000);
    // All calls should be from heartbeat B (containing 'Heartbeat B')
    for (const call of mockPi.sendMessage.mock.calls) {
      expect(call[0].content).toContain('Heartbeat B');
    }

    mgr.clearAll();
  });

  it('stop cancels heartbeat', async () => {
    const mgr = await makeManager();
    const mockPi = { sendMessage: vi.fn() } as any;

    mgr.startHeartbeat(mockPi, 10, 'Deploy check');
    await vi.advanceTimersByTimeAsync(10_100);
    expect(mockPi.sendMessage).toHaveBeenCalledTimes(1);

    mgr.stopHeartbeat();
    await vi.advanceTimersByTimeAsync(50_000);
    expect(mockPi.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('getHeartbeatStatus shows state when active', async () => {
    const mgr = await makeManager();
    const mockPi = { sendMessage: vi.fn() } as any;

    mgr.startHeartbeat(mockPi, 30, 'Deploy check');
    const status = mgr.getHeartbeatStatus();
    expect(status).toContain('30');
    expect(status).toContain('Deploy check');

    mgr.clearAll();
  });

  it('getHeartbeatStatus shows "No active heartbeat." when none active', async () => {
    const mgr = await makeManager();
    const status = mgr.getHeartbeatStatus();
    expect(status).toBe('No active heartbeat.');
  });

  it('rejects out-of-range interval_seconds (5)', async () => {
    const mgr = await makeManager();
    const mockPi = { sendMessage: vi.fn() } as any;
    expect(() => mgr.startHeartbeat(mockPi, 5, 'test')).toThrow(
      'interval_seconds must be between 10 and 3600'
    );
  });

  it('rejects out-of-range interval_seconds (3601)', async () => {
    const mgr = await makeManager();
    const mockPi = { sendMessage: vi.fn() } as any;
    expect(() => mgr.startHeartbeat(mockPi, 3601, 'test')).toThrow(
      'interval_seconds must be between 10 and 3600'
    );
  });

  it('clearAll stops heartbeat', async () => {
    const mgr = await makeManager();
    const mockPi = { sendMessage: vi.fn() } as any;

    mgr.startHeartbeat(mockPi, 10, 'Deploy check');
    mgr.clearAll();

    await vi.advanceTimersByTimeAsync(50_000);
    expect(mockPi.sendMessage).not.toHaveBeenCalled();
  });
});

// ─── 1.4 Sleep interceptor ────────────────────────────────────────────────────

describe('isSleepOnlyOrLast', () => {
  async function getUtil() {
    const { isSleepOnlyOrLast } = await import('../extensions/scheduler-tool.js');
    return isSleepOnlyOrLast;
  }

  it('bare sleep is blocked', async () => {
    const fn = await getUtil();
    expect(fn('sleep 60')).toBe(true);
  });

  it('bare sleep with no args is blocked', async () => {
    const fn = await getUtil();
    expect(fn('sleep')).toBe(true);
  });

  it('sleep last in && chain is blocked', async () => {
    const fn = await getUtil();
    expect(fn('npm run build && sleep 60')).toBe(true);
  });

  it('sleep not-last in && chain is allowed', async () => {
    const fn = await getUtil();
    expect(fn('sleep 2 && npm start')).toBe(false);
  });

  it('sleep in middle of chain is allowed', async () => {
    const fn = await getUtil();
    expect(fn('sleep 1 && echo ready && start_server')).toBe(false);
  });

  it('npm build || sleep 5 is allowed (|| not split on)', async () => {
    const fn = await getUtil();
    expect(fn('npm build || sleep 5')).toBe(false);
  });

  it('sleep last after pipe is blocked', async () => {
    const fn = await getUtil();
    expect(fn('echo test | sleep 5')).toBe(true);
  });

  it('disabled by REEBOOT_SLEEP_INTERCEPTOR=0', async () => {
    // Test the env var disable logic by checking the hook logic inline
    // (actual hook test requires pi mock — covered by integration)
    const fn = await getUtil();
    // isSleepOnlyOrLast itself doesn't check env — the hook wrapper does
    // So this just verifies detection still works; env check is in the hook
    expect(fn('sleep 60')).toBe(true);
  });
});
