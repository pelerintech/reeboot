/**
 * Tests for memory consolidation task registration.
 * Tasks 9–11 of the personal-memory request.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import {
  makeMemoryExtension,
  MEMORY_HEADER,
  USER_HEADER,
} from '../extensions/memory-manager.js';

// ─── Tmp dir helpers ──────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(
    tmpdir(),
    `memory-consolidation-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─── Mock scheduler ───────────────────────────────────────────────────────────

function makeScheduler() {
  const jobs: Array<{ id: string; schedule: string }> = [];
  return {
    registerJob: vi.fn((task: { id: string; contextId: string; schedule: string; prompt: string }) => {
      jobs.push({ id: task.id, schedule: task.schedule });
    }),
    cancelJob: vi.fn(),
    jobs,
  };
}

// ─── Task 9: Consolidation task registration ──────────────────────────────────

describe('consolidation task registration', () => {
  it('registers a consolidation job when consolidation.enabled=true', async () => {
    const scheduler = makeScheduler();
    const memoriesDir = join(tmpDir, 'memories');

    const mockPi = {
      on: () => {},
      registerTool: () => {},
      getConfig: () => ({
        memory: {
          enabled: true,
          memoryCharLimit: 2200,
          userCharLimit: 1375,
          consolidation: { enabled: true, schedule: '0 2 * * *' },
        },
      }),
      getDb: () => undefined,
      getScheduler: () => scheduler,
    } as any;

    makeMemoryExtension(mockPi, memoriesDir);

    expect(scheduler.registerJob).toHaveBeenCalledTimes(1);
    const call = scheduler.registerJob.mock.calls[0][0];
    expect(call.id).toBe('__memory_consolidation__');
    expect(call.schedule).toBe('0 2 * * *');
  });

  it('uses the configured schedule', async () => {
    const scheduler = makeScheduler();
    const memoriesDir = join(tmpDir, 'memories');

    const mockPi = {
      on: () => {},
      registerTool: () => {},
      getConfig: () => ({
        memory: {
          enabled: true,
          memoryCharLimit: 2200,
          userCharLimit: 1375,
          consolidation: { enabled: true, schedule: '0 3 * * 1' },
        },
      }),
      getDb: () => undefined,
      getScheduler: () => scheduler,
    } as any;

    makeMemoryExtension(mockPi, memoriesDir);

    expect(scheduler.registerJob).toHaveBeenCalledTimes(1);
    const call = scheduler.registerJob.mock.calls[0][0];
    expect(call.schedule).toBe('0 3 * * 1');
  });

  it('does NOT register consolidation job when consolidation.enabled=false', async () => {
    const scheduler = makeScheduler();
    const memoriesDir = join(tmpDir, 'memories');

    const mockPi = {
      on: () => {},
      registerTool: () => {},
      getConfig: () => ({
        memory: {
          enabled: true,
          memoryCharLimit: 2200,
          userCharLimit: 1375,
          consolidation: { enabled: false, schedule: '0 2 * * *' },
        },
      }),
      getDb: () => undefined,
      getScheduler: () => scheduler,
    } as any;

    makeMemoryExtension(mockPi, memoriesDir);

    expect(scheduler.registerJob).not.toHaveBeenCalled();
  });

  it('does NOT register consolidation job when memory.enabled=false', async () => {
    const scheduler = makeScheduler();
    const memoriesDir = join(tmpDir, 'memories');

    const mockPi = {
      on: () => {},
      registerTool: () => {},
      getConfig: () => ({
        memory: {
          enabled: false,
          memoryCharLimit: 2200,
          userCharLimit: 1375,
          consolidation: { enabled: true, schedule: '0 2 * * *' },
        },
      }),
      getDb: () => undefined,
      getScheduler: () => scheduler,
    } as any;

    makeMemoryExtension(mockPi, memoriesDir);

    expect(scheduler.registerJob).not.toHaveBeenCalled();
  });
});

// ─── Task 10: Consolidation handler — LLM-driven memory update ────────────────

describe('runConsolidation — LLM-driven memory update', () => {
  it('applies add ops from mock LLM response and writes memory_log row', async () => {
    const Database = (await import('better-sqlite3')).default;
    const { runMemoryMigration } = await import('../src/db/schema.js');
    const { runConsolidation } = await import('../extensions/memory-manager.js');

    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS contexts (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        context_id TEXT NOT NULL REFERENCES contexts(id),
        channel TEXT NOT NULL DEFAULT 'web',
        peer_id TEXT NOT NULL DEFAULT 'p',
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tokens_used INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    runMemoryMigration(db);

    // Seed messages
    db.exec(`INSERT INTO contexts (id, name) VALUES ('ctx1', 'Test')`);
    db.prepare(
      `INSERT INTO messages (id, context_id, role, content) VALUES ('m1', 'ctx1', 'user', 'I always work with TypeScript projects')`
    ).run();
    db.prepare(
      `INSERT INTO messages (id, context_id, role, content) VALUES ('m2', 'ctx1', 'assistant', 'Understood, noted for future reference')`
    ).run();

    const memoriesDir = join(tmpDir, 'memories-consolidation');
    mkdirSync(memoriesDir, { recursive: true });
    writeFileSync(join(memoriesDir, 'MEMORY.md'), MEMORY_HEADER + 'Existing note\n', 'utf-8');
    writeFileSync(join(memoriesDir, 'USER.md'), USER_HEADER + 'Name: Alex\n', 'utf-8');

    // Mock LLM that returns structured consolidation response
    const mockLlmCall = vi.fn().mockResolvedValue(
      'ADD memory: Works primarily with TypeScript\nADD user: Prefers detailed explanations'
    );

    await runConsolidation({
      db,
      memoriesDir,
      memoryCharLimit: 2200,
      userCharLimit: 1375,
      llmCall: mockLlmCall,
    });

    // LLM was called
    expect(mockLlmCall).toHaveBeenCalledTimes(1);

    // MEMORY.md should have the new entry
    const { readFileSync } = await import('fs');
    const memContent = readFileSync(join(memoriesDir, 'MEMORY.md'), 'utf-8');
    expect(memContent).toContain('Works primarily with TypeScript');
    expect(memContent).toContain('Existing note'); // original preserved

    // USER.md should have the new entry
    const userContent = readFileSync(join(memoriesDir, 'USER.md'), 'utf-8');
    expect(userContent).toContain('Prefers detailed explanations');
    expect(userContent).toContain('Name: Alex'); // original preserved

    // memory_log row should be written
    const logRow = db.prepare('SELECT * FROM memory_log ORDER BY id DESC LIMIT 1').get() as any;
    expect(logRow).toBeDefined();
    expect(logRow.trigger).toBe('consolidation');
    expect(logRow.ops_applied).toBeGreaterThan(0);
    expect(logRow.memory_chars_before).toBeGreaterThan(0);
    expect(logRow.memory_chars_after).toBeGreaterThan(0);
  });

  it('writes memory_log with ops_applied=0 when LLM returns no ops', async () => {
    const Database = (await import('better-sqlite3')).default;
    const { runMemoryMigration } = await import('../src/db/schema.js');
    const { runConsolidation } = await import('../extensions/memory-manager.js');

    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS contexts (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        context_id TEXT NOT NULL REFERENCES contexts(id),
        channel TEXT NOT NULL DEFAULT 'web',
        peer_id TEXT NOT NULL DEFAULT 'p',
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tokens_used INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    runMemoryMigration(db);

    const memoriesDir = join(tmpDir, 'memories-noops');
    mkdirSync(memoriesDir, { recursive: true });
    writeFileSync(join(memoriesDir, 'MEMORY.md'), MEMORY_HEADER, 'utf-8');
    writeFileSync(join(memoriesDir, 'USER.md'), USER_HEADER, 'utf-8');

    const mockLlmCall = vi.fn().mockResolvedValue('No new insights to add at this time.');

    await runConsolidation({
      db,
      memoriesDir,
      memoryCharLimit: 2200,
      userCharLimit: 1375,
      llmCall: mockLlmCall,
    });

    const logRow = db.prepare('SELECT * FROM memory_log ORDER BY id DESC LIMIT 1').get() as any;
    expect(logRow).toBeDefined();
    expect(logRow.trigger).toBe('consolidation');
    expect(logRow.ops_applied).toBe(0);
  });
});

// ─── Task 11: Auto-capacity management ───────────────────────────────────────

describe('runConsolidation — auto-capacity management', () => {
  it('auto-consolidates when add op would exceed capacity, logs trigger=auto-capacity', async () => {
    const Database = (await import('better-sqlite3')).default;
    const { runMemoryMigration } = await import('../src/db/schema.js');
    const { runConsolidation } = await import('../extensions/memory-manager.js');

    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS contexts (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        context_id TEXT NOT NULL REFERENCES contexts(id),
        channel TEXT NOT NULL DEFAULT 'web',
        peer_id TEXT NOT NULL DEFAULT 'p',
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tokens_used INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    runMemoryMigration(db);

    const memoriesDir = join(tmpDir, 'memories-capacity');
    mkdirSync(memoriesDir, { recursive: true });

    // Seed MEMORY.md at ~95% of a small limit (limit = 100 chars)
    const tinyLimit = 100;
    const existingContent = MEMORY_HEADER + 'Entry A\nEntry B\nEntry C\n'; // ~35 chars body
    writeFileSync(join(memoriesDir, 'MEMORY.md'), existingContent, 'utf-8');
    writeFileSync(join(memoriesDir, 'USER.md'), USER_HEADER, 'utf-8');

    // LLM call sequence:
    // First call: returns an ADD that would exceed capacity
    // Second call (auto-consolidation): returns a trimmed full replacement
    let callCount = 0;
    const mockLlmCall = vi.fn().mockImplementation(async (prompt: string) => {
      callCount++;
      if (callCount === 1) {
        // First call — return an ADD op that would exceed the 100-char limit
        return 'ADD memory: This entry is way too long and will definitely exceed the tiny char limit we set for this test';
      }
      // Second call — auto-consolidation: return trimmed content
      return 'CONSOLIDATED: Entry A\nEntry C\n';
    });

    await runConsolidation({
      db,
      memoriesDir,
      memoryCharLimit: tinyLimit,
      userCharLimit: 1375,
      llmCall: mockLlmCall,
    });

    // Final MEMORY.md should be within the char limit
    const { readFileSync } = await import('fs');
    const finalContent = readFileSync(join(memoriesDir, 'MEMORY.md'), 'utf-8');
    expect(finalContent.length).toBeLessThanOrEqual(tinyLimit);

    // memory_log should have an auto-capacity row
    const logRows = db.prepare('SELECT * FROM memory_log ORDER BY id').all() as any[];
    const autoCapacityRow = logRows.find((r) => r.trigger === 'auto-capacity');
    expect(autoCapacityRow).toBeDefined();
    expect(autoCapacityRow.memory_chars_after).toBeLessThanOrEqual(tinyLimit);
  });
});
