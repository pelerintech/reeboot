import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadVecExtension } from '../src/db/index.js';
import { runKnowledgeMigration } from '../src/db/schema.js';
import { initKnowledgeDirs } from '../extensions/knowledge-manager.js';

// Mock embedder
vi.mock('../src/knowledge/embedder.js', () => ({
  embed: vi.fn().mockResolvedValue([new Float32Array(768).fill(0.1)]),
  embedOne: vi.fn().mockResolvedValue(new Float32Array(768).fill(0.1)),
  resetEmbedder: vi.fn(),
}));
vi.mock('../src/knowledge/ingest.js', () => ({
  ingestDocument: vi.fn().mockResolvedValue({ docId: 'id1', chunkCount: 1, confidence: 'medium' }),
}));
vi.mock('../src/knowledge/search.js', () => ({
  hybridSearch: vi.fn().mockResolvedValue([]),
}));

describe('knowledge integration — directory init', () => {
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = join(tmpdir(), `knowledge-integration-${Date.now()}`);
    mkdirSync(tmpBase, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(tmpBase, { recursive: true, force: true }); } catch {}
  });

  it('creates raw/template/ and raw/owner/ directories', () => {
    const rawDir = join(tmpBase, 'raw');
    initKnowledgeDirs(rawDir);

    expect(existsSync(join(rawDir, 'template'))).toBe(true);
    expect(existsSync(join(rawDir, 'owner'))).toBe(true);
  });

  it('creates wiki/ structure with index.md and log.md when wiki enabled', () => {
    const rawDir = join(tmpBase, 'raw');
    const wikiDir = join(tmpBase, 'wiki');
    initKnowledgeDirs(rawDir, wikiDir);

    expect(existsSync(wikiDir)).toBe(true);
    expect(existsSync(join(wikiDir, 'index.md'))).toBe(true);
    expect(existsSync(join(wikiDir, 'log.md'))).toBe(true);
    expect(existsSync(join(wikiDir, 'concepts'))).toBe(true);
    expect(existsSync(join(wikiDir, 'sources'))).toBe(true);
    expect(existsSync(join(wikiDir, 'comparisons'))).toBe(true);
  });

  it('does NOT create wiki/ when wikiDir is not provided', () => {
    const rawDir = join(tmpBase, 'raw');
    const wikiDir = join(tmpBase, 'wiki');
    initKnowledgeDirs(rawDir); // no wikiDir arg

    expect(existsSync(wikiDir)).toBe(false);
  });

  it('is idempotent — calling initKnowledgeDirs twice does not throw', () => {
    const rawDir = join(tmpBase, 'raw');
    const wikiDir = join(tmpBase, 'wiki');

    expect(() => initKnowledgeDirs(rawDir, wikiDir)).not.toThrow();
    expect(() => initKnowledgeDirs(rawDir, wikiDir)).not.toThrow();
  });
});

describe('knowledge integration — loader wiring', () => {
  it('getBundledFactories includes knowledge-manager when knowledge.enabled=true', async () => {
    const { getBundledFactories } = await import('../src/extensions/loader.js');

    // Build a minimal config with knowledge.enabled=true
    const { defaultConfig } = await import('../src/config.js');
    const config = {
      ...defaultConfig,
      knowledge: {
        ...defaultConfig.knowledge,
        enabled: true,
      },
    };

    const factories = getBundledFactories(config as any);
    // Each factory is a function — we check that registering with knowledge.enabled
    // adds one more factory compared to disabled
    const configDisabled = {
      ...defaultConfig,
      knowledge: {
        ...defaultConfig.knowledge,
        enabled: false,
      },
    };
    const factoriesDisabled = getBundledFactories(configDisabled as any);

    expect(factories.length).toBeGreaterThan(factoriesDisabled.length);
  });
});

describe('knowledge integration — schema tables', () => {
  it('all knowledge tables exist after schema migration', () => {
    const db = new Database(':memory:');
    loadVecExtension(db);
    runKnowledgeMigration(db);

    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' OR type='shadow'").all() as Array<{ name: string }>
    ).map((r) => r.name);

    expect(tables).toContain('knowledge_sources');
    expect(tables).toContain('wiki_pages');
    expect(tables).toContain('knowledge_fts');

    // Verify vec0 by inserting a vector
    expect(() => {
      const vec = new Float32Array(768).fill(0.1);
      db.prepare(
        `INSERT INTO knowledge_chunks (embedding, doc_id, chunk_index, content) VALUES (?, 'doc1', '0', 'test')`
      ).run(Buffer.from(vec.buffer));
    }).not.toThrow();

    db.close();
  });
});
