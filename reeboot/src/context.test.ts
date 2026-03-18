import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';

// We test context functions with a temp directory acting as ~/.reeboot
let tmpHome: string;
let dbPath: string;
let db: Database.Database;

beforeEach(() => {
  tmpHome = join(tmpdir(), `reeboot-ctx-test-${Date.now()}`);
  mkdirSync(tmpHome, { recursive: true });
  dbPath = join(tmpHome, 'reeboot.db');
});

afterEach(() => {
  try { db?.close(); } catch { /* ignore */ }
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('Context system (3.1, 3.2)', () => {
  it('createContext inserts a row and listContexts returns it', async () => {
    const { createContextsTable, createContext, listContexts } = await import('./context.js');
    db = new Database(dbPath);
    createContextsTable(db);
    createContext(db, { id: 'main', name: 'main', modelProvider: 'anthropic', modelId: 'claude-sonnet-4-20250514' });
    const list = listContexts(db);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('main');
  });

  it('getActiveSessionPath returns path within sessions/<contextId>/', async () => {
    const { getActiveSessionPath } = await import('./context.js');
    const sessionPath = getActiveSessionPath('main', tmpHome);
    expect(sessionPath).toContain('sessions/main/');
    expect(sessionPath).toContain('session-');
  });

  it('initContextWorkspace creates directory structure', async () => {
    const { initContextWorkspace } = await import('./context.js');
    await initContextWorkspace('main', tmpHome);
    expect(existsSync(join(tmpHome, 'contexts', 'main', 'workspace'))).toBe(true);
    expect(existsSync(join(tmpHome, 'contexts', 'main', '.pi', 'extensions'))).toBe(true);
    expect(existsSync(join(tmpHome, 'contexts', 'main', 'AGENTS.md'))).toBe(true);
  });

  it('initContextWorkspace does not overwrite existing AGENTS.md', async () => {
    const { initContextWorkspace } = await import('./context.js');
    const agentsPath = join(tmpHome, 'contexts', 'main', 'AGENTS.md');
    mkdirSync(join(tmpHome, 'contexts', 'main'), { recursive: true });
    writeFileSync(agentsPath, '# Custom', 'utf-8');
    await initContextWorkspace('main', tmpHome);
    const { readFileSync } = await import('fs');
    expect(readFileSync(agentsPath, 'utf-8')).toBe('# Custom');
  });

  it('listSessions returns empty array for new context', async () => {
    const { listSessions } = await import('./context.js');
    const sessions = await listSessions('main', tmpHome);
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions).toHaveLength(0);
  });
});
