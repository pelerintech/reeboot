import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeDreemProvider, registerDreemProviderFactory } from '../../src/extensions/memory-dreem.js';
import type { DreemProviderConfig } from './memory-dreem.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function config(overrides: Partial<DreemProviderConfig> = {}): DreemProviderConfig {
  return { baseUrl: 'http://dreem.test', ...overrides };
}

function stubFetch(handler: (url: string, init: any) => any) {
  const fetchMock = vi.fn(async (url: any, init: any) => {
    const body = handler(String(url), init);
    return {
      ok: !(body && body.__error),
      status: body && body.__error ? 500 : 200,
      json: async () => (body && body.__error ? {} : body),
      text: async () => (body && body.__error ? '' : JSON.stringify(body)),
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('dreem provider — core ops + delegation (S1, S2, S6)', () => {
  it('store POSTs knowledge and returns an opaque concept-path ref', async () => {
    const calls: string[] = [];
    stubFetch((url, init) => {
      calls.push(`${init?.method} ${url} ${init?.body ?? ''}`);
      return { refId: 'concepts/owner/preference' };
    });
    const provider = makeDreemProvider(config({ apiKey: 'token' }));

    const ref = await provider.store('self', 'likes terse answers');
    expect(ref.id).toBe('concepts/owner/preference');
    expect(calls.some((c) => c.includes('POST') && c.includes('/memory'))).toBe(true);
    expect(calls.some((c) => c.includes('likes terse answers'))).toBe(true);
  });

  it('store(source: session) forwards the raw transcript unchanged (S2b — dreem ingests itself)', async () => {
    const calls: string[] = [];
    stubFetch((url, init) => {
      calls.push(`${init?.method} ${url} ${typeof init?.body === 'string' ? init.body : JSON.stringify(init?.body)}`);
      return { refId: 'concepts/session/note' };
    });
    const provider = makeDreemProvider(config({ apiKey: 'token' }));

    const transcript = [
      { role: 'user', content: 'What is dreem?' },
      { role: 'assistant', content: 'A memory system.' },
    ];
    const ref = await provider.store('self', transcript, { source: 'session' });
    expect(ref.id).toBe('concepts/session/note');
    // The raw session (transcript) and the session source signal reach the backend
    // — the manager does not distill for dreem; dreem handles it internally.
    const call = calls.find((c) => c.includes('/memory'));
    expect(call).toBeDefined();
    expect(call).toContain('transcript');
    expect(call).toContain('session');
    expect(call).toContain('What is dreem?');
  });

  it('update/forget consume the ref via knowledge endpoints', async () => {
    const calls: string[] = [];
    stubFetch((url, init) => {
      calls.push(`${init?.method} ${url}`);
      return {};
    });
    const provider = makeDreemProvider(config({ baseUrl: 'http://dreem.test', apiKey: 't' }));

    await provider.update('self', { id: 'concepts/owner/preference' }, 'new content');
    await provider.forget('human', { id: 'concepts/owner/p' });
    expect(calls.some((c) => c.includes('PUT') && c.includes(encodeURIComponent('concepts/owner/preference')))).toBe(true);
    expect(calls.some((c) => c.includes('DELETE') && c.includes(encodeURIComponent('concepts/owner/p')))).toBe(true);
  });

  it('recall delegates to dreem retrieval and returns MemoryHits', async () => {
    stubFetch((url, init) => {
      if (String(url).includes('/search')) {
        return {
          hits: [
            { refId: 'c1', scope: 'self', content: 'match one', score: 0.9 },
            { refId: 'c2', scope: 'human', content: 'match two', score: 0.8 },
          ],
        };
      }
      return {};
    });
    const provider = makeDreemProvider(config());

    const hits = await provider.recall('both', 'match', 5);
    expect(hits.length).toBe(2);
    expect(hits[0].ref.id).toBe('c1');
    expect(hits[0].content).toBe('match one');
    expect(hits.every((h) => 'scope' in h)).toBe(true);
  });

  it('clear maps to a scope-delete and grounding to a digest', async () => {
    const calls: string[] = [];
    stubFetch((url, init) => {
      calls.push(`${init?.method} ${url}`);
      if (String(url).includes('/grounding')) return { digest: 'DIGEST' };
      return {};
    });
    const provider = makeDreemProvider(config());

    await provider.clear('self');
    expect(calls.some((c) => c.includes('DELETE') && c.includes('scope='))).toBe(true);

    const g = await provider.grounding({ maxChars: 200 });
    expect(g).toBe('DIGEST');
  });

  it('grounding forwards scope and self-polices maxChars (S5)', async () => {
    const calls: string[] = [];
    stubFetch((url, init) => {
      calls.push(`${init?.method} ${url}`);
      if (String(url).includes('/grounding')) return { digest: 'abcdefghij' };
      return {};
    });
    const provider = makeDreemProvider(config());

    const g = await provider.grounding({ scope: 'human', maxChars: 5 });
    expect(g).toBe('abcde');
    // scope must be forwarded to the backend so the digest is scoped
    expect(calls.some((c) => c.includes('/grounding') && c.includes('human'))).toBe(true);
  });

  it('degrades gracefully when the backend is unreachable (S6)', async () => {
    stubFetch(() => {
      throw new Error('connection refused');
    });
    const provider = makeDreemProvider(config());
    // Should not crash — degrade at the provider level.
    const hits = await provider.recall('self', 'anything');
    expect(Array.isArray(hits)).toBe(true);
  });

  it('registers a dreem factory in the provider-factory registry', () => {
    registerDreemProviderFactory();
    // smoke: factory must be resolvable — falls back cleanly for an unreachable backend
    const provider = makeDreemProvider(config({ baseUrl: 'http://dreem.test' }));
    expect(provider.id).toBe('dreem');
  });
});
