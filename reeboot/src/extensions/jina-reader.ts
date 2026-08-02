/**
 * Jina Web Reader Extension
 *
 * Optional self-hosted sidekick power-up (ghcr.io/jina-ai/reader:oss).
 * When `config.web.jina_base_url` is set AND the sidekick is healthy:
 *   - registers `jina_read`  (read any page incl. JS/PDF/Office/images as Markdown)
 *   - registers `jina_search` only if the sidekick's search route is confirmed
 *     available (search-that-reads) — never a tool that can't return results
 *   - injects a `before_agent_start` guidance block teaching when to use each tool.
 *
 * The `jinaSearch()` implementation is kept for future builds that add the
 * search route; on the current OSS image the route is absent, so `jina_search`
 * is simply not registered (the agent keeps using the working `web_search`).
 *
 * Graceful degradation: with no sidekick (or an unhealthy one) nothing new is
 * registered and reeboot keeps its existing `fetch_url`/`web_search` baseline —
 * exactly like the SearXNG→DuckDuckGo fallback in web-search.
 *
 * Security: the website blocklist (`isDomainBlocked`) is applied to any target
 * hostname BEFORE the URL is delegated to the local container.
 */

import { Type } from 'typebox';
import type { ExtensionAPI } from './extension-api.js';
import { getLogger } from '../observability/logger.js';
import { isDomainBlocked } from '../security/website-blocklist.js';
import type { WebConfig } from '../config.js';

// ─── Health check ────────────────────────────────────────────────────────────

export async function checkJinaHealth(baseUrl: string): Promise<boolean> {
  if (!baseUrl) return false;
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/robots.txt`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── jinaRead backing function ───────────────────────────────────────────────

export interface JinaReadParams {
  url: string;
  engine?: 'auto' | 'curl' | 'browser';
  target_selector?: string;
  max_tokens?: number;
}

function buildReadHeaders(params: JinaReadParams, defaultEngine: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const engine = params.engine ?? defaultEngine;
  if (engine && engine !== 'auto') {
    headers['x-engine'] = engine;
  }
  if (params.target_selector) {
    headers['x-target-selector'] = params.target_selector;
  }
  if (params.max_tokens) {
    headers['x-max-tokens'] = String(params.max_tokens);
  }
  return headers;
}

export async function jinaRead(
  baseUrl: string,
  params: JinaReadParams,
  defaultEngine = 'auto'
): Promise<string> {
  const base = baseUrl.replace(/\/$/, '');
  const target = encodeURIComponent(params.url);
  const res = await fetch(`${base}/${target}`, {
    headers: buildReadHeaders(params, defaultEngine),
  });
  if (!res.ok) {
    throw new Error(`Jina Reader returned HTTP ${res.status}`);
  }
  return res.text();
}

// ─── jinaSearch backing function ─────────────────────────────────────────────

export interface JinaSearchResult {
  title: string;
  url: string;
  content: string;
}

export interface JinaSearchParams {
  query: string;
  sites?: string[];
  limit?: number;
}

export async function jinaSearch(
  baseUrl: string,
  params: JinaSearchParams
): Promise<JinaSearchResult[]> {
  const base = baseUrl.replace(/\/$/, '');
  const query = params.query ?? '';
  const limit = params.limit ?? 5;
  let q = query;
  if (params.sites && params.sites.length) {
    q = `${query} ${params.sites.map((s) => `site:${s}`).join(' ')}`.trim();
  }
  const url = `${base}/search?q=${encodeURIComponent(q)}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Jina search route returned HTTP ${res.status}`);
  }
  const data: any = await res.json();
  const results: any[] = data?.data ?? data?.results ?? [];
  return results.slice(0, limit).map((r: any) => ({
    title: r.title ?? '',
    url: r.url ?? '',
    content: r.content ?? r.snippet ?? '',
  }));
}

// ─── Extension Default Export ────────────────────────────────────────────────

export default async function jinaReaderExtension(
  pi: ExtensionAPI,
  reebotConfig?: any
): Promise<void> {
  const webConfig: WebConfig | undefined = reebotConfig?.web;
  if (!webConfig) return;

  const baseUrl: string = webConfig.jina_base_url ?? '';
  if (!baseUrl || !webConfig.enabled) return;

  const healthy = await checkJinaHealth(baseUrl);
  if (!healthy) return;

  const defaultEngine = webConfig.default_engine ?? 'auto';
  const blocklist = reebotConfig?.security?.website_blocklist;

  // Determine whether the OSS build actually provides the search route.
  // We never register a tool we know doesn't work (search-that-reads is
  // unavailable on the current OSS image). If a future build adds the route,
  // this probe auto-enables jina_search with no code change.
  let searchAvailable = false;
  try {
    const probe = await fetch(`${baseUrl.replace(/\/$/, '')}/search?q=probe&limit=1`);
    searchAvailable = probe.ok;
  } catch {
    searchAvailable = false;
  }

  // ── register jina_read ──────────────────────────────────────────────────
  pi.registerTool({
    name: 'jina_read',
    label: 'Jina Read',
    description:
      'Read any URL (web page including JS-rendered, PDF, Office document, or captioned image) and return clean LLM-ready Markdown/text content via the local Jina Reader sidekick. Prefer this over fetch_url when you need real page content.',
    promptSnippet:
      'Read a URL and return its full content (handles JS pages, PDFs, Office docs, images)',
    parameters: Type.Object({
      url: Type.String({ description: 'The URL to read' }),
      engine: Type.Optional(Type.String({ description: 'Rendering engine: auto (default), curl, or browser' })),
      target_selector: Type.Optional(Type.String({ description: 'CSS selector to extract only a section of the page' })),
      max_tokens: Type.Optional(Type.Number({ description: 'Maximum tokens of content to return' })),
    }),
    execute: async (_id, params) => {
      let hostname: string;
      try {
        hostname = new URL(params.url).hostname;
      } catch {
        return {
          content: [{ type: 'text' as const, text: 'Error: invalid URL provided to jina_read' }],
          isError: true,
          details: undefined,
        };
      }
      if (blocklist?.enabled && isDomainBlocked(hostname, blocklist)) {
        return {
          content: [{ type: 'text' as const, text: `jina_read: URL blocked by website policy: domain '${hostname}' is in the blocklist` }],
          isError: true,
          details: undefined,
        };
      }

      try {
        const text = await jinaRead(baseUrl, params as JinaReadParams, defaultEngine);
        return { content: [{ type: 'text' as const, text }], details: undefined };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `jina_read failed: ${msg}` }],
          isError: true,
          details: undefined,
        };
      }
    },
  });

  // ── register jina_search (only when the search route is confirmed) ──────
  // The jinaSearch() implementation is kept for future builds that support the
  // route; we do NOT register the tool when the route is unavailable so the
  // agent is never handed a tool that can't return results.
  if (searchAvailable) {
    pi.registerTool({
      name: 'jina_search',
      label: 'Jina Search',
      description:
        'Search the web and return the top results WITH their fetched full content (search-that-reads) via the local Jina Reader sidekick. Prefer this over web_search when you want real page content, not just snippets.',
      promptSnippet:
        'Search and return the top results plus their fetched full page content',
      parameters: Type.Object({
        query: Type.String({ description: 'The search query' }),
        sites: Type.Optional(Type.Array(Type.String(), { description: 'Restrict search to these sites (e.g. ["github.com"])' })),
        limit: Type.Optional(Type.Number({ description: 'Maximum number of results (default: 5)' })),
      }),
      execute: async (_id, params) => {
        const sites = params.sites ?? [];
        const blockedSites = blocklist?.enabled
          ? sites.filter((s: string) => isDomainBlocked(s, blocklist))
          : [];
        if (blockedSites.length > 0) {
          return {
            content: [{ type: 'text' as const, text: `jina_search: refused — the following sites are in the website blocklist: ${blockedSites.join(', ')}` }],
            isError: true,
            details: undefined,
          };
        }

        try {
          const results = await jinaSearch(baseUrl, params as JinaSearchParams);
          return { content: [{ type: 'text' as const, text: JSON.stringify(results) }], details: undefined };
        } catch {
          // Best-effort degrade — never throw.
          return {
            content: [{ type: 'text' as const, text: 'search unavailable on this build' }],
            details: undefined,
          };
        }
      },
    });
  }

  // ── before_agent_start guidance ─────────────────────────────────────────
  pi.on('before_agent_start', async (event: any) => {
    let block = `
## Jina Reader sidekick
The local Jina Reader sidekick is available. Prefer these tools for reading web content:
- Have a specific URL → prefer \`jina_read\` (handles JS-rendered pages, PDFs, Office docs, and captioned images as clean Markdown) over \`fetch_url\`.
`;
    if (searchAvailable) {
      block += `- Need to gather info from many pages or a search → prefer \`jina_search\` (returns the top results WITH their full fetched content) over \`web_search\` (snippets only) when depth is desired.
`;
    }
    block += `- Fall back to \`web_search\` / \`fetch_url\` for the cheap baseline or when a Jina call throws.
`;
    return { systemPrompt: (event.systemPrompt ?? '') + '\n' + block };
  });
}
