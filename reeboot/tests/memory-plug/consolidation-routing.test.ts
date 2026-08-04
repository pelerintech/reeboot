import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  registerServerJobs,
  runConsolidation,
  registerProvider,
  MEMORY_HEADER,
  USER_HEADER,
} from '../../src/extensions/memory-manager.js';
import {
  STANDARD_CAPABILITIES,
  type MemoryProvider,
  type MemoryScope,
} from '@src/memory-provider.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `consolidation-routing-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

function makeScheduler() {
  return { registerJob: vi.fn(), cancelJob: vi.fn() };
}

function selfConsolidatingProvider(): MemoryProvider {
  return {
    id: 'selfconsolidating',
    async store() { return { id: 'x' }; },
    async update() {},
    async forget() {},
    async recall() { return []; },
    async clear() {},
    async grounding() { return ''; },
    listCapabilities() {
      return [{ name: 'dream', description: 'backend Dream loop', parameters: {}, key: STANDARD_CAPABILITIES.selfConsolidating }];
    },
  };
}

describe('consolidation routing — self-consolidating capability gates the job', () => {
  it('skips reeboot job registration when the active provider self-consolidates', () => {
    const scheduler = makeScheduler();
    registerProvider('selfconsolidating', () => selfConsolidatingProvider());
    registerServerJobs({} as any, scheduler as any, {
      memory: { provider: 'selfconsolidating', enabled: true, providerConfig: { baseUrl: 'http://x' } },
    } as any, tmpDir);
    expect(scheduler.registerJob).not.toHaveBeenCalled();
  });

  it('registers the job for a non-self-consolidating builtin provider', () => {
    const scheduler = makeScheduler();
    registerServerJobs({} as any, scheduler as any, {
      memory: {
        provider: 'builtin',
        enabled: true,
        providerConfig: { consolidation: { enabled: true, schedule: '0 2 * * *' } },
      },
    } as any, tmpDir);
    expect(scheduler.registerJob).toHaveBeenCalledTimes(1);
    const call = scheduler.registerJob.mock.calls[0][0];
    expect(call.id).toBe('__memory_consolidation__');
  });
});

describe('runConsolidation routes writes through the provider contract', () => {
  it('writes insights via provider.store("self", ...) — never direct file writes', async () => {
    const Database = (await import('better-sqlite3')).default;
    const { runMemoryMigration } = await import('../../src/db/schema.js');
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS contexts (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, context_id TEXT NOT NULL REFERENCES contexts(id),
        channel TEXT NOT NULL DEFAULT 'web', peer_id TEXT NOT NULL DEFAULT 'p',
        role TEXT NOT NULL, content TEXT NOT NULL,
        tokens_used INTEGER DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    runMemoryMigration(db);
    db.exec(`INSERT INTO contexts (id, name) VALUES ('ctx1', 'T')`);
    db.prepare(`INSERT INTO messages (id, context_id, role, content) VALUES ('m1','ctx1','user','loves TypeScript')`).run();

    const memoriesDir = join(tmpDir, 'mem');
    mkdirSync(memoriesDir, { recursive: true });
    writeFileSync(join(memoriesDir, 'MEMORY.md'), MEMORY_HEADER, 'utf-8');
    writeFileSync(join(memoriesDir, 'USER.md'), USER_HEADER, 'utf-8');

    const stores: Array<[MemoryScope, string]> = [];
    const spy: MemoryProvider = {
      id: 'spy',
      async store(scope: MemoryScope, content: string) { stores.push([scope, content]); return { id: content }; },
      async update() {},
      async forget() {},
      async recall() { return []; },
      async clear() {},
      async grounding() { return ''; },
      listCapabilities() { return []; },
    };

    const mockLlm = vi.fn().mockResolvedValue('ADD memory: Some deeply held insight');

    await runConsolidation({
      db,
      memoriesDir,
      memoryCharLimit: 2200,
      userCharLimit: 1375,
      llmCall: mockLlm,
      provider: spy,
    });

    // The insight reached the provider, not the file system directly.
    expect(stores).toContainEqual(['self', 'Some deeply held insight']);
    expect(readFileSync(join(memoriesDir, 'MEMORY.md'), 'utf-8')).not.toContain('Some deeply held insight');
  });
});
