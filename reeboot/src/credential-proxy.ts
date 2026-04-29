/**
 * Credential Proxy (Hono)
 *
 * A lightweight Hono instance on 127.0.0.1:3001 (or configured port).
 * Intercepts LLM API calls from a sandboxed agent process, injects the real
 * API key, and forwards the request to the actual provider.
 *
 * Only started when config.credentialProxy.enabled === true.
 */

import { Hono } from 'hono';
import { createAdaptorServer } from '@hono/node-server';
import type { ServerType } from '@hono/node-server';

// ─── Provider URL map ─────────────────────────────────────────────────────────

const PROVIDER_BASE_URLS: Record<string, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com',
  google: 'https://generativelanguage.googleapis.com',
  openrouter: 'https://openrouter.ai/api',
};

// ─── Config types ─────────────────────────────────────────────────────────────

export interface CredentialProxyConfig {
  credentialProxy?: {
    enabled?: boolean;
    port?: number;
  };
  agent?: {
    model?: {
      provider?: string;
      apiKey?: string;
    };
  };
}

// ─── Factory: create proxy Hono app (exported for direct handler testing) ────

export function createProxyApp(config: CredentialProxyConfig): Hono {
  const defaultProvider = config.agent?.model?.provider ?? 'anthropic';
  const defaultApiKey = config.agent?.model?.apiKey ?? '';

  const app = new Hono();

  app.all('/*', async (c) => {
    const providerHeader = c.req.header('x-reeboot-provider');
    const provider = (providerHeader ?? defaultProvider).toLowerCase();
    const baseUrl = PROVIDER_BASE_URLS[provider] ?? PROVIDER_BASE_URLS['anthropic'];

    const path = new URL(c.req.url).pathname;
    const targetUrl = `${baseUrl}${path}`;

    // Forward headers (strip proxy-specific, inject real auth)
    const forwardHeaders = new Headers();
    c.req.raw.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === 'host' || lower === 'x-reeboot-provider' || lower === 'connection') {
        return;
      }
      forwardHeaders.set(key, value);
    });

    // Inject real API key
    forwardHeaders.set('Authorization', `Bearer ${defaultApiKey}`);

    // Forward request
    const method = c.req.method;
    const hasBody = method !== 'GET' && method !== 'HEAD' && method !== 'DELETE';

    let body: string | undefined;
    if (hasBody) {
      body = await c.req.text();
      if (!forwardHeaders.has('content-type')) {
        forwardHeaders.set('content-type', 'application/json');
      }
    }

    try {
      const response = await fetch(targetUrl, {
        method,
        headers: forwardHeaders,
        body: hasBody ? body : undefined,
      });

      const responseText = await response.text();

      // Forward response headers
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'transfer-encoding') {
          headers[key] = value;
        }
      });

      return c.newResponse(responseText, response.status as any, headers);
    } catch (err: any) {
      return c.json({ error: `Proxy error: ${err.message}` }, 502);
    }
  });

  return app;
}

// ─── Legacy singleton (empty config) ──────────────────────────────────────────

export const proxyApp = createProxyApp({});

// ─── Singleton ──────────────────────────────────────────────────────────────

let _proxyServer: ServerType | null = null;

// ─── startProxy ───────────────────────────────────────────────────────────────

export async function startProxy(config: CredentialProxyConfig): Promise<ServerType | null> {
  if (!config.credentialProxy?.enabled) {
    return null;
  }

  const port = config.credentialProxy?.port ?? 3001;

  const app = createProxyApp(config);
  const server = createAdaptorServer({ fetch: app.fetch });

  await new Promise<void>((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve());
  });

  _proxyServer = server;
  return server;
}

// ─── stopProxy ───────────────────────────────────────────────────────────────

export async function stopProxy(): Promise<void> {
  if (_proxyServer) {
    await new Promise<void>((resolve) => {
      _proxyServer!.close(() => resolve());
    });
    _proxyServer = null;
  }
}
