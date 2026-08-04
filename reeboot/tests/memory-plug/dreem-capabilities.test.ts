import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  makeDreemProvider,
  registerDreemProviderFactory,
  type DreemProviderConfig,
} from '../../src/extensions/memory-dreem.js';
import { setReebootModelConfig } from '../../src/extensions/memory-model-config.js';
import { registerServerJobs } from '../../src/extensions/memory-manager.js';
import { STANDARD_CAPABILITIES, hasCapability } from '@src/memory-provider.js';

afterEach(() => {
  vi.unstubAllGlobals();
  setReebootModelConfig(undefined);
});

function config(overrides: Partial<DreemProviderConfig> = {}): DreemProviderConfig {
  return { baseUrl: 'http://dreem.test', ...overrides };
}

function stubFetch(handler?: (url: string, init: any) => any) {
  const bodies: string[] = [];
  const fetchMock = vi.fn(async (url: any, init: any) => {
    const body = handler ? handler(String(url), init) : {};
    bodies.push(`${init?.method} ${url} ${init?.body ?? ''}`);
    return { ok: !(body && body.__error), status: body && body.__error ? 500 : 200, json: async () => (body && body.__error ? {} : body), text: async () => (body && body.__error ? '' : JSON.stringify(body)) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return bodies;
}

describe('dreem provider — capabilities + self-consolidating + LLM sharing', () => {
  it('declares self-consolidating, hot-retrieval and native capabilities (S3, S4, S5)', () => {
    const provider = makeDreemProvider(config());
    const caps = provider.listCapabilities();
    expect(hasCapability(provider, STANDARD_CAPABILITIES.selfConsolidating)).toBe(true);
    expect(hasCapability(provider, STANDARD_CAPABILITIES.hotMemory)).toBe(true);
    const names = caps.map((c) => c.name);
    for (const native of ['graph', 'health']) {
      expect(names).toContain(native);
    }
  });

  it('reeboot consolidation job is skipped when dreem is active (S3)', () => {
    const scheduler = { registerJob: vi.fn(), cancelJob: vi.fn() };
    registerDreemProviderFactory();
    registerServerJobs({} as any, scheduler as any, {
      memory: { provider: 'dreem', enabled: true, providerConfig: { baseUrl: 'http://dreem.test' } },
    } as any, '/tmp');
    expect(scheduler.registerJob).not.toHaveBeenCalled();
  });

  it('propagates providerConfig.llm override to backend requests', async () => {
    const bodies = stubFetch();
    const provider = makeDreemProvider(
      config({ consolidationInterval: '0 * * * *', llm: { provider: 'anthropic', id: 'claude-x' } })
    );
    await provider.store('self', 'a fact');
    const sent = bodies.join('|');
    expect(sent).toContain('claude-x');
    expect(sent).toContain('0 * * * *');
  });

  it('inherits reeboot active model config when llm is not overridden', async () => {
    const bodies = stubFetch();
    setReebootModelConfig({ provider: 'openai', id: 'gpt-4o' });
    const provider = makeDreemProvider(config());
    await provider.store('self', 'another fact');
    const sent = bodies.join('|');
    expect(sent).toContain('gpt-4o');
  });

  it('native tools register namespaced through the uniform registry', async () => {
    const { makeMemoryExtension } = await import('../../src/extensions/memory-manager.js');
    const tools = new Map<string, any>();
    const pi = { registerTool: (d: any) => tools.set(d.name, d), on: () => {} } as any;
    makeMemoryExtension(pi, {
      memory: { provider: 'dreem', enabled: true, providerConfig: { baseUrl: 'http://dreem.test' } },
    } as any, '/tmp/mem', [makeDreemProvider(config())]);
    const names = [...tools.keys()];
    expect(names).toContain('memory::dreem::graph');
    expect(names).toContain('memory::dreem::health');
    expect(names).toContain('memory::dreem::dream');
  });

  it('declares tree and deeper-search native capabilities (S5)', () => {
    const provider = makeDreemProvider(config());
    const names = provider.listCapabilities().map((c) => c.name);
    for (const native of ['graph', 'health', 'tree', 'deep-search']) {
      expect(names).toContain(native);
    }
  });

  it('capability tools carry execute handlers that query the backend (not "declared without a handler" stubs)', async () => {
    const bodies = stubFetch();
    const provider = makeDreemProvider(config());
    const caps = provider.listCapabilities();
    for (const cap of caps) {
      expect(typeof cap.execute, cap.name).toBe('function');
    }
    // Calling the health handler must hit the configured dreem backend.
    const health = caps.find((c) => c.name === 'health')!;
    const result = await health.execute!({});
    expect(bodies.join('|')).toContain('health');
    expect(result).not.toContain('declared without a handler');
  });

  it('registered capability tools surface reeboot structured views for non-tool-schema data (S5)', async () => {
    const { makeMemoryExtension } = await import('../../src/extensions/memory-manager.js');
    const registered = new Map<string, any>();
    const pi = { registerTool: (d: any) => registered.set(d.name, d), on: () => {} } as any;
    const provider = makeDreemProvider(config());
    makeMemoryExtension(pi, {
      memory: { provider: 'dreem', enabled: true, providerConfig: { baseUrl: 'http://dreem.test' } },
    } as any, '/tmp/mem', [provider]);

    // graph returns an array of node records → must surface as a data-table view.
    stubFetch((url: string, init: any) => {
      if (String(url).includes('/graph')) {
        return { nodes: [{ id: 'n1', kind: 'fact' }, { id: 'n2', kind: 'preference' }] };
      }
      return {};
    });
    const graphTool = registered.get('memory::dreem::graph');
    expect(graphTool).toBeDefined();
    const out = await graphTool.execute('id', {});
    const view = out.view ?? out.details?.view;
    expect(view).toBeDefined();
    expect(view?.type).toBe('data-table');
  });
});
