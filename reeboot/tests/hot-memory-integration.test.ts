/**
 * Integration test: end-to-end hot memory flow
 *
 * Verifies that:
 *   1. Messages in the DB can be distilled into a hot memory entry
 *   2. The hot memory entry is readable and parseable
 *   3. buildHotMemoryBlock produces a non-empty block with the content
 *   4. Multiple distill cycles respect the rolling window
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, readFileSync, existsSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';

let tmpDir: string;
let db: Database.Database;

beforeEach(async () => {
  tmpDir = join(tmpdir(), `hot-memory-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
  db = new Database(':memory:');
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
});

afterEach(() => {
  db.close();
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

function insertMessage(role: string, content: string, minutesAgo = 0) {
  const d = new Date(Date.now() - minutesAgo * 60 * 1000);
  const dateStr = d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  db.prepare(
    `INSERT INTO messages (id, context_id, channel, peer_id, role, content, created_at)
     VALUES (?, 'main', 'web', 'test-peer', ?, ?, ?)`
  ).run(Math.random().toString(36).slice(2), role, content, dateStr);
}

describe('hot memory integration', () => {
  it('full flow: distill messages → write hot memory → read back → build block', async () => {
    const { initHotMemoryFile, distillSession, readHotMemoryFile, parseHotMemoryFile, buildHotMemoryBlock, HOT_MEMORY_HEADER } = await import('../src/extensions/hot-memory.js');

    // Step 1: Init hot memory file
    initHotMemoryFile(tmpDir);
    let content = readHotMemoryFile(tmpDir);
    expect(content).toBe(HOT_MEMORY_HEADER);

    // Step 2: Seed messages
    insertMessage('user', 'Can you research quantum computing?', 10);
    insertMessage('assistant', 'Quantum annealing vs gate-based models differ in approach.', 9);
    insertMessage('user', 'Tell me more about the differences.', 8);

    // Step 3: Distill
    const mockLLM = async (_prompt: string) => {
      return 'TITLE: Research on quantum computing\nSUMMARY: Explored quantum annealing. User interested in practical applications.\nCONCLUSIONS: Gate-based is more flexible.';
    };
    await distillSession({ db, hotMemoryDir: tmpDir, llmCall: mockLLM });

    // Step 4: Read back and verify
    content = readHotMemoryFile(tmpDir);
    expect(content).not.toBe(HOT_MEMORY_HEADER);
    expect(content).toContain('Research on quantum computing');
    expect(content).toContain('Gate-based is more flexible');

    const entries = parseHotMemoryFile(content);
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe('Research on quantum computing');

    // Step 5: Build hot memory block
    const block = buildHotMemoryBlock(content);
    expect(block).not.toBe('');
    expect(block).toContain('[HOT MEMORY]');
    expect(block).toContain('Research on quantum computing');
    expect(block).toContain('session_search');
    expect(block).toContain('[END HOT MEMORY]');
  });

  it('rolling window: multiple distill cycles stay within bounds', async () => {
    const { initHotMemoryFile, distillSession, readHotMemoryFile, parseHotMemoryFile } = await import('../src/extensions/hot-memory.js');

    initHotMemoryFile(tmpDir);

    // Simulate 7 sessions by pre-populating hot memory with 6 entries
    // then distilling 1 new session. This avoids the dedup timestamp issue.

    // Write 6 entries directly
    const entries = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(Date.now() - (6 - i) * 60 * 60 * 1000);
      const dateStr = d.toISOString().slice(0, 16).replace('T', ' ');
      return `## ${dateStr} — Session ${i + 1}\nSummary: Discussion about topic ${i + 1}.\nConclusions: Key insight ${i + 1}.\n\n`;
    });
    writeFileSync(join(tmpDir, 'hot-memory.md'), '# HOT MEMORY — Recent Sessions\n\n' + entries.join(''), 'utf-8');

    // Insert a new session's messages
    insertMessage('user', 'New session message', 1);
    insertMessage('assistant', 'New response', 0.5);

    let sessionCount = 6;
    const mockLLM = async (_prompt: string) => {
      sessionCount++;
      return `TITLE: Session ${sessionCount}\nSUMMARY: Discussion about topic ${sessionCount}.\nCONCLUSIONS: Key insight from session ${sessionCount}.`;
    };

    await distillSession({ db, hotMemoryDir: tmpDir, llmCall: mockLLM });

    // After adding a 7th session, hot memory should have at most 6 entries
    const content = readHotMemoryFile(tmpDir);
    const parsedEntries = parseHotMemoryFile(content);
    expect(parsedEntries.length).toBeLessThanOrEqual(6);
    // The most recent entry should be the new session (Session 7)
    expect(parsedEntries[0].title).toBe('Session 7');
  });

  it('empty messages table does not create hot memory entry', async () => {
    const { initHotMemoryFile, distillSession, readHotMemoryFile, HOT_MEMORY_HEADER } = await import('../src/extensions/hot-memory.js');

    initHotMemoryFile(tmpDir);

    const mockLLM = async (_prompt: string) => 'TITLE: Test\nSUMMARY: Should not be called.\nCONCLUSIONS: N/A.';
    await distillSession({ db, hotMemoryDir: tmpDir, llmCall: mockLLM });

    // No messages in DB → no entry written
    const content = readHotMemoryFile(tmpDir);
    expect(content).toBe(HOT_MEMORY_HEADER);
  });
});
