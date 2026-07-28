import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';

// These will be imported after the implementation exists
let distillSession: (opts: any) => Promise<void>;
let initHotMemoryFile: (dir: string) => void;
let parseHotMemoryFile: (content: string) => any[];
let HOT_MEMORY_HEADER: string;

beforeEach(async () => {
  try {
    const mod = await import('../../src/extensions/hot-memory.js');
    distillSession = mod.distillSession;
    initHotMemoryFile = mod.initHotMemoryFile;
    parseHotMemoryFile = mod.parseHotMemoryFile;
    HOT_MEMORY_HEADER = mod.HOT_MEMORY_HEADER;
  } catch {
    // Module doesn't exist yet — tests will fail as expected
  }
});

// ─── Tmp dir helpers ──────────────────────────────────────────────────────────

let tmpDir: string;
let db: Database.Database;

beforeEach(() => {
  tmpDir = join(tmpdir(), `hot-memory-distill-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  db = new Database(':memory:');
});

afterEach(() => {
  db.close();
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─── distillSession ───────────────────────────────────────────────────────────

describe('distillSession', () => {
  function createMessagesTable() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        context_id TEXT NOT NULL,
        channel TEXT,
        peer_id TEXT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
  }

  function insertMessage(role: string, content: string) {
    db.prepare(
      `INSERT INTO messages (id, context_id, channel, peer_id, role, content, created_at)
       VALUES (?, 'main', 'web', 'test-peer', ?, ?, datetime('now'))`
    ).run(Math.random().toString(36).slice(2), role, content);
  }

  it('writes a hot memory entry after distilling a session with messages', async () => {
    createMessagesTable();
    initHotMemoryFile(tmpDir);

    insertMessage('user', 'Can you research quantum computing?');
    insertMessage('assistant', 'Sure, let me look into quantum annealing vs gate-based models.');
    insertMessage('user', 'Great, tell me more about the differences.');

    const mockLLMCall = async (_prompt: string) => {
      return [
        'TITLE: Research on quantum computing',
        'SUMMARY: Explored quantum annealing vs gate-based models. User interested in practical applications.',
        'CONCLUSIONS: Gate-based more flexible but noisier. User wants to revisit next session.',
      ].join('\n');
    };

    await distillSession({ db, hotMemoryDir: tmpDir, llmCall: mockLLMCall });

    const content = readFileSync(join(tmpDir, 'hot-memory.md'), 'utf-8');
    expect(content).toContain('Research on quantum computing');
    expect(content).toContain('quantum annealing');
    expect(content).toContain('Gate-based more flexible');

    const entries = parseHotMemoryFile(content);
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe('Research on quantum computing');
    expect(entries[0].summary).toContain('quantum annealing');
  });

  it('does nothing when there are no new messages since last hot memory entry', async () => {
    createMessagesTable();
    initHotMemoryFile(tmpDir);

    // Pre-seed a hot memory entry so the function knows there's a baseline
    const earlierDate = new Date(Date.now() - 60 * 60 * 1000);
    const earlierStr = earlierDate.toISOString().slice(0, 16).replace('T', ' ');
    const { writeFileSync } = await import('fs');
    writeFileSync(join(tmpDir, 'hot-memory.md'),
      HOT_MEMORY_HEADER +
      `## ${earlierStr} — Previous session\nSummary: An earlier chat.\nConclusions: None.\n\n`,
      'utf-8'
    );

    // Insert messages BEFORE the earlier date (should not trigger new distill)
    // Use the same datetime format as SQLite: YYYY-MM-DD HH:MM:SS
    const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const oldDateStr = oldDate.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
    db.prepare(
      `INSERT INTO messages (id, context_id, channel, peer_id, role, content, created_at)
       VALUES (?, 'main', 'web', 'test-peer', 'user', 'old message', ?)`
    ).run('old-id', oldDateStr);

    let callCount = 0;
    const mockLLMCall = async (prompt: string) => {
      callCount++;
      return 'TITLE: Test\nSUMMARY: A session.\nCONCLUSIONS: None.';
    };

    await distillSession({ db, hotMemoryDir: tmpDir, llmCall: mockLLMCall });
    expect(callCount).toBe(0); // LLM should NOT be called — no new messages
  });

  it('does not crash when LLM call fails', async () => {
    createMessagesTable();
    initHotMemoryFile(tmpDir);

    insertMessage('user', 'Hello');
    insertMessage('assistant', 'Hi there');

    const failingLLMCall = async (_prompt: string) => {
      throw new Error('LLM unavailable');
    };

    // Should not throw
    await distillSession({ db, hotMemoryDir: tmpDir, llmCall: failingLLMCall });

    // File should remain unchanged (just the header)
    const content = readFileSync(join(tmpDir, 'hot-memory.md'), 'utf-8');
    expect(content).toBe(HOT_MEMORY_HEADER);
  });

  it('prepends new entry and prunes old ones', async () => {
    createMessagesTable();
    initHotMemoryFile(tmpDir);

    // Create 6 earlier entries in the file
    const existingEntries = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(Date.now() - (6 - i) * 60 * 60 * 1000);
      const dateStr = d.toISOString().slice(0, 16).replace('T', ' ');
      return `## ${dateStr} — Old session ${i + 1}\nSummary: Summary of session ${i + 1}.\nConclusions: None.\n`;
    });
    const initialContent = HOT_MEMORY_HEADER + existingEntries.join('\n');
    const filePath = join(tmpDir, 'hot-memory.md');
    const { writeFileSync } = await import('fs');
    writeFileSync(filePath, initialContent, 'utf-8');

    // Now distill a new session
    insertMessage('user', 'New topic');
    insertMessage('assistant', 'New response');

    const mockLLMCall = async (_prompt: string) => {
      return 'TITLE: Brand new session\nSUMMARY: Discussed a brand new topic.\nCONCLUSIONS: More work needed.';
    };

    await distillSession({ db, hotMemoryDir: tmpDir, llmCall: mockLLMCall });

    const content = readFileSync(filePath, 'utf-8');
    const entries = parseHotMemoryFile(content);

    // Should have at most 6 entries (the new one + 5 old, pruned from 6 old)
    expect(entries.length).toBeLessThanOrEqual(6);
    expect(entries[0].title).toBe('Brand new session');
  });
});
