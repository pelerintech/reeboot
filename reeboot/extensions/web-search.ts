/**
 * Web Search Extension
 *
 * Registers two pi tools:
 *   - fetch_url   (always registered, regardless of provider)
 *   - web_search  (registered when config.search.provider ≠ "none")
 *
 * Supports 6 search backends: DuckDuckGo (zero-config), Brave, Tavily,
 * Serper, Exa (all API-key), SearXNG (self-hosted Docker).
 *
 * API key resolution: config.search.apiKey → env var fallback.
 * SearXNG: health-checks on load; falls back to DDG if unreachable.
 */

import { Type } from '@sinclair/typebox';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { createRequire } from 'module';
import { parseHTML } from 'linkedom';

// CJS require for @mozilla/readability (it's a CommonJS module)
const _require = createRequire(import.meta.url);
const { Readability } = _require('@mozilla/readability');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchConfig {
  provider?: string;
  apiKey?: string;
  searxngBaseUrl?: string;
}

// ─── stripTags ────────────────────────────────────────────────────────────────

function stripTags(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ─── fetchAndExtract ─────────────────────────────────────────────────────────

export async function fetchAndExtract(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; Reeboot/1.0; +https://github.com/mariozechner/reeboot)',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error fetching URL: ${msg}`;
  }

  if (!res.ok) {
    return `Error fetching URL: HTTP ${res.status}`;
  }

  const html = await res.text();

  try {
    const { document } = parseHTML(html);
    const reader = new Readability(document);
    const article = reader.parse();
    if (article?.textContent?.trim()) {
      return article.textContent.trim();
    }
  } catch {
    // Readability failed — fall through to tag-stripping
  }

  return stripTags(html);
}

// ─── DDG Backend ─────────────────────────────────────────────────────────────

export async function searchDuckDuckGo(
  query: string,
  limit: number
): Promise<SearchResult[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html',
      },
    });
    const html = await res.text();
    const { document } = parseHTML(html);

    const anchors = document.querySelectorAll('a.result__a');
    const snippetEls = document.querySelectorAll('.result__snippet');

    if (!anchors || anchors.length === 0) return [];

    const results: SearchResult[] = [];
    const anchorArr = Array.from(anchors);
    const snippetArr = Array.from(snippetEls);

    for (let i = 0; i < Math.min(anchorArr.length, limit); i++) {
      const a = anchorArr[i] as any;
      const rawHref: string = a.getAttribute('href') ?? '';

      // Extract decoded URL from DDG redirect param
      let decodedUrl = rawHref;
      try {
        const u = new URL(rawHref, 'https://duckduckgo.com');
        const uddg = u.searchParams.get('uddg');
        if (uddg) decodedUrl = decodeURIComponent(uddg);
      } catch {
        // Leave as-is
      }

      const title = (a.textContent ?? '').trim();
      const snippet = snippetArr[i]
        ? ((snippetArr[i] as any).textContent ?? '').trim()
        : '';

      if (title && decodedUrl) {
        results.push({ title, url: decodedUrl, snippet });
      }
    }

    return results;
  } catch (err) {
    console.warn('[web-search] DDG backend error:', err);
    return [];
  }
}

// ─── Brave Backend ───────────────────────────────────────────────────────────

export async function searchBrave(
  query: string,
  apiKey: string,
  limit: number
): Promise<SearchResult[]> {
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`;
    const res = await fetch(url, {
      headers: {
        'X-Subscription-Token': apiKey,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      console.warn(`[web-search] Brave API error: HTTP ${res.status}`);
      return [];
    }

    const data = await res.json() as any;
    const webResults: any[] = data?.web?.results ?? [];

    return webResults.slice(0, limit).map((r: any) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.description ?? '',
    }));
  } catch (err) {
    console.warn('[web-search] Brave backend error:', err);
    return [];
  }
}

// ─── Tavily Backend ──────────────────────────────────────────────────────────

export async function searchTavily(
  query: string,
  apiKey: string,
  limit: number
): Promise<SearchResult[]> {
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, query, max_results: limit }),
    });

    if (!res.ok) {
      console.warn(`[web-search] Tavily API error: HTTP ${res.status}`);
      return [];
    }

    const data = await res.json() as any;
    const results: any[] = data?.results ?? [];

    return results.slice(0, limit).map((r: any) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.content ?? '',
    }));
  } catch (err) {
    console.warn('[web-search] Tavily backend error:', err);
    return [];
  }
}

// ─── Serper Backend ──────────────────────────────────────────────────────────

export async function searchSerper(
  query: string,
  apiKey: string,
  limit: number
): Promise<SearchResult[]> {
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: limit }),
    });

    if (!res.ok) {
      console.warn(`[web-search] Serper API error: HTTP ${res.status}`);
      return [];
    }

    const data = await res.json() as any;
    const organic: any[] = data?.organic ?? [];

    return organic.slice(0, limit).map((r: any) => ({
      title: r.title ?? '',
      url: r.link ?? '',
      snippet: r.snippet ?? '',
    }));
  } catch (err) {
    console.warn('[web-search] Serper backend error:', err);
    return [];
  }
}

// ─── Exa Backend ─────────────────────────────────────────────────────────────

export async function searchExa(
  query: string,
  apiKey: string,
  limit: number
): Promise<SearchResult[]> {
  try {
    const res = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, numResults: limit, useAutoprompt: true }),
    });

    if (!res.ok) {
      console.warn(`[web-search] Exa API error: HTTP ${res.status}`);
      return [];
    }

    const data = await res.json() as any;
    const results: any[] = data?.results ?? [];

    return results.slice(0, limit).map((r: any) => {
      const fullText: string = r.text ?? '';
      return {
        title: r.title ?? '',
        url: r.url ?? '',
        snippet: fullText.length > 200 ? fullText.slice(0, 200) : fullText,
      };
    });
  } catch (err) {
    console.warn('[web-search] Exa backend error:', err);
    return [];
  }
}

// ─── SearXNG Backend ─────────────────────────────────────────────────────────

export async function searchSearXNG(
  query: string,
  baseUrl: string,
  limit: number
): Promise<SearchResult[]> {
  try {
    const url = `${baseUrl}/search?q=${encodeURIComponent(query)}&format=json`;
    const res = await fetch(url);

    if (!res.ok) {
      console.warn(`[web-search] SearXNG API error: HTTP ${res.status}`);
      return [];
    }

    const data = await res.json() as any;
    const results: any[] = data?.results ?? [];

    return results.slice(0, limit).map((r: any) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.content ?? '',
    }));
  } catch (err) {
    console.warn('[web-search] SearXNG backend error:', err);
    return [];
  }
}

// ─── SearXNG Health Check ─────────────────────────────────────────────────────

export async function checkSearXNGHealth(baseUrl: string): Promise<string> {
  try {
    await fetch(`${baseUrl}/search?q=test&format=json`, {
      signal: AbortSignal.timeout(3000),
    });
    return 'searxng';
  } catch {
    console.warn(
      `[web-search] SearXNG unreachable at ${baseUrl}, falling back to DuckDuckGo`
    );
    return 'duckduckgo';
  }
}

// ─── resolveApiKey ────────────────────────────────────────────────────────────

export function resolveApiKey(config: SearchConfig): string | undefined {
  if (config.apiKey) return config.apiKey;

  const envVars: Record<string, string> = {
    brave: 'BRAVE_API_KEY',
    tavily: 'TAVILY_API_KEY',
    serper: 'SERPER_API_KEY',
    exa: 'EXA_API_KEY',
  };

  const varName = envVars[config.provider ?? ''];
  if (varName && process.env[varName]) {
    return process.env[varName];
  }

  return undefined;
}

// ─── searchBackend ────────────────────────────────────────────────────────────

export async function searchBackend(
  provider: string,
  config: SearchConfig,
  params: { query: string; limit: number }
): Promise<SearchResult[]> {
  const { query, limit } = params;

  if (!query.trim()) return [];

  if (provider === 'duckduckgo') {
    return searchDuckDuckGo(query, limit);
  }

  // API-key providers
  const needsKey = ['brave', 'tavily', 'serper', 'exa'];
  if (needsKey.includes(provider)) {
    const apiKey = resolveApiKey(config);
    if (!apiKey) {
      console.warn(
        `[web-search] No API key configured for ${provider} search`
      );
      return [];
    }

    if (provider === 'brave') return searchBrave(query, apiKey, limit);
    if (provider === 'tavily') return searchTavily(query, apiKey, limit);
    if (provider === 'serper') return searchSerper(query, apiKey, limit);
    if (provider === 'exa') return searchExa(query, apiKey, limit);
  }

  if (provider === 'searxng') {
    const baseUrl = config.searxngBaseUrl ?? 'http://localhost:8080';
    return searchSearXNG(query, baseUrl, limit);
  }

  console.warn(`[web-search] Unknown provider: ${provider}`);
  return [];
}

// ─── Extension Default Export ─────────────────────────────────────────────────

export default async function webSearchExtension(pi: ExtensionAPI, reebotConfig?: any): Promise<void> {
  const searchConfig: SearchConfig = reebotConfig?.search ?? {};
  const rawProvider: string = searchConfig.provider ?? 'none';

  // SearXNG startup health-check — fall back to DDG if unreachable
  let resolvedProvider = rawProvider;
  if (rawProvider === 'searxng') {
    const baseUrl = searchConfig.searxngBaseUrl ?? 'http://localhost:8080';
    resolvedProvider = await checkSearXNGHealth(baseUrl);
  }

  // ── Register fetch_url (always, regardless of provider) ───────────────────

  pi.registerTool({
    name: 'fetch_url',
    label: 'Fetch URL',
    description:
      'Fetch any URL and return the clean readable text content. Uses Readability to extract article text; falls back to HTML-stripped text for non-article pages.',
    parameters: Type.Object({
      url: Type.String({ description: 'The URL to fetch' }),
    }),
    execute: async (_id, params) => {
      const result = await fetchAndExtract(params.url);
      return {
        content: [{ type: 'text', text: result }],
      };
    },
  });

  // ── Register web_search (only when provider ≠ "none") ─────────────────────

  if (resolvedProvider === 'none' || resolvedProvider === '' || !resolvedProvider) {
    return;
  }

  // Capture resolved provider in closure for tool execution
  const activeProvider = resolvedProvider;
  const activeConfig = searchConfig;

  pi.registerTool({
    name: 'web_search',
    label: 'Web Search',
    description:
      'Search the web and return a list of results with title, URL, and snippet. Uses the configured search backend.',
    parameters: Type.Object({
      query: Type.String({ description: 'The search query' }),
      limit: Type.Optional(
        Type.Number({ description: 'Maximum number of results (default: 10, max: 20)' })
      ),
    }),
    execute: async (_id, params) => {
      const query = params.query ?? '';
      const limit = Math.min(params.limit ?? 10, 20);

      try {
        const results = await searchBackend(activeProvider, activeConfig, {
          query,
          limit,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(results) }],
        };
      } catch (err) {
        console.warn('[web-search] web_search error:', err);
        return {
          content: [{ type: 'text', text: JSON.stringify([]) }],
        };
      }
    },
  });
}
