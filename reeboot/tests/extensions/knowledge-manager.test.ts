import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadVecExtension } from '../../src/db/index.js';
import { runKnowledgeMigration } from '../../src/db/schema.js';

// Mock embedder to avoid model downloads
vi.mock('../../src/knowledge/embedder.js', () => ({
  embed: vi.fn().mockImplementation(async (texts: string[]) => {
    return texts.map(() => new Float32Array(768).fill(0.1));
  }),
  embedOne: vi.fn().mockImplementation(async () => new Float32Array(768).fill(0.1)),
  resetEmbedder: vi.fn(),
}));

// Mock ingest + search for isolated tool tests
vi.mock('../../src/knowledge/ingest.js', () => ({
  ingestDocument: vi.fn().mockResolvedValue({
    docId: 'mock-doc-id',
    chunkCount: 3,
    confidence: 'medium',
  }),
}));

vi.mock('../../src/knowledge/search.js', () => ({
  hybridSearch: vi.fn().mockResolvedValue([
    {
      content: 'This is a relevant excerpt about contracts.',
      filename: 'contracts.pdf',
      source_tier: 'owner',
      confidence: 'high',
      doc_id: 'doc1',
      chunk_index: 0,
      score: 0.95,
    },
  ]),
}));

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  loadVecExtension(db);
  runKnowledgeMigration(db);
  return db;
}

interface MockPi {
  on: (event: string, handler: Function) => void;
  registerTool: (toolDef: { name: string; execute: Function }) => void;
  getConfig: () => Record<string, unknown>;
  getDb: () => Database.Database;
  sendUserMessage?: (msg: string) => void;
  handlers: Record<string, Function>;
  tools: Map<string, Function>;
  messages: string[];
}

function makeMockPi(config: Record<string, unknown>, db: Database.Database): MockPi {
  const handlers: Record<string, Function> = {};
  const tools = new Map<string, Function>();
  const messages: string[] = [];

  const pi: MockPi = {
    handlers,
    tools,
    messages,
    on: (event: string, handler: Function) => {
      handlers[event] = handler;
    },
    registerTool: (toolDef: { name: string; execute: Function }) => {
      tools.set(toolDef.name, toolDef.execute);
    },
    getConfig: () => config,
    getDb: () => db,
    sendUserMessage: (msg: string) => {
      messages.push(msg);
    },
  };

  return pi;
}

describe('knowledge-manager extension — knowledge_search with wiki augmentation', () => {
  let db: Database.Database;
  let wikiDir: string;

  beforeEach(() => {
    db = makeDb();
    wikiDir = join(tmpdir(), `wiki-search-test-${Date.now()}`);
    mkdirSync(join(wikiDir, 'concepts'), { recursive: true });
    mkdirSync(join(wikiDir, 'sources'), { recursive: true });
    mkdirSync(join(wikiDir, 'comparisons'), { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    db.close();
    try { rmSync(wikiDir, { recursive: true, force: true }); } catch {}
  });

  it('includes wiki context section when wiki is enabled and index.md exists', async () => {
    const { makeKnowledgeExtension } = await import('../../extensions/knowledge-manager.js');
    const { hybridSearch } = await import('../../src/knowledge/search.js');
    const { writeFileSync } = await import('fs');

    vi.mocked(hybridSearch).mockResolvedValueOnce([
      {
        content: 'Contract must include mutual consent.',
        filename: 'civil-code.pdf',
        source_tier: 'template',
        confidence: 'high',
        doc_id: 'doc1',
        chunk_index: 0,
        score: 0.9,
      },
    ]);

    // Write an index.md and a concept page
    writeFileSync(
      join(wikiDir, 'index.md'),
      '# Knowledge Wiki Index\n\n## consent\n\nSee [[consent]] concept page.\n',
      'utf-8'
    );
    writeFileSync(
      join(wikiDir, 'concepts', 'consent.md'),
      '# Consent\n\nMutual consent is required for valid contracts under Article 1234.\n',
      'utf-8'
    );

    const config = {
      knowledge: {
        enabled: true,
        embeddingModel: 'nomic-ai/nomic-embed-text-v1.5',
        dimensions: 768,
        chunkSize: 512,
        chunkOverlap: 64,
        wiki: { enabled: true, lint: { schedule: '0 9 * * 1' } },
      },
    };
    const pi = makeMockPi(config, db);
    makeKnowledgeExtension(pi as any, { rawDir: '/tmp/raw', wikiDir });

    const searchHandler = pi.tools.get('knowledge_search')!;
    const result = await searchHandler('call-id', { query: 'contract consent', limit: 3 });

    const text = result.content[0].text;
    // Must include raw corpus results
    expect(text).toContain('civil-code.pdf');
    // Must include a wiki context section
    expect(text).toContain('Wiki context');
    // Must surface the relevant concept page content
    expect(text).toContain('consent.md');
  });

  it('does NOT include wiki context when wiki is disabled', async () => {
    const { makeKnowledgeExtension } = await import('../../extensions/knowledge-manager.js');
    const { hybridSearch } = await import('../../src/knowledge/search.js');

    vi.mocked(hybridSearch).mockResolvedValueOnce([
      {
        content: 'Some content.',
        filename: 'doc.md',
        source_tier: 'owner',
        confidence: 'medium',
        doc_id: 'doc2',
        chunk_index: 0,
        score: 0.8,
      },
    ]);

    const config = {
      knowledge: {
        enabled: true,
        embeddingModel: 'nomic-ai/nomic-embed-text-v1.5',
        dimensions: 768,
        chunkSize: 512,
        chunkOverlap: 64,
        wiki: { enabled: false, lint: { schedule: '0 9 * * 1' } },
      },
    };
    const pi = makeMockPi(config, db);
    makeKnowledgeExtension(pi as any, { rawDir: '/tmp/raw', wikiDir: '/tmp/wiki' });

    const searchHandler = pi.tools.get('knowledge_search')!;
    const result = await searchHandler('call-id', { query: 'some query' });

    expect(result.content[0].text).not.toContain('Wiki context');
  });
});

describe('knowledge-manager extension — knowledge_search tool', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    vi.clearAllMocks();
  });

  afterEach(() => db.close());

  it('returns formatted citation string from hybridSearch results', async () => {
    const { makeKnowledgeExtension } = await import('../../extensions/knowledge-manager.js');
    const { hybridSearch } = await import('../../src/knowledge/search.js');

    vi.mocked(hybridSearch).mockResolvedValueOnce([
      {
        content: 'Civil Code Article 1234 requires consent.',
        filename: 'civil-code.pdf',
        source_tier: 'template',
        confidence: 'high',
        doc_id: 'doc1',
        chunk_index: 0,
        score: 0.9,
      },
    ]);

    const config = {
      knowledge: {
        enabled: true,
        embeddingModel: 'nomic-ai/nomic-embed-text-v1.5',
        dimensions: 768,
        chunkSize: 512,
        chunkOverlap: 64,
        wiki: { enabled: false, lint: { schedule: '0 9 * * 1' } },
      },
    };
    const pi = makeMockPi(config, db);
    makeKnowledgeExtension(pi as any, { rawDir: '/tmp/raw', wikiDir: '/tmp/wiki' });

    const searchHandler = pi.tools.get('knowledge_search')!;
    const result = await searchHandler('call-id', { query: 'contract consent', limit: 3 });

    expect(result.content).toHaveLength(1);
    const text = result.content[0].text;
    expect(text).toContain('civil-code.pdf');
    expect(text).toContain('template');
    expect(text).toContain('high');
    expect(text).toContain('Civil Code Article 1234');
  });

  it('returns "No results found" when corpus has no matches', async () => {
    const { makeKnowledgeExtension } = await import('../../extensions/knowledge-manager.js');
    const { hybridSearch } = await import('../../src/knowledge/search.js');

    vi.mocked(hybridSearch).mockResolvedValueOnce([]);

    const config = {
      knowledge: {
        enabled: true,
        embeddingModel: 'nomic-ai/nomic-embed-text-v1.5',
        dimensions: 768,
        chunkSize: 512,
        chunkOverlap: 64,
        wiki: { enabled: false, lint: { schedule: '0 9 * * 1' } },
      },
    };
    const pi = makeMockPi(config, db);
    makeKnowledgeExtension(pi as any, { rawDir: '/tmp/raw', wikiDir: '/tmp/wiki' });

    const searchHandler = pi.tools.get('knowledge_search')!;
    const result = await searchHandler('call-id', { query: 'nonexistent topic' });

    expect(result.content[0].text).toContain('No results found');
  });
});

describe('knowledge-manager extension — knowledge_ingest tool', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    vi.clearAllMocks();
  });

  afterEach(() => db.close());

  it('calls ingestDocument with correct args and returns result summary', async () => {
    const { makeKnowledgeExtension } = await import('../../extensions/knowledge-manager.js');
    const { ingestDocument } = await import('../../src/knowledge/ingest.js');

    vi.mocked(ingestDocument).mockResolvedValueOnce({
      docId: 'test-doc-id',
      chunkCount: 7,
      confidence: 'high',
    });

    const config = {
      knowledge: {
        enabled: true,
        embeddingModel: 'nomic-ai/nomic-embed-text-v1.5',
        dimensions: 768,
        chunkSize: 512,
        chunkOverlap: 64,
        wiki: { enabled: false, lint: { schedule: '0 9 * * 1' } },
      },
    };
    const pi = makeMockPi(config, db);
    makeKnowledgeExtension(pi as any, { rawDir: '/tmp/raw', wikiDir: '/tmp/wiki' });

    const ingestHandler = pi.tools.get('knowledge_ingest')!;
    const result = await ingestHandler('call-id', {
      filePath: '/tmp/raw/owner/contract.pdf',
      sourceTier: 'owner',
      confidence: 'high',
    });

    expect(ingestDocument).toHaveBeenCalledWith(
      '/tmp/raw/owner/contract.pdf',
      'owner',
      'high',
      expect.objectContaining({ enabled: true }),
      db
    );

    expect(result.content[0].text).toContain('7');
    expect(result.content[0].text).toContain('high');
    expect(result.content[0].text).toContain('test-doc-id');
  });
});

describe('knowledge-manager extension — watcher lifecycle', () => {
  let db: Database.Database;
  let rawDir: string;

  beforeEach(() => {
    db = makeDb();
    rawDir = join(tmpdir(), `lifecycle-test-${Date.now()}`);
    mkdirSync(join(rawDir, 'owner'), { recursive: true });
    mkdirSync(join(rawDir, 'template'), { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    db.close();
    try { rmSync(rawDir, { recursive: true, force: true }); } catch {}
  });

  it('sends a sendUserMessage notification when agent_end fires with pending files', async () => {
    const { makeKnowledgeExtension } = await import('../../extensions/knowledge-manager.js');
    const { KnowledgeWatcher } = await import('../../src/knowledge/watcher.js');

    const config = {
      knowledge: {
        enabled: true,
        embeddingModel: 'nomic-ai/nomic-embed-text-v1.5',
        dimensions: 768,
        chunkSize: 512,
        chunkOverlap: 64,
        wiki: { enabled: false, lint: { schedule: '0 9 * * 1' } },
      },
    };
    const pi = makeMockPi(config, db);
    makeKnowledgeExtension(pi as any, { rawDir, wikiDir: '/tmp/wiki' });

    // Manually inject a pending file into the watcher
    // We need to find the watcher instance — use a spy
    // Instead, write a file and wait for debounce
    const { writeFileSync } = await import('fs');
    writeFileSync(join(rawDir, 'owner', 'new-doc.md'), '# New document', 'utf-8');

    // Wait for watcher debounce
    await new Promise((res) => setTimeout(res, 500));

    // Fire agent_end
    const agentEndHandler = pi.handlers['agent_end'];
    expect(agentEndHandler).toBeDefined();
    await agentEndHandler();

    // Should have called sendUserMessage with notification
    expect(pi.messages.length).toBeGreaterThan(0);
    expect(pi.messages[0]).toContain('new-doc.md');
    expect(pi.messages[0]).toContain('together');
  });

  it('does NOT send notification when no files are pending', async () => {
    const { makeKnowledgeExtension } = await import('../../extensions/knowledge-manager.js');

    const config = {
      knowledge: {
        enabled: true,
        embeddingModel: 'nomic-ai/nomic-embed-text-v1.5',
        dimensions: 768,
        chunkSize: 512,
        chunkOverlap: 64,
        wiki: { enabled: false, lint: { schedule: '0 9 * * 1' } },
      },
    };
    const pi = makeMockPi(config, db);
    makeKnowledgeExtension(pi as any, { rawDir, wikiDir: '/tmp/wiki' });

    const agentEndHandler = pi.handlers['agent_end'];
    await agentEndHandler();

    expect(pi.messages.length).toBe(0);
  });

  it('stops watcher on session_shutdown', async () => {
    const { makeKnowledgeExtension } = await import('../../extensions/knowledge-manager.js');

    const config = {
      knowledge: {
        enabled: true,
        embeddingModel: 'nomic-ai/nomic-embed-text-v1.5',
        dimensions: 768,
        chunkSize: 512,
        chunkOverlap: 64,
        wiki: { enabled: false, lint: { schedule: '0 9 * * 1' } },
      },
    };
    const pi = makeMockPi(config, db);
    makeKnowledgeExtension(pi as any, { rawDir, wikiDir: '/tmp/wiki' });

    const shutdownHandler = pi.handlers['session_shutdown'];
    expect(shutdownHandler).toBeDefined();

    // Should not throw
    await expect(shutdownHandler()).resolves.not.toThrow();

    // After shutdown, writing a file should not appear in pending
    const { writeFileSync } = await import('fs');
    writeFileSync(join(rawDir, 'owner', 'post-shutdown.md'), '# Post', 'utf-8');
    await new Promise((res) => setTimeout(res, 500));

    // Can't directly access watcher — but no messages should come from agent_end either
    const agentEndHandler = pi.handlers['agent_end'];
    await agentEndHandler();
    expect(pi.messages.length).toBe(0);
  });
});

describe('knowledge-manager extension — wiki tools', () => {
  let db: Database.Database;
  let wikiDir: string;

  beforeEach(() => {
    db = makeDb();
    wikiDir = join(tmpdir(), `wiki-tools-test-${Date.now()}`);
    mkdirSync(join(wikiDir, 'comparisons'), { recursive: true });
    mkdirSync(join(wikiDir, 'concepts'), { recursive: true });
    mkdirSync(join(wikiDir, 'sources'), { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    db.close();
    try { rmSync(wikiDir, { recursive: true, force: true }); } catch {}
  });

  it('knowledge_file creates wiki page and inserts wiki_pages row', async () => {
    const { makeKnowledgeExtension } = await import('../../extensions/knowledge-manager.js');

    const config = {
      knowledge: {
        enabled: true,
        embeddingModel: 'nomic-ai/nomic-embed-text-v1.5',
        dimensions: 768,
        chunkSize: 512,
        chunkOverlap: 64,
        wiki: { enabled: true, lint: { schedule: '0 9 * * 1' } },
      },
    };
    const pi = makeMockPi(config, db);
    makeKnowledgeExtension(pi as any, { rawDir: '/tmp/raw', wikiDir });

    const fileHandler = pi.tools.get('knowledge_file')!;
    await fileHandler('call-id', {
      content: '# Test comparison\n\nSome analysis.',
      filename: 'moe-routing.md',
      pageType: 'comparison',
    });

    // File should exist at wiki/comparisons/moe-routing.md
    const expectedPath = join(wikiDir, 'comparisons', 'moe-routing.md');
    expect(existsSync(expectedPath)).toBe(true);

    // wiki_pages row should exist
    const row = db
      .prepare("SELECT * FROM wiki_pages WHERE path = ?")
      .get(expectedPath) as Record<string, unknown> | undefined;

    expect(row).toBeDefined();
    expect(row!.source_tier).toBe('wiki-synthesis');
    expect(row!.confidence).toBe('low');  // default when not supplied
    expect(row!.page_type).toBe('comparison');
  });

  it('knowledge_file respects explicit confidence param', async () => {
    const { makeKnowledgeExtension } = await import('../../extensions/knowledge-manager.js');

    const config = {
      knowledge: {
        enabled: true,
        embeddingModel: 'nomic-ai/nomic-embed-text-v1.5',
        dimensions: 768,
        chunkSize: 512,
        chunkOverlap: 64,
        wiki: { enabled: true, lint: { schedule: '0 9 * * 1' } },
      },
    };
    const pi = makeMockPi(config, db);
    makeKnowledgeExtension(pi as any, { rawDir: '/tmp/raw', wikiDir });

    const fileHandler = pi.tools.get('knowledge_file')!;
    await fileHandler('call-id', {
      content: '# High-quality synthesis\n\nWell-sourced analysis.',
      filename: 'high-quality.md',
      pageType: 'concept',
      confidence: 'high',
    });

    const expectedPath = join(wikiDir, 'concepts', 'high-quality.md');
    const row = db
      .prepare('SELECT * FROM wiki_pages WHERE path = ?')
      .get(expectedPath) as Record<string, unknown> | undefined;

    expect(row).toBeDefined();
    expect(row!.source_tier).toBe('wiki-synthesis');  // always wiki-synthesis regardless
    expect(row!.confidence).toBe('high');              // explicit value honoured
  });

  it('knowledge_lint returns a structured report with required fields', async () => {
    const { makeKnowledgeExtension } = await import('../../extensions/knowledge-manager.js');

    const config = {
      knowledge: {
        enabled: true,
        embeddingModel: 'nomic-ai/nomic-embed-text-v1.5',
        dimensions: 768,
        chunkSize: 512,
        chunkOverlap: 64,
        wiki: { enabled: true, lint: { schedule: '0 9 * * 1' } },
      },
    };
    const pi = makeMockPi(config, db);
    makeKnowledgeExtension(pi as any, { rawDir: '/tmp/raw', wikiDir });

    const lintHandler = pi.tools.get('knowledge_lint')!;
    const result = await lintHandler('call-id', {});

    expect(result.content).toHaveLength(1);
    const text = result.content[0].text;
    expect(text).toContain('Lint Report');
    // Must include all required fields from spec
    expect(text).toContain('total_pages');
    expect(text).toContain('orphan_pages');              // orphan pages detection
    expect(text).toContain('missing_concept_pages');     // missing concept pages
    expect(text).toContain('stale_claims');              // stale claim detection
    expect(text).toContain('contradictions');            // contradiction detection
    expect(text).toContain('issues');                   // structured issue list
    expect(text).toContain('low_confidence_clusters');  // low-confidence cluster list
    expect(text).toContain('suggested_next_investigations'); // next steps
  });

  it('knowledge_lint populates low_confidence_clusters and suggested_next_investigations', async () => {
    const { makeKnowledgeExtension } = await import('../../extensions/knowledge-manager.js');
    const { writeFileSync: wfs } = await import('fs');
    const { join: pjoin } = await import('path');

    const config = {
      knowledge: {
        enabled: true,
        embeddingModel: 'nomic-ai/nomic-embed-text-v1.5',
        dimensions: 768,
        chunkSize: 512,
        chunkOverlap: 64,
        wiki: { enabled: true, lint: { schedule: '0 9 * * 1' } },
      },
    };
    const pi = makeMockPi(config, db);
    makeKnowledgeExtension(pi as any, { rawDir: '/tmp/raw', wikiDir });

    // File two low-confidence pages
    const fileHandler = pi.tools.get('knowledge_file')!;
    await fileHandler('call-id', {
      content: '---\nconfidence: low\n---\n# Page A\nSome content.',
      filename: 'page-a.md',
      pageType: 'concept',
    });
    await fileHandler('call-id', {
      content: '---\nconfidence: low\n---\n# Page B\nMore content.',
      filename: 'page-b.md',
      pageType: 'concept',
    });

    const lintHandler = pi.tools.get('knowledge_lint')!;
    const result = await lintHandler('call-id', {});
    const text = result.content[0].text;
    const parsed = JSON.parse(text.match(/```json\n([\s\S]+?)\n```/)?.[1] ?? '{}');

    // low_confidence_clusters must be an array (not just a count)
    expect(Array.isArray(parsed.low_confidence_clusters)).toBe(true);
    expect(parsed.low_confidence_clusters.length).toBeGreaterThanOrEqual(2);
    expect(parsed.low_confidence_clusters.some((p: string) => p.includes('page-a') || p.includes('page-b'))).toBe(true);

    // suggested_next_investigations must be a non-empty array
    expect(Array.isArray(parsed.suggested_next_investigations)).toBe(true);
    expect(parsed.suggested_next_investigations.length).toBeGreaterThan(0);
  });

  it('knowledge_lint detects orphan pages (file on disk missing)', async () => {
    const { makeKnowledgeExtension } = await import('../../extensions/knowledge-manager.js');
    const { writeFileSync: wfs, unlinkSync } = await import('fs');

    const config = {
      knowledge: {
        enabled: true,
        embeddingModel: 'nomic-ai/nomic-embed-text-v1.5',
        dimensions: 768,
        chunkSize: 512,
        chunkOverlap: 64,
        wiki: { enabled: true, lint: { schedule: '0 9 * * 1' } },
      },
    };
    const pi = makeMockPi(config, db);
    makeKnowledgeExtension(pi as any, { rawDir: '/tmp/raw', wikiDir });

    // Create a wiki page then delete it from disk (leaving orphan db entry)
    const { join: pathJoin } = await import('path');
    const ghostPath = pathJoin(wikiDir, 'concepts', 'ghost.md');
    wfs(ghostPath, '# Ghost page', 'utf-8');

    // File the page via the tool (inserts into db)
    const fileHandler = pi.tools.get('knowledge_file')!;
    await fileHandler('call-id', {
      content: '# Ghost\n\nGhost page content.',
      filename: 'ghost.md',
      pageType: 'concept',
    });

    // Now delete the file to create an orphan
    unlinkSync(ghostPath);

    const lintHandler = pi.tools.get('knowledge_lint')!;
    const result = await lintHandler('call-id', {});
    const text = result.content[0].text;
    const parsed = JSON.parse(text.match(/```json\n([\s\S]+?)\n```/)?.[1] ?? '{}');
    expect(parsed.orphan_pages.some((p: string) => p === 'ghost.md' || (p && p.includes('ghost')))).toBe(true);
    expect(parsed.issues.some((i: string) => i.includes('ghost'))).toBe(true);
  });
});

describe('knowledge-manager extension — wiki system prompt injection', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    vi.clearAllMocks();
  });

  afterEach(() => db.close());

  it('injects wiki schema block into system prompt when wiki.enabled=true', async () => {
    const { makeKnowledgeExtension } = await import('../../extensions/knowledge-manager.js');
    const tmpWiki = join(tmpdir(), `wiki-prompt-${Date.now()}`);

    const config = {
      knowledge: {
        enabled: true,
        embeddingModel: 'nomic-ai/nomic-embed-text-v1.5',
        dimensions: 768,
        chunkSize: 512,
        chunkOverlap: 64,
        wiki: { enabled: true, lint: { schedule: '0 9 * * 1' } },
      },
    };
    const pi = makeMockPi(config, db);
    makeKnowledgeExtension(pi as any, { rawDir: '/tmp/raw', wikiDir: tmpWiki });

    const handler = pi.handlers['before_agent_start'];
    expect(handler).toBeDefined();

    const result = await handler({ systemPrompt: 'Base prompt.' });
    expect(result.systemPrompt).toContain('Knowledge Base Wiki');
    expect(result.systemPrompt).toContain('index.md');
    expect(result.systemPrompt).toContain('verify against primary sources');
    expect(result.systemPrompt).toContain('Base prompt.');
    // Citation rules must be present
    expect(result.systemPrompt).toContain('Citation Rules');
    expect(result.systemPrompt).toContain('source_tier');
    expect(result.systemPrompt).toContain('wiki-synthesis');
  });

  it('does NOT inject wiki block when wiki.enabled=false (but handler still registered for watcher close-while-processing)', async () => {
    const { makeKnowledgeExtension } = await import('../../extensions/knowledge-manager.js');

    const config = {
      knowledge: {
        enabled: true,
        embeddingModel: 'nomic-ai/nomic-embed-text-v1.5',
        dimensions: 768,
        chunkSize: 512,
        chunkOverlap: 64,
        wiki: { enabled: false, lint: { schedule: '0 9 * * 1' } },
      },
    };
    const pi = makeMockPi(config, db);
    makeKnowledgeExtension(pi as any, { rawDir: '/tmp/raw', wikiDir: '/tmp/wiki' });

    // before_agent_start is always registered (close-while-processing pattern for watcher)
    const handler = pi.handlers['before_agent_start'];
    expect(handler).toBeDefined();

    // But when wiki.enabled=false, firing the handler should NOT inject a wiki block
    const result = await handler({ systemPrompt: 'Base prompt.' });
    // Returns the event without adding wiki content
    expect(result.systemPrompt).not.toContain('Knowledge Base Wiki');
  });
});

describe('knowledge-manager extension — tool registration', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    vi.clearAllMocks();
  });

  afterEach(() => {
    db.close();
  });

  it('registers NO tools when knowledge.enabled=false', async () => {
    const { makeKnowledgeExtension } = await import('../../extensions/knowledge-manager.js');
    const config = {
      knowledge: { enabled: false, wiki: { enabled: false } },
    };
    const pi = makeMockPi(config, db);
    makeKnowledgeExtension(pi as any);

    expect(pi.tools.size).toBe(0);
  });

  it('registers knowledge_search and knowledge_ingest when enabled=true, wiki=false', async () => {
    const { makeKnowledgeExtension } = await import('../../extensions/knowledge-manager.js');
    const config = {
      knowledge: {
        enabled: true,
        embeddingModel: 'nomic-ai/nomic-embed-text-v1.5',
        dimensions: 768,
        chunkSize: 512,
        chunkOverlap: 64,
        wiki: { enabled: false, lint: { schedule: '0 9 * * 1' } },
      },
    };
    const pi = makeMockPi(config, db);
    makeKnowledgeExtension(pi as any, { rawDir: '/tmp/raw', wikiDir: '/tmp/wiki' });

    expect(pi.tools.has('knowledge_search')).toBe(true);
    expect(pi.tools.has('knowledge_ingest')).toBe(true);
    expect(pi.tools.has('knowledge_file')).toBe(false);
    expect(pi.tools.has('knowledge_lint')).toBe(false);
  });

  it('registers all four tools when enabled=true, wiki=true', async () => {
    const { makeKnowledgeExtension } = await import('../../extensions/knowledge-manager.js');
    const tmpWiki = join(tmpdir(), `wiki-test-${Date.now()}`);
    mkdirSync(join(tmpWiki, 'concepts'), { recursive: true });
    mkdirSync(join(tmpWiki, 'sources'), { recursive: true });
    mkdirSync(join(tmpWiki, 'comparisons'), { recursive: true });

    const config = {
      knowledge: {
        enabled: true,
        embeddingModel: 'nomic-ai/nomic-embed-text-v1.5',
        dimensions: 768,
        chunkSize: 512,
        chunkOverlap: 64,
        wiki: { enabled: true, lint: { schedule: '0 9 * * 1' } },
      },
    };
    const pi = makeMockPi(config, db);
    makeKnowledgeExtension(pi as any, { rawDir: '/tmp/raw', wikiDir: tmpWiki });

    expect(pi.tools.has('knowledge_search')).toBe(true);
    expect(pi.tools.has('knowledge_ingest')).toBe(true);
    expect(pi.tools.has('knowledge_file')).toBe(true);
    expect(pi.tools.has('knowledge_lint')).toBe(true);

    rmSync(tmpWiki, { recursive: true, force: true });
  });
});
