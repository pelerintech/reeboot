/**
 * Credential Proxy
 *
 * A lightweight Fastify instance on 127.0.0.1:3001 (or configured port).
 * Intercepts LLM API calls from a sandboxed agent process, injects the real
 * API key, and forwards the request to the actual provider.
 *
 * Only started when config.credentialProxy.enabled === true.
 */

import Fastify, { FastifyInstance } from 'fastify';

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

// ─── Singleton ────────────────────────────────────────────────────────────────

let _proxyServer: FastifyInstance | null = null;

// ─── startProxy ───────────────────────────────────────────────────────────────

export async function startProxy(config: CredentialProxyConfig): Promise<FastifyInstance | null> {
  if (!config.credentialProxy?.enabled) {
    return null;
  }

  const port = config.credentialProxy?.port ?? 3001;
  const defaultProvider = config.agent?.model?.provider ?? 'anthropic';
  const defaultApiKey = config.agent?.model?.apiKey ?? '';

  const server = Fastify({ logger: false });

  // Forward all routes to the provider
  server.all('/*', async (req, reply) => {
    // Determine provider from header or default
    const providerHeader = (req.headers['x-reeboot-provider'] as string) ?? defaultProvider;
    const provider = providerHeader.toLowerCase();

    const baseUrl = PROVIDER_BASE_URLS[provider] ?? PROVIDER_BASE_URLS['anthropic'];

    // Resolve the API key (use default key; in future could look up per-provider)
    const apiKey = defaultApiKey;

    // Build target URL
    const path = (req.url ?? '/').replace(/^\/?/, '/');
    const targetUrl = `${baseUrl}${path}`;

    // Build forwarded headers (strip proxy-specific headers, inject real auth)
    const forwardHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (
        k.toLowerCase() === 'host' ||
        k.toLowerCase() === 'x-reeboot-provider' ||
        k.toLowerCase() === 'connection'
      ) {
        continue;
      }
      if (typeof v === 'string') forwardHeaders[k] = v;
      else if (Array.isArray(v)) forwardHeaders[k] = v[0];
    }

    // Inject real API key
    forwardHeaders['Authorization'] = `Bearer ${apiKey}`;

    // Forward request
    const method = req.method;
    const hasBody = method !== 'GET' && method !== 'HEAD' && method !== 'DELETE';

    let bodyText: string | undefined;
    if (hasBody && req.body) {
      bodyText = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      if (!forwardHeaders['content-type']) {
        forwardHeaders['content-type'] = 'application/json';
      }
    }

    try {
      const response = await fetch(targetUrl, {
        method,
        headers: forwardHeaders,
        body: hasBody ? bodyText : undefined,
      });

      reply.status(response.status);

      // Forward response headers
      for (const [k, v] of response.headers.entries()) {
        if (k.toLowerCase() !== 'transfer-encoding') {
          reply.header(k, v);
        }
      }

      const responseText = await response.text();
      return reply.send(responseText);
    } catch (err: any) {
      return reply.status(502).send({ error: `Proxy error: ${err.message}` });
    }
  });

  await server.listen({ port, host: '127.0.0.1' });

  _proxyServer = server;
  return server;
}

// ─── stopProxy ────────────────────────────────────────────────────────────────

export async function stopProxy(): Promise<void> {
  if (_proxyServer) {
    await _proxyServer.close();
    _proxyServer = null;
  }
}
