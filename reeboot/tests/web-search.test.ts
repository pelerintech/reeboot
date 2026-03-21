/**
 * Web Search Extension Tests (TDD — written before implementation)
 *
 * Covers:
 *   1.2  fetch_url tool
 *   1.3  DDG backend
 *   1.4  Brave backend
 *   1.5  Tavily backend
 *   1.6  Serper backend
 *   1.7  Exa backend
 *   1.8  SearXNG backend + fallback
 *   1.9  web_search tool registration + API key handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFetchOk(body: string, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
  });
}

function makeFetchJson(data: unknown, status = 200) {
  const body = JSON.stringify(data);
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => data,
  });
}

function makeFetchError(message: string) {
  const err = new Error(message);
  return vi.fn().mockRejectedValue(err);
}

// ─── 1.2 fetch_url Tests ─────────────────────────────────────────────────────

describe('1.2 fetchAndExtract (fetch_url backing function)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('extracts readable article text from HTML', async () => {
    const articleHtml = `<!DOCTYPE html>
<html><head><title>Test Article</title></head>
<body>
  <nav>Navigation junk that should be stripped</nav>
  <article>
    <h1>Main Article Title</h1>
    <p>This is the main article content that Readability should extract. It contains enough text to be identified as the main content of the page.</p>
    <p>Second paragraph with more article content to ensure Readability picks this up.</p>
  </article>
  <footer>Footer junk</footer>
</body></html>`;

    vi.stubGlobal('fetch', makeFetchOk(articleHtml));

    const { fetchAndExtract } = await import('../extensions/web-search.js');
    const result = await fetchAndExtract('https://example.com/article');

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    // Should contain article content
    expect(result).toContain('article content');
    // Should NOT contain raw HTML tags
    expect(result).not.toContain('<article>');
    expect(result).not.toContain('<p>');
  });

  it('falls back to stripped text for non-article page', async () => {
    // A page that Readability can't parse as an article (e.g., a pure app shell)
    const appHtml = `<!DOCTYPE html>
<html><head><title>My App</title></head>
<body>
  <div id="app">Loading...</div>
  <span>Some minimal text on the page</span>
</body></html>`;

    vi.stubGlobal('fetch', makeFetchOk(appHtml));

    const { fetchAndExtract } = await import('../extensions/web-search.js');
    const result = await fetchAndExtract('https://example.com/app');

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    // Should not contain raw HTML tags
    expect(result).not.toContain('<div');
    expect(result).not.toContain('<span');
  });

  it('returns error string on HTTP 404', async () => {
    vi.stubGlobal('fetch', makeFetchOk('Not Found', 404));

    const { fetchAndExtract } = await import('../extensions/web-search.js');
    const result = await fetchAndExtract('https://example.com/notfound');

    expect(result).toContain('404');
    expect(result.toLowerCase()).toContain('error');
  });

  it('returns error string on network failure (no unhandled exception)', async () => {
    vi.stubGlobal('fetch', makeFetchError('ECONNREFUSED'));

    const { fetchAndExtract } = await import('../extensions/web-search.js');
    const result = await fetchAndExtract('https://example.com/fail');

    expect(typeof result).toBe('string');
    expect(result.toLowerCase()).toContain('error');
    expect(result).toContain('ECONNREFUSED');
  });

  it('sends User-Agent header with request', async () => {
    const mockFetch = makeFetchOk('<html><body><p>Hello world</p></body></html>');
    vi.stubGlobal('fetch', mockFetch);

    const { fetchAndExtract } = await import('../extensions/web-search.js');
    await fetchAndExtract('https://example.com/page');

    expect(mockFetch).toHaveBeenCalled();
    const callArgs = mockFetch.mock.calls[0];
    // Second arg is the options object with headers
    const options = callArgs[1] as RequestInit;
    const headers = options?.headers as Record<string, string>;
    expect(headers).toBeDefined();
    const userAgent = headers['User-Agent'] ?? headers['user-agent'];
    expect(userAgent).toBeTruthy();
    expect(userAgent).toContain('Mozilla');
  });
});

// ─── 1.3 DDG Backend Tests ───────────────────────────────────────────────────

describe('1.3 searchDuckDuckGo', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses 5 results from DDG HTML fixture', async () => {
    const fixtureHtml = readFileSync(
      join(__dirname, 'fixtures', 'ddg-response.html'),
      'utf-8'
    );
    vi.stubGlobal('fetch', makeFetchOk(fixtureHtml));

    const { searchDuckDuckGo } = await import('../extensions/web-search.js');
    const results = await searchDuckDuckGo('TypeScript', 5);

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(5);
    results.forEach((r) => {
      expect(typeof r.title).toBe('string');
      expect(typeof r.url).toBe('string');
      expect(typeof r.snippet).toBe('string');
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.url.length).toBeGreaterThan(0);
    });
  });

  it('decodes DDG redirect URLs (uddg= param extracted)', async () => {
    const fixtureHtml = readFileSync(
      join(__dirname, 'fixtures', 'ddg-response.html'),
      'utf-8'
    );
    vi.stubGlobal('fetch', makeFetchOk(fixtureHtml));

    const { searchDuckDuckGo } = await import('../extensions/web-search.js');
    const results = await searchDuckDuckGo('TypeScript', 5);

    // URLs should be decoded real URLs, not DDG redirect URLs
    results.forEach((r) => {
      expect(r.url).not.toContain('duckduckgo.com/l/?');
      expect(r.url).not.toContain('uddg=');
      // Should be actual URLs
      expect(r.url).toMatch(/^https?:\/\//);
    });
  });

  it('returns empty array when HTML has no DDG result structure', async () => {
    vi.stubGlobal('fetch', makeFetchOk('<html><body><p>No results here</p></body></html>'));

    const { searchDuckDuckGo } = await import('../extensions/web-search.js');
    const results = await searchDuckDuckGo('noresults', 5);

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });

  it('does not require an API key (no auth headers sent)', async () => {
    const mockFetch = makeFetchOk('<html><body></body></html>');
    vi.stubGlobal('fetch', mockFetch);

    const { searchDuckDuckGo } = await import('../extensions/web-search.js');
    await searchDuckDuckGo('test', 5);

    expect(mockFetch).toHaveBeenCalled();
    const callArgs = mockFetch.mock.calls[0];
    const options = callArgs[1] as RequestInit | undefined;
    const headers = (options?.headers ?? {}) as Record<string, string>;
    // No authorization header
    const authKey = Object.keys(headers).find(k =>
      k.toLowerCase() === 'authorization' ||
      k.toLowerCase() === 'x-api-key' ||
      k.toLowerCase() === 'x-subscription-token'
    );
    expect(authKey).toBeUndefined();
  });
});

// ─── 1.4 Brave Backend Tests ─────────────────────────────────────────────────

describe('1.4 searchBrave', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns 3 results with snippet from description field', async () => {
    const braveResponse = {
      web: {
        results: [
          { title: 'Result 1', url: 'https://example.com/1', description: 'Snippet one' },
          { title: 'Result 2', url: 'https://example.com/2', description: 'Snippet two' },
          { title: 'Result 3', url: 'https://example.com/3', description: 'Snippet three' },
        ],
      },
    };
    vi.stubGlobal('fetch', makeFetchJson(braveResponse));

    const { searchBrave } = await import('../extensions/web-search.js');
    const results = await searchBrave('test query', 'test-api-key', 3);

    expect(results.length).toBe(3);
    expect(results[0].title).toBe('Result 1');
    expect(results[0].url).toBe('https://example.com/1');
    expect(results[0].snippet).toBe('Snippet one');
    expect(results[1].snippet).toBe('Snippet two');
  });

  it('returns empty array on 401 and logs warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', makeFetchJson({ error: 'Unauthorized' }, 401));

    const { searchBrave } = await import('../extensions/web-search.js');
    const results = await searchBrave('test query', 'bad-key', 3);

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

// ─── 1.5 Tavily Backend Tests ────────────────────────────────────────────────

describe('1.5 searchTavily', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns 5 results with snippet from content field', async () => {
    const tavilyResponse = {
      results: [
        { title: 'T1', url: 'https://t.com/1', content: 'Content one' },
        { title: 'T2', url: 'https://t.com/2', content: 'Content two' },
        { title: 'T3', url: 'https://t.com/3', content: 'Content three' },
        { title: 'T4', url: 'https://t.com/4', content: 'Content four' },
        { title: 'T5', url: 'https://t.com/5', content: 'Content five' },
      ],
    };
    vi.stubGlobal('fetch', makeFetchJson(tavilyResponse));

    const { searchTavily } = await import('../extensions/web-search.js');
    const results = await searchTavily('test query', 'tavily-key', 5);

    expect(results.length).toBe(5);
    expect(results[0].snippet).toBe('Content one');
    expect(results[4].snippet).toBe('Content five');
  });
});

// ─── 1.6 Serper Backend Tests ────────────────────────────────────────────────

describe('1.6 searchSerper', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns results with url from link field', async () => {
    const serperResponse = {
      organic: [
        { title: 'S1', link: 'https://s.com/1', snippet: 'Snippet 1' },
        { title: 'S2', link: 'https://s.com/2', snippet: 'Snippet 2' },
      ],
    };
    vi.stubGlobal('fetch', makeFetchJson(serperResponse));

    const { searchSerper } = await import('../extensions/web-search.js');
    const results = await searchSerper('test query', 'serper-key', 5);

    expect(results.length).toBe(2);
    expect(results[0].url).toBe('https://s.com/1');
    expect(results[1].url).toBe('https://s.com/2');
    expect(results[0].snippet).toBe('Snippet 1');
  });
});

// ─── 1.7 Exa Backend Tests ───────────────────────────────────────────────────

describe('1.7 searchExa', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns results with snippet truncated to 200 chars', async () => {
    const longText = 'A'.repeat(300);
    const exaResponse = {
      results: [
        { title: 'E1', url: 'https://e.com/1', text: longText },
        { title: 'E2', url: 'https://e.com/2', text: 'Short text' },
      ],
    };
    vi.stubGlobal('fetch', makeFetchJson(exaResponse));

    const { searchExa } = await import('../extensions/web-search.js');
    const results = await searchExa('test query', 'exa-key', 5);

    expect(results.length).toBe(2);
    expect(results[0].snippet.length).toBeLessThanOrEqual(200);
    expect(results[1].snippet).toBe('Short text');
  });
});

// ─── 1.8 SearXNG Backend Tests ───────────────────────────────────────────────

describe('1.8 searchSearXNG + fallback', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns results mapped from content to snippet', async () => {
    const searxngResponse = {
      results: [
        { title: 'SX1', url: 'https://sx.com/1', content: 'Content 1' },
        { title: 'SX2', url: 'https://sx.com/2', content: 'Content 2' },
      ],
    };
    vi.stubGlobal('fetch', makeFetchJson(searxngResponse));

    const { searchSearXNG } = await import('../extensions/web-search.js');
    const results = await searchSearXNG('test query', 'http://localhost:8080', 5);

    expect(results.length).toBe(2);
    expect(results[0].snippet).toBe('Content 1');
    expect(results[1].snippet).toBe('Content 2');
  });

  it('falls back to DDG when SearXNG health-check throws ECONNREFUSED', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // First call (health-check) fails, subsequent calls (DDG) return empty HTML
    const ddgHtml = `<!DOCTYPE html><html><body></body></html>`;
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      callCount++;
      if (callCount === 1) {
        // Health-check to SearXNG
        throw new Error('ECONNREFUSED');
      }
      // DDG call
      return {
        ok: true,
        status: 200,
        text: async () => ddgHtml,
        json: async () => ({}),
      };
    });
    vi.stubGlobal('fetch', mockFetch);

    // Import fresh module - we test the health-check behavior indirectly
    // by calling resolvedProvider after health check
    const { checkSearXNGHealth } = await import('../extensions/web-search.js');
    const resolvedProvider = await checkSearXNGHealth('http://localhost:8080');

    expect(resolvedProvider).toBe('duckduckgo');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('SearXNG')
    );

    warnSpy.mockRestore();
  });

  it('uses SearXNG when health-check succeeds', async () => {
    vi.stubGlobal('fetch', makeFetchJson({ results: [] }));

    const { checkSearXNGHealth } = await import('../extensions/web-search.js');
    const resolvedProvider = await checkSearXNGHealth('http://localhost:8080');

    expect(resolvedProvider).toBe('searxng');
  });
});

// ─── 1.9 web_search Tool Registration Tests ──────────────────────────────────

describe('1.9 web_search tool registration and API key handling', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    // Clean up env vars
    delete process.env.BRAVE_API_KEY;
    delete process.env.TAVILY_API_KEY;
    delete process.env.SERPER_API_KEY;
    delete process.env.EXA_API_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.BRAVE_API_KEY;
    delete process.env.TAVILY_API_KEY;
    delete process.env.SERPER_API_KEY;
    delete process.env.EXA_API_KEY;
  });

  // ── resolveApiKey tests ───────────────────────────────────────────────────

  it('resolveApiKey: returns config.apiKey when set', async () => {
    const { resolveApiKey } = await import('../extensions/web-search.js');
    const key = resolveApiKey({ provider: 'brave', apiKey: 'mykey' } as any);
    expect(key).toBe('mykey');
  });

  it('resolveApiKey: falls back to BRAVE_API_KEY env var', async () => {
    process.env.BRAVE_API_KEY = 'envkey';
    const { resolveApiKey } = await import('../extensions/web-search.js');
    const key = resolveApiKey({ provider: 'brave' } as any);
    expect(key).toBe('envkey');
  });

  it('resolveApiKey: falls back to TAVILY_API_KEY env var', async () => {
    process.env.TAVILY_API_KEY = 'tavily-env';
    const { resolveApiKey } = await import('../extensions/web-search.js');
    const key = resolveApiKey({ provider: 'tavily' } as any);
    expect(key).toBe('tavily-env');
  });

  it('resolveApiKey: returns undefined for DDG (no key needed)', async () => {
    const { resolveApiKey } = await import('../extensions/web-search.js');
    const key = resolveApiKey({ provider: 'duckduckgo' } as any);
    expect(key).toBeUndefined();
  });

  it('resolveApiKey: returns undefined when no config key and no env var', async () => {
    const { resolveApiKey } = await import('../extensions/web-search.js');
    const key = resolveApiKey({ provider: 'brave' } as any);
    expect(key).toBeUndefined();
  });

  // ── tool registration tests ───────────────────────────────────────────────

  it('web_search registered when provider is duckduckgo', async () => {
    const registeredTools: string[] = [];
    const mockPi = {
      registerTool: vi.fn((opts: { name: string }) => {
        registeredTools.push(opts.name);
      }),
      getConfig: vi.fn().mockReturnValue({
        search: { provider: 'duckduckgo' },
      }),
    };

    const mod = await import('../extensions/web-search.js');
    await mod.default(mockPi as any);

    expect(registeredTools).toContain('fetch_url');
    expect(registeredTools).toContain('web_search');
  });

  it('web_search NOT registered when provider is none', async () => {
    const registeredTools: string[] = [];
    const mockPi = {
      registerTool: vi.fn((opts: { name: string }) => {
        registeredTools.push(opts.name);
      }),
      getConfig: vi.fn().mockReturnValue({
        search: { provider: 'none' },
      }),
    };

    const mod = await import('../extensions/web-search.js');
    await mod.default(mockPi as any);

    expect(registeredTools).toContain('fetch_url');
    expect(registeredTools).not.toContain('web_search');
  });

  it('web_search NOT registered when search config absent', async () => {
    const registeredTools: string[] = [];
    const mockPi = {
      registerTool: vi.fn((opts: { name: string }) => {
        registeredTools.push(opts.name);
      }),
      getConfig: vi.fn().mockReturnValue({}),
    };

    const mod = await import('../extensions/web-search.js');
    await mod.default(mockPi as any);

    expect(registeredTools).toContain('fetch_url');
    expect(registeredTools).not.toContain('web_search');
  });

  it('web_search: no-key warning + empty array for Brave with no key', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn());

    const registeredTools: Map<string, Function> = new Map();
    const mockPi = {
      registerTool: vi.fn((opts: { name: string; execute: Function }) => {
        registeredTools.set(opts.name, opts.execute);
      }),
      getConfig: vi.fn().mockReturnValue({
        search: { provider: 'brave' },
      }),
    };

    const mod = await import('../extensions/web-search.js');
    await mod.default(mockPi as any);

    const webSearch = registeredTools.get('web_search');
    expect(webSearch).toBeDefined();

    const result = await webSearch!('call-id', { query: 'test', limit: 5 });
    // Should return JSON stringified empty array or result with empty array
    const text = result?.content?.[0]?.text ?? result;
    const parsed = JSON.parse(typeof text === 'string' ? text : JSON.stringify(text));
    const arr = Array.isArray(parsed) ? parsed : (parsed.results ?? []);
    expect(arr.length).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('brave'));

    warnSpy.mockRestore();
  });

  it('web_search: limit respected (at most N results)', async () => {
    const fixtureHtml = readFileSync(
      join(__dirname, 'fixtures', 'ddg-response.html'),
      'utf-8'
    );
    vi.stubGlobal('fetch', makeFetchOk(fixtureHtml));

    const registeredTools: Map<string, Function> = new Map();
    const mockPi = {
      registerTool: vi.fn((opts: { name: string; execute: Function }) => {
        registeredTools.set(opts.name, opts.execute);
      }),
      getConfig: vi.fn().mockReturnValue({
        search: { provider: 'duckduckgo' },
      }),
    };

    const mod = await import('../extensions/web-search.js');
    await mod.default(mockPi as any);

    const webSearch = registeredTools.get('web_search');
    const result = await webSearch!('call-id', { query: 'TypeScript', limit: 2 });
    const text = result?.content?.[0]?.text ?? result;
    const parsed = JSON.parse(typeof text === 'string' ? text : JSON.stringify(text));
    const arr = Array.isArray(parsed) ? parsed : (parsed.results ?? []);
    expect(arr.length).toBeLessThanOrEqual(2);
  });

  it('web_search: backend error returns empty array (no throw)', async () => {
    vi.stubGlobal('fetch', makeFetchError('Network failure'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const registeredTools: Map<string, Function> = new Map();
    const mockPi = {
      registerTool: vi.fn((opts: { name: string; execute: Function }) => {
        registeredTools.set(opts.name, opts.execute);
      }),
      getConfig: vi.fn().mockReturnValue({
        search: { provider: 'duckduckgo' },
      }),
    };

    const mod = await import('../extensions/web-search.js');
    await mod.default(mockPi as any);

    const webSearch = registeredTools.get('web_search');
    let threw = false;
    let result: any;
    try {
      result = await webSearch!('call-id', { query: 'test', limit: 5 });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    const text = result?.content?.[0]?.text ?? result;
    const parsed = JSON.parse(typeof text === 'string' ? text : JSON.stringify(text));
    const arr = Array.isArray(parsed) ? parsed : (parsed.results ?? []);
    expect(arr.length).toBe(0);

    warnSpy.mockRestore();
  });
});
