import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { loadVecExtension } from '../src/db/index.js';
import { runKnowledgeMigration } from '../src/db/schema.js';

// Mock embedder
vi.mock('../src/knowledge/embedder.js', () => ({
  embed: vi.fn().mockImplementation(async (texts: string[]) => texts.map(() => new Float32Array(768).fill(0.1))),
  embedOne: vi.fn().mockImplementation(async () => new Float32Array(768).fill(0.1)),
  resetEmbedder: vi.fn(),
}));

vi.mock('../src/knowledge/ingest.js', () => ({
  ingestDocument: vi.fn().mockResolvedValue({ docId: 'id1', chunkCount: 1, confidence: 'medium' }),
}));

vi.mock('../src/knowledge/search.js', () => ({
  hybridSearch: vi.fn().mockResolvedValue([]),
}));

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  loadVecExtension(db);
  runKnowledgeMigration(db);
  return db;
}

describe('wiki lint scheduled task', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    vi.clearAllMocks();
  });

  afterEach(() => db.close());

  it('registers a lint scheduled task when wiki.enabled=true', async () => {
    const { makeKnowledgeExtension } = await import('../extensions/knowledge-manager.js');

    const registeredJobs: Array<{ id: string; schedule: string }> = [];

    const mockPi = {
      on: vi.fn(),
      registerTool: vi.fn(),
      getConfig: () => ({
        knowledge: {
          enabled: true,
          embeddingModel: 'nomic-ai/nomic-embed-text-v1.5',
          dimensions: 768,
          chunkSize: 512,
          chunkOverlap: 64,
          wiki: { enabled: true, lint: { schedule: '0 9 * * 1' } },
        },
      }),
      getDb: () => db,
      sendUserMessage: vi.fn(),
      getScheduler: () => ({
        registerJob: (job: { id: string; schedule: string }) => {
          registeredJobs.push(job);
        },
      }),
    };

    makeKnowledgeExtension(mockPi as any, { rawDir: '/tmp/raw', wikiDir: '/tmp/wiki' });

    const lintJob = registeredJobs.find((j) => j.id.includes('lint'));
    expect(lintJob).toBeDefined();
    expect(lintJob!.schedule).toBe('0 9 * * 1');
  });

  it('does NOT register lint task when wiki.enabled=false', async () => {
    const { makeKnowledgeExtension } = await import('../extensions/knowledge-manager.js');

    const registeredJobs: Array<{ id: string }> = [];

    const mockPi = {
      on: vi.fn(),
      registerTool: vi.fn(),
      getConfig: () => ({
        knowledge: {
          enabled: true,
          embeddingModel: 'nomic-ai/nomic-embed-text-v1.5',
          dimensions: 768,
          chunkSize: 512,
          chunkOverlap: 64,
          wiki: { enabled: false, lint: { schedule: '0 9 * * 1' } },
        },
      }),
      getDb: () => db,
      sendUserMessage: vi.fn(),
      getScheduler: () => ({
        registerJob: (job: { id: string }) => {
          registeredJobs.push(job);
        },
      }),
    };

    makeKnowledgeExtension(mockPi as any, { rawDir: '/tmp/raw', wikiDir: '/tmp/wiki' });

    const lintJob = registeredJobs.find((j) => j.id.includes('lint'));
    expect(lintJob).toBeUndefined();
  });
});
