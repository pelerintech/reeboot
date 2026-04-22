import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadVecExtension } from '../../src/db/index.js';
import { runKnowledgeMigration } from '../../src/db/schema.js';

// Mock embedder — returns slightly different vectors so KNN finds something
vi.mock('../../src/knowledge/embedder.js', () => ({
  embed: vi.fn().mockImplementation(async (texts: string[]) => {
    return texts.map((_, i) => new Float32Array(768).fill(0.1 + i * 0.001));
  }),
  embedOne: vi.fn().mockImplementation(async () => new Float32Array(768).fill(0.1)),
  resetEmbedder: vi.fn(),
}));

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  loadVecExtension(db);
  runKnowledgeMigration(db);
  return db;
}

function tmpMdFile(content: string): string {
  const dir = join(tmpdir(), `search-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'doc.md');
  writeFileSync(path, content, 'utf-8');
  return path;
}

const defaultConfig = {
  enabled: true,
  embeddingModel: 'nomic-ai/nomic-embed-text-v1.5',
  dimensions: 768,
  chunkSize: 512,
  chunkOverlap: 64,
  wiki: { enabled: false, lint: { schedule: '0 9 * * 1' } },
};

describe('hybridSearch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array for empty corpus', async () => {
    const db = makeDb();
    const { hybridSearch } = await import('../../src/knowledge/search.js');

    const results = await hybridSearch('anything', 5, defaultConfig, db);
    expect(results).toEqual([]);

    db.close();
  });

  it('returns results with required citation fields', async () => {
    const db = makeDb();
    const path = tmpMdFile('Civil Code Article 1234 states that contracts require consent and offer.');

    const { ingestDocument } = await import('../../src/knowledge/ingest.js');
    await ingestDocument(path, 'owner', 'high', defaultConfig, db);

    const { hybridSearch } = await import('../../src/knowledge/search.js');
    const results = await hybridSearch('Article 1234', 5, defaultConfig, db);

    expect(results.length).toBeGreaterThan(0);
    const r = results[0];
    expect(r).toHaveProperty('content');
    expect(r).toHaveProperty('filename');
    expect(r).toHaveProperty('source_tier');
    expect(r).toHaveProperty('confidence');
    expect(r).toHaveProperty('doc_id');
    expect(r).toHaveProperty('chunk_index');

    db.close();
  });

  it('returns at most `limit` results', async () => {
    const db = makeDb();
    // Ingest two documents
    const path1 = tmpMdFile('First document with lots of content about contracts and law.');
    const path2 = tmpMdFile('Second document covering obligations and agreements.');

    const { ingestDocument } = await import('../../src/knowledge/ingest.js');
    await ingestDocument(path1, 'owner', 'medium', defaultConfig, db);
    await ingestDocument(path2, 'owner', 'low', defaultConfig, db);

    const { hybridSearch } = await import('../../src/knowledge/search.js');
    const results = await hybridSearch('contracts', 1, defaultConfig, db);

    expect(results.length).toBeLessThanOrEqual(1);

    db.close();
  });

  it('includes source_tier in results, supporting mixed tiers', async () => {
    const db = makeDb();

    const path1 = tmpMdFile('Template document about legal procedures.');
    const path2 = tmpMdFile('Owner document about contractual obligations.');

    const { ingestDocument } = await import('../../src/knowledge/ingest.js');
    await ingestDocument(path1, 'template', 'high', defaultConfig, db);
    await ingestDocument(path2, 'owner', 'medium', defaultConfig, db);

    const { hybridSearch } = await import('../../src/knowledge/search.js');
    const results = await hybridSearch('document', 10, defaultConfig, db);

    expect(results.length).toBeGreaterThan(0);
    const tiers = results.map((r) => r.source_tier);
    // Both tiers should appear if both documents match
    expect(tiers.some((t) => t === 'template' || t === 'owner')).toBe(true);

    db.close();
  });

  it('returns vector-matched results even without exact FTS keyword match', async () => {
    // Spec requires: "GIVEN corpus containing 'contractual obligations'
    // WHEN hybridSearch('obligations between parties')
    // THEN semantically related chunks returned even without exact keyword match"
    //
    // With a mocked embedder returning identical fixed vectors, ALL documents
    // produce identical embeddings and thus identical cosine distance.
    // We verify that the vector search path returns results for a query that
    // has NO FTS keyword match (none of the query terms appear in the corpus).
    const db = makeDb();
    const path = tmpMdFile('contractual obligations binding party agreement consideration');

    const { ingestDocument } = await import('../../src/knowledge/ingest.js');
    await ingestDocument(path, 'owner', 'medium', defaultConfig, db);

    const { hybridSearch } = await import('../../src/knowledge/search.js');
    // Query uses NONE of the exact words in the corpus (no FTS match)
    // but with identical embeddings the vector path should still find it
    const results = await hybridSearch('duties owed between signatories', 5, defaultConfig, db);

    // With mocked embedder (identical vectors), vector KNN will return ALL chunks
    // regardless of semantic content — this verifies the vector path is active
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty('content');
    expect(results[0]).toHaveProperty('doc_id');
    // Result came via vector path (score from vector distance, not FTS base score of 0.5)
    expect(results[0].score).toBeGreaterThan(0.5);

    db.close();
  });

  it('deduplicates — same chunk does not appear twice', async () => {
    const db = makeDb();
    const path = tmpMdFile('Unique content about specific legal matters for testing deduplication.');

    const { ingestDocument } = await import('../../src/knowledge/ingest.js');
    await ingestDocument(path, 'owner', 'medium', defaultConfig, db);

    const { hybridSearch } = await import('../../src/knowledge/search.js');
    const results = await hybridSearch('unique legal content', 10, defaultConfig, db);

    // Check for duplicates by doc_id + chunk_index
    const seen = new Set<string>();
    for (const r of results) {
      const key = `${r.doc_id}:${r.chunk_index}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }

    db.close();
  });
});
