import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { ExtensionContext } from '@src/extensions/extension-api.js';

const WORKSPACE = mkdtempSync(join(tmpdir(), 'reeboot-history-'));

const mockContext: ExtensionContext = {
  cwd: WORKSPACE,
  workspacePath: WORKSPACE,
  config: { agent: { model: { provider: 'openai' } } },
  ui: {
    select: async () => undefined,
    confirm: async () => false,
    input: async () => undefined,
    notify: () => {},
  },
  hasUI: false,
};

const mockConfig = { agent: { model: { provider: 'openai' } } };

// ─── Task 10: Per-chat history store — schema and write ─────────────────────

describe('Per-chat history store — schema and write', () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `ree-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    mkdirSync(tmpdir(), { recursive: true });
  });

  afterEach(async () => {
    // Clean up the test DB
    try {
      const { unlinkSync } = await import('fs');
      unlinkSync(dbPath);
    } catch { /* ignore */ }
  });

  it('persistTurn writes user+assistant rows with correct chat_id', async () => {
    const { ReeRuntime } = await import('@src/runtime/ree-runtime.js');
    const { initReeHistory, persistTurn } = await import('@src/runtime/ree-history.js');

    const db = await initReeHistory(dbPath);

    const runtime = new ReeRuntime({
      config: mockConfig,
      maxChats: 10,
      idleTtlMs: 60000,
      maxHistoryPerChat: 50,
    });

    // Persist a turn
    await persistTurn(db, 'c1', { role: 'user', content: 'Hello' }, { role: 'assistant', content: 'Hi there' });

    // Query the rows
    const rows = db.prepare(`SELECT chat_id, role, content FROM chat_messages WHERE chat_id = ? ORDER BY id`).all('c1') as any[];

    expect(rows).toHaveLength(2);
    const userRow = rows.find((r: any) => r.role === 'user');
    const assistantRow = rows.find((r: any) => r.role === 'assistant');
    expect(userRow?.content).toContain('Hello');
    expect(assistantRow?.content).toContain('Hi there');
  });

  it('chats table records the chat metadata', async () => {
    const { initReeHistory, upsertChat } = await import('@src/runtime/ree-history.js');

    const db = await initReeHistory(dbPath);
    await upsertChat(db, 'c1', 'active');

    const row = db.prepare(`SELECT id, status FROM chats WHERE id = ?`).get('c1') as any;
    expect(row).toBeDefined();
    expect(row.status).toBe('active');
  });
});

// ─── Task 11: Per-chat history store — isolation and resume ──────────────────

describe('Per-chat history store — isolation and resume', () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `ree-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  });

  afterEach(async () => {
    try {
      const { unlinkSync } = await import('fs');
      unlinkSync(dbPath);
    } catch { /* ignore */ }
  });

  it('history is isolated per chat_id', async () => {
    const { initReeHistory, persistTurn } = await import('@src/runtime/ree-history.js');

    const db = await initReeHistory(dbPath);

    await persistTurn(db, 'c1', { role: 'user', content: 'Msg for c1' }, { role: 'assistant', content: 'Reply for c1' });
    await persistTurn(db, 'c2', { role: 'user', content: 'Msg for c2' }, { role: 'assistant', content: 'Reply for c2' });

    const rowsC1 = db.prepare(`SELECT role FROM chat_messages WHERE chat_id = ?`).all('c1') as any[];
    const rowsC2 = db.prepare(`SELECT role FROM chat_messages WHERE chat_id = ?`).all('c2') as any[];

    expect(rowsC1).toHaveLength(2);
    expect(rowsC2).toHaveLength(2);
    // c1 should not have c2's messages
    expect(rowsC1.some((r: any) => r.content?.includes('c2'))).toBe(false);
  });

  it('loadHistory returns messages for a chat (up to limit)', async () => {
    const { initReeHistory, persistTurn, loadHistory } = await import('@src/runtime/ree-history.js');

    const db = await initReeHistory(dbPath);

    await persistTurn(db, 'c1', { role: 'user', content: 'First' }, { role: 'assistant', content: 'Reply 1' });
    await persistTurn(db, 'c1', { role: 'user', content: 'Second' }, { role: 'assistant', content: 'Reply 2' });

    const history = await loadHistory(db, 'c1', 10);
    expect(history.length).toBeGreaterThanOrEqual(2);

    // With limit 2, should get at most 2
    const limited = await loadHistory(db, 'c1', 2);
    expect(limited.length).toBeLessThanOrEqual(2);
  });
});

// ─── Task 12: Per-chat history store — idle-eviction pruning and restart survival ───

describe('Per-chat history store — idle-eviction pruning and restart survival', () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `ree-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  });

  afterEach(async () => {
    try {
      const { unlinkSync } = await import('fs');
      unlinkSync(dbPath);
    } catch { /* ignore */ }
  });

  it('pruneHistory removes messages for a chat_id', async () => {
    const { initReeHistory, persistTurn, pruneHistory } = await import('@src/runtime/ree-history.js');

    const db = await initReeHistory(dbPath);

    await persistTurn(db, 'c1', { role: 'user', content: 'Hello' }, { role: 'assistant', content: 'Hi' });

    const before = db.prepare(`SELECT COUNT(*) as count FROM chat_messages WHERE chat_id = ?`).get('c1') as any;
    expect(before.count).toBe(2);

    await pruneHistory(db, 'c1');

    const after = db.prepare(`SELECT COUNT(*) as count FROM chat_messages WHERE chat_id = ?`).get('c1') as any;
    expect(after.count).toBe(0);
  });

  it('data survives DB close/reopen (durability)', async () => {
    const { initReeHistory, persistTurn } = await import('@src/runtime/ree-history.js');
    const Database = (await import('better-sqlite3')).default;

    // Write data
    const db = await initReeHistory(dbPath);
    await persistTurn(db, 'c1', { role: 'user', content: 'Persistent' }, { role: 'assistant', content: 'Still here' });

    // Close the DB
    db.close();

    // Reopen
    const db2 = new Database(dbPath);
    db2.pragma('journal_mode = WAL');
    db2.pragma('foreign_keys = ON');

    const rows = db2.prepare(`SELECT role, content FROM chat_messages WHERE chat_id = ? ORDER BY id`).all('c1') as any[];
    db2.close();

    expect(rows).toHaveLength(2);
    const userRow = rows.find((r: any) => r.role === 'user');
    const assistantRow = rows.find((r: any) => r.role === 'assistant');
    expect(userRow?.content).toContain('Persistent');
    expect(assistantRow?.content).toContain('Still here');
  });
});
