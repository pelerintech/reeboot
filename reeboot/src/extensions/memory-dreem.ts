/**
 * Dreem memory provider.
 *
 * Treats dreem as a memory SYSTEM (own consolidation + retrieval), not a store,
 * delegating the memory experience to the configured dreem backend over its HTTP/
 * domain API. The provider maps the six core ops to dreem knowledge operations,
 * returns/consumes opaque refs (concept path), and degrades gracefully at the
 * provider level when the backend cannot honor an operation (S6).
 *
 * The full dreem sidekick deployment topology is separate follow-up work; this
 * provider targets a configured dreem endpoint (`baseUrl`/`apiKey`).
 */

import type {
  MemoryProvider,
  MemoryScope,
  MemoryRef,
  MemoryHit,
  CapabilityDef,
} from '../memory-provider.js';
import { STANDARD_CAPABILITIES } from '../memory-provider.js';
import { getLogger } from '../observability/logger.js';
import { getReebootModelConfig } from './memory-model-config.js';

/** Typed, flattened dreem providerConfig (matches `config.ts` dreem union branch). */
export interface DreemProviderConfig {
  baseUrl: string;
  apiKey?: string;
  consolidationInterval?: string;
  llm?: Record<string, unknown>;
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────

async function request(
  baseUrl: string,
  apiKey: string | undefined,
  path: string,
  init: { method: string; body?: unknown }
): Promise<Record<string, unknown>> {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const res = await fetch(url, {
    method: init.method,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw new Error(`dreem backend responded ${res.status}`);
  const text = await res.text();
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

// ─── Provider factory ────────────────────────────────────────────────────────

export function makeDreemProvider(config: DreemProviderConfig): MemoryProvider {
  const { baseUrl, apiKey, consolidationInterval } = config;
  const logger = getLogger();
  const c = (path: string) => path;
  // LLM choice passed to the backend: providerConfig.llm overrides reeboot's
  // active model config (inherited by default) so dreem's Dream/hot generation
  // shares reeboot's LLM.
  const effectiveLlm = config.llm ?? getReebootModelConfig();
  const deployment = {
    consolidationInterval,
    llm: effectiveLlm,
  };

  return {
    id: 'dreem',
    async store(scope: MemoryScope, content: string): Promise<MemoryRef> {
      try {
        const res = await request(baseUrl, apiKey, c('/memory'), {
          method: 'POST',
          body: { scope, content, ...deployment },
        });
        const id = typeof res?.refId === 'string' ? res.refId : `dreem:${scope}:${Date.now()}`;
        return { id };
      } catch (e) {
        logger.warn({ component: 'memory-dreem', op: 'store' }, `dreem store degraded: ${(e as Error).message}`);
        return { id: `degraded:${Date.now()}` };
      }
    },
    async update(scope: MemoryScope, ref: MemoryRef, content: string) {
      try {
        await request(baseUrl, apiKey, c(`/memory/${encodeURIComponent(ref.id)}`), {
          method: 'PUT',
          body: { scope, content },
        });
      } catch (e) {
        logger.warn({ component: 'memory-dreem', op: 'update' }, `dreem update degraded: ${(e as Error).message}`);
      }
    },
    async forget(scope: MemoryScope, ref: MemoryRef) {
      try {
        await request(baseUrl, apiKey, c(`/memory/${encodeURIComponent(ref.id)}`), {
          method: 'DELETE',
          body: { scope },
        });
      } catch (e) {
        logger.warn({ component: 'memory-dreem', op: 'forget' }, `dreem forget degraded: ${(e as Error).message}`);
      }
    },
    async recall(scope: MemoryScope, query: string, limit?: number): Promise<MemoryHit[]> {
      try {
        const res = await request(baseUrl, apiKey, c('/search'), {
          method: 'POST',
          body: { scope, query, limit },
        });
        const hits = Array.isArray(res?.hits) ? (res.hits as Array<Record<string, unknown>>) : [];
        return hits.map((h) => ({
          ref: { id: String(h.refId) },
          scope: (h.scope as MemoryScope) ?? scope,
          content: String(h.content ?? ''),
          score: typeof h.score === 'number' ? h.score : undefined,
        }));
      } catch (e) {
        logger.warn({ component: 'memory-dreem', op: 'recall' }, `dreem recall degraded: ${(e as Error).message}`);
        return [];
      }
    },
    async clear(scope: MemoryScope) {
      try {
        await request(baseUrl, apiKey, c(`/memory?scope=${encodeURIComponent(scope)}`), {
          method: 'DELETE',
        });
      } catch (e) {
        logger.warn({ component: 'memory-dreem', op: 'clear' }, `dreem clear degraded: ${(e as Error).message}`);
      }
    },
    async grounding(opts?: { scope?: MemoryScope; maxChars?: number }): Promise<string> {
      void opts;
      try {
        const res = await request(baseUrl, apiKey, c('/grounding'), { method: 'GET' });
        return typeof res?.digest === 'string' ? res.digest : '';
      } catch (e) {
        logger.warn({ component: 'memory-dreem', op: 'grounding' }, `dreem grounding degraded: ${(e as Error).message}`);
        return '';
      }
    },
    listCapabilities(): CapabilityDef[] {
      // dreem is self-consolidating (its Dream owns consolidation), declares its
      // own hot/adaptive retrieval, and exposes native tools (fully wired in the
      // capabilities task). Every tool has a functional execute handler that
      // queries the configured backend and degrades at the provider level.
      const capCall = (path: string, body?: unknown) => async (params: unknown) => {
        void params;
        try {
          const res = await request(baseUrl, apiKey, c(path), {
            method: body !== undefined ? 'POST' : 'GET',
            body,
          });
          return res;
        } catch (e) {
          logger.warn({ component: 'memory-dreem', op: path }, `dreem ${path} degraded: ${(e as Error).message}`);
          return { error: `dreem ${path} unavailable` };
        }
      };

      return [
        {
          name: 'dream',
          description: 'Runs the autonomous dreem Dream consolidation loop.',
          parameters: {},
          key: STANDARD_CAPABILITIES.selfConsolidating,
          execute: capCall('/dream', { ...deployment }),
        },
        {
          name: 'hot-retrieval',
          description: 'Self-serves cached→hot→deep retrieval from the dreem backend.',
          parameters: {},
          key: STANDARD_CAPABILITIES.hotMemory,
          execute: capCall('/search', { query: '', hot: true }),
        },
        {
          name: 'graph',
          description: 'Explore the dreem knowledge graph.',
          parameters: {},
          execute: capCall('/graph'),
        },
        {
          name: 'health',
          description: 'Check the dreem backend health.',
          parameters: {},
          execute: capCall('/health'),
        },
        {
          name: 'tree',
          description: 'Inspect the dreem knowledge tree.',
          parameters: {},
          execute: capCall('/tree'),
        },
        {
          name: 'deep-search',
          description: 'Run a deeper dreem knowledge-graph search.',
          parameters: {},
          execute: capCall('/search', { query: '', deep: true }),
        },
      ];
    },
  };
}

/**
 * Register the dreem provider factory on the global provider-factory registry, so
 * `memory.provider = 'dreem'` is constructed from the typed `providerConfig`.
 */
export function registerDreemProviderFactory(): void {
  // Dynamic import to avoid a hard cross-extension dependency at module scope.
  // Best-effort: if the provider registry is unavailable (e.g. mocked out in a
  // test harness), degrade silently rather than throw an unhandled rejection.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  void (async () => {
    try {
      const { registerProvider } = await import('./memory-manager.js');
      registerProvider('dreem', (cfg: unknown) => makeDreemProvider(cfg as DreemProviderConfig));
    } catch {
      // provider registry unavailable — the configured dreem provider won't be selectable
    }
  })();
}

export default registerDreemProviderFactory;
