import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock probe-searxng and docker at module level
vi.mock('@src/wizard/probe-searxng.js', () => ({
  probeSearXNG: vi.fn(),
}));

vi.mock('@src/utils/docker.js', () => ({
  checkDockerStatus: vi.fn().mockResolvedValue('running'),
}));

vi.mock('child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0 }),
}));

function makePrompter(overrides: Record<string, any> = {}) {
  return {
    select: vi.fn(),
    input: vi.fn(),
    password: vi.fn(),
    confirm: vi.fn(),
    ...overrides,
  };
}

describe('runSearXNGSubflow (probe + URL confirmation)', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('pre-fills URL input with detected URL when probe finds SearXNG', async () => {
    const { probeSearXNG } = await import('@src/wizard/probe-searxng.js');
    vi.mocked(probeSearXNG).mockResolvedValue('http://localhost:8080');

    const prompter = makePrompter({
      input: vi.fn().mockResolvedValue('http://localhost:8080'),
      select: vi.fn().mockResolvedValue('use-url'),
    });

    const { runWebSearchStep } = await import('@src/wizard/steps/web-search.js');
    // Select searxng provider
    prompter.select
      .mockResolvedValueOnce('searxng')  // provider selection
      .mockResolvedValueOnce('use-url'); // use URL directly

    const result = await runWebSearchStep({ prompter: prompter as any });

    // input should have been called with default value = detected URL
    expect(prompter.input).toHaveBeenCalledWith(expect.objectContaining({
      default: 'http://localhost:8080',
    }));
    expect(result.provider).toBe('searxng');
    expect(result.searxngBaseUrl).toBe('http://localhost:8080');
  });

  it('pre-fills URL with http://localhost:8888 when probe finds nothing', async () => {
    const { probeSearXNG } = await import('@src/wizard/probe-searxng.js');
    vi.mocked(probeSearXNG).mockResolvedValue(null);

    const prompter = makePrompter({
      input: vi.fn().mockResolvedValue('http://localhost:8888'),
      select: vi.fn()
        .mockResolvedValueOnce('searxng')
        .mockResolvedValueOnce('use-url'),
    });

    const { runWebSearchStep } = await import('@src/wizard/steps/web-search.js');
    const result = await runWebSearchStep({ prompter: prompter as any });

    expect(prompter.input).toHaveBeenCalledWith(expect.objectContaining({
      default: 'http://localhost:8888',
    }));
    expect(result.searxngBaseUrl).toBe('http://localhost:8888');
  });

  it('uses user-edited URL when user changes the pre-filled value', async () => {
    const { probeSearXNG } = await import('@src/wizard/probe-searxng.js');
    vi.mocked(probeSearXNG).mockResolvedValue('http://localhost:8080');

    const prompter = makePrompter({
      input: vi.fn().mockResolvedValue('http://localhost:7777'),
      select: vi.fn()
        .mockResolvedValueOnce('searxng')
        .mockResolvedValueOnce('use-url'),
    });

    const { runWebSearchStep } = await import('@src/wizard/steps/web-search.js');
    const result = await runWebSearchStep({ prompter: prompter as any });

    expect(result.searxngBaseUrl).toBe('http://localhost:7777');
  });

  it('starts new container and returns port 8888 when user chooses start-new', async () => {
    const { probeSearXNG } = await import('@src/wizard/probe-searxng.js');
    vi.mocked(probeSearXNG).mockResolvedValue(null);

    const { spawnSync } = await import('child_process');

    const prompter = makePrompter({
      input: vi.fn().mockResolvedValue('http://localhost:8888'),
      select: vi.fn()
        .mockResolvedValueOnce('searxng')
        .mockResolvedValueOnce('start-new'),
    });

    const { runWebSearchStep } = await import('@src/wizard/steps/web-search.js');
    const result = await runWebSearchStep({ prompter: prompter as any });

    // docker run should have been called
    expect(spawnSync).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['run', '-d', '--name', 'reeboot-searxng']),
      expect.any(Object)
    );
    expect(result.provider).toBe('searxng');
    expect(result.searxngBaseUrl).toBe('http://localhost:8888');
  });
});
