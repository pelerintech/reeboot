import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @huggingface/transformers before any module imports
vi.mock('@huggingface/transformers', () => {
  const mockExtractor = vi.fn().mockImplementation(async (texts: string[]) => {
    // Return a mock tensor-like object with tolist()
    const dim = 768;
    return {
      tolist: () => texts.map(() => Array(dim).fill(0.1)),
    };
  });

  return {
    pipeline: vi.fn().mockResolvedValue(mockExtractor),
    env: { cacheDir: '/tmp/hf-cache' },
  };
});

describe('embedder', () => {
  beforeEach(async () => {
    // Reset singleton between tests
    const { resetEmbedder } = await import('../../src/knowledge/embedder.js');
    resetEmbedder();
    vi.clearAllMocks();
  });

  it('prepends "search_document: " prefix when embedding corpus chunks', async () => {
    const { pipeline } = await import('@huggingface/transformers');
    const mockExtractor = vi.fn().mockResolvedValue({
      tolist: () => [Array(768).fill(0.1)],
    });
    (pipeline as ReturnType<typeof vi.fn>).mockResolvedValue(mockExtractor);

    const { embed, resetEmbedder } = await import('../../src/knowledge/embedder.js');
    resetEmbedder();

    await embed(['hello world'], 'search_document');

    expect(mockExtractor).toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringContaining('search_document: hello world')]),
      expect.anything()
    );
  });

  it('prepends "search_query: " prefix when embedding a user query', async () => {
    const { pipeline } = await import('@huggingface/transformers');
    const mockExtractor = vi.fn().mockResolvedValue({
      tolist: () => [Array(768).fill(0.2)],
    });
    (pipeline as ReturnType<typeof vi.fn>).mockResolvedValue(mockExtractor);

    const { embedOne, resetEmbedder } = await import('../../src/knowledge/embedder.js');
    resetEmbedder();

    await embedOne('my query', 'search_query');

    expect(mockExtractor).toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringContaining('search_query: my query')]),
      expect.anything()
    );
  });

  it('returns Float32Array[] with correct length from embed()', async () => {
    const { pipeline } = await import('@huggingface/transformers');
    const mockExtractor = vi.fn().mockResolvedValue({
      tolist: () => [Array(768).fill(0.1), Array(768).fill(0.2)],
    });
    (pipeline as ReturnType<typeof vi.fn>).mockResolvedValue(mockExtractor);

    const { embed, resetEmbedder } = await import('../../src/knowledge/embedder.js');
    resetEmbedder();

    const result = await embed(['text one', 'text two'], 'search_document');

    expect(result).toHaveLength(2);
    expect(result[0]).toBeInstanceOf(Float32Array);
    expect(result[0].length).toBe(768);
  });

  it('is a singleton — pipeline not reinitialised on second call', async () => {
    const { pipeline } = await import('@huggingface/transformers');
    const mockExtractor = vi.fn().mockResolvedValue({
      tolist: () => [Array(768).fill(0.1)],
    });
    (pipeline as ReturnType<typeof vi.fn>).mockResolvedValue(mockExtractor);

    const { embedOne, resetEmbedder } = await import('../../src/knowledge/embedder.js');
    resetEmbedder();

    await embedOne('first call', 'search_query');
    await embedOne('second call', 'search_query');

    // pipeline() constructor should only be called once (singleton)
    expect(pipeline).toHaveBeenCalledTimes(1);
  });
});
