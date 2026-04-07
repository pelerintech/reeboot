/**
 * custom-compaction-api.test.ts
 *
 * Verifies that custom-compaction.ts calls getApiKeyAndHeaders (not getApiKey)
 * when resolving auth for the summarization model.
 */

import { describe, it, expect, vi } from 'vitest';

async function mountExtension() {
  const handlers: Record<string, Function> = {};
  const notifications: Array<{ msg: string; level: string }> = [];

  const getApiKeyAndHeadersSpy = vi.fn();
  const getApiKeySpy = vi.fn();

  const mockPi = {
    on: (event: string, handler: Function) => {
      handlers[event] = handler;
    },
  } as any;

  const mockModel = { provider: 'google', id: 'gemini-2.5-flash' };

  const mockCtx = {
    ui: {
      notify: (msg: string, level: string) => notifications.push({ msg, level }),
    },
    modelRegistry: {
      find: vi.fn(() => mockModel),
      getApiKeyAndHeaders: getApiKeyAndHeadersSpy,
      getApiKey: getApiKeySpy,
    },
  } as any;

  // Load the extension (imports from src directly — vitest uses tsx)
  const mod = await import('../../src/extensions/custom-compaction.ts');
  mod.default(mockPi);

  return { handlers, notifications, getApiKeyAndHeadersSpy, getApiKeySpy, mockCtx, mockModel };
}

describe('custom-compaction extension — API usage', () => {
  it('calls getApiKeyAndHeaders, not getApiKey', async () => {
    const { handlers, getApiKeyAndHeadersSpy, getApiKeySpy, mockCtx } = await mountExtension();

    // getApiKeyAndHeaders returns ok=false → extension should fall back gracefully
    getApiKeyAndHeadersSpy.mockResolvedValue({ ok: false });

    const mockEvent = {
      preparation: {
        messagesToSummarize: [],
        turnPrefixMessages: [],
        tokensBefore: 1000,
        firstKeptEntryId: 'entry-1',
        previousSummary: undefined,
      },
      branchEntries: [],
      signal: new AbortController().signal,
    };

    await handlers['session_before_compact'](mockEvent, mockCtx);

    expect(getApiKeyAndHeadersSpy).toHaveBeenCalledTimes(1);
    expect(getApiKeySpy).not.toHaveBeenCalled();
  });

  it('returns undefined (fallback) when auth.ok is false', async () => {
    const { handlers, getApiKeyAndHeadersSpy, mockCtx } = await mountExtension();

    getApiKeyAndHeadersSpy.mockResolvedValue({ ok: false });

    const mockEvent = {
      preparation: {
        messagesToSummarize: [],
        turnPrefixMessages: [],
        tokensBefore: 1000,
        firstKeptEntryId: 'entry-1',
        previousSummary: undefined,
      },
      branchEntries: [],
      signal: new AbortController().signal,
    };

    const result = await handlers['session_before_compact'](mockEvent, mockCtx);
    expect(result).toBeUndefined();
  });
});
