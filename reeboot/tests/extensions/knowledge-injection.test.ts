import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock the DB/index imports so we don't try to load sqlite-vec
vi.mock('../../src/db/index.js', () => ({
  loadVecExtension: vi.fn(),
  runKnowledgeMigration: vi.fn(),
}));

vi.mock('../../src/knowledge/embedder.js', () => ({
  embed: vi.fn().mockResolvedValue([]),
  embedOne: vi.fn().mockResolvedValue(new Float32Array(768).fill(0.1)),
  resetEmbedder: vi.fn(),
}));

vi.mock('../../src/knowledge/ingest.js', () => ({
  ingestDocument: vi.fn().mockResolvedValue({ docId: 'id1', chunkCount: 1, confidence: 'medium' }),
}));

vi.mock('../../src/knowledge/search.js', () => ({
  hybridSearch: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/knowledge/watcher.js', () => ({
  KnowledgeWatcher: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    getPendingFiles: vi.fn().mockReturnValue([]),
  })),
}));

describe('knowledge-manager dependency injection', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('makeKnowledgeExtension accepts (pi, config) with explicit args', async () => {
    // Import should succeed with new signature
    const { makeKnowledgeExtension, registerServerJobs } = await import(
      '../../src/extensions/knowledge-manager.js'
    );

    const registerToolSpy = vi.fn();
    const mockPi = {
      on: vi.fn(),
      registerTool: registerToolSpy,
    };

    // getConfig should exist on pi but we're NOT calling it
    (mockPi as any).getConfig = vi.fn().mockReturnValue({});

    // Call with explicit config — should never touch pi.getConfig
    makeKnowledgeExtension(mockPi as any, {
      knowledge: {
        enabled: true,
        embeddingModel: 'nomic-ai/nomic-embed-text-v1.5',
        dimensions: 768,
        chunkSize: 512,
        chunkOverlap: 64,
        wiki: { enabled: true, lint: { schedule: '0 9 * * 1' } },
      },
    });

    // Should have registered knowledge_search and knowledge_ingest
    const toolNames = registerToolSpy.mock.calls.map((c: any) => c[0].name);
    expect(toolNames).toContain('knowledge_search');
    expect(toolNames).toContain('knowledge_ingest');
    // With wiki enabled, should also register knowledge_file and knowledge_lint
    expect(toolNames).toContain('knowledge_file');
    expect(toolNames).toContain('knowledge_lint');

    // pi.getConfig should NOT have been called
    expect((mockPi as any).getConfig).not.toHaveBeenCalled();
  });

  it('returns early when knowledge.enabled is false', async () => {
    const { makeKnowledgeExtension } = await import(
      '../../src/extensions/knowledge-manager.js'
    );

    const registerToolSpy = vi.fn();
    const mockPi = {
      on: vi.fn(),
      registerTool: registerToolSpy,
    };

    makeKnowledgeExtension(mockPi as any, {
      knowledge: { enabled: false },
    });

    // No tools should be registered
    expect(registerToolSpy).not.toHaveBeenCalled();
  });

  it('does not call phantom pi.getDb() or pi.getScheduler()', async () => {
    const { makeKnowledgeExtension } = await import(
      '../../src/extensions/knowledge-manager.js'
    );

    const registerToolSpy = vi.fn();
    const mockPi = {
      on: vi.fn(),
      registerTool: registerToolSpy,
    };

    (mockPi as any).getDb = vi.fn();
    (mockPi as any).getScheduler = vi.fn();
    (mockPi as any).getConfig = vi.fn().mockReturnValue({});

    makeKnowledgeExtension(mockPi as any, {
      knowledge: {
        enabled: true,
        wiki: { enabled: true, lint: { schedule: '0 9 * * 1' } },
      },
    });

    // None of the phantom methods should have been called
    expect((mockPi as any).getConfig).not.toHaveBeenCalled();
    expect((mockPi as any).getDb).not.toHaveBeenCalled();
    expect((mockPi as any).getScheduler).not.toHaveBeenCalled();
  });
});