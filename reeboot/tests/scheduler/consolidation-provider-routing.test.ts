import { describe, it, expect, vi } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, mkdirSync } from 'fs';

/**
 * Gap: builtin-provider S5 — "reeboot runs its job ... writes distilled insights
 * via builtin.store('self', ...) — never direct file writes."
 *
 * The production scheduler-dispatch path must resolve the configured active
 * provider and thread it into runConsolidation so the consolidation job routes
 * through the provider contract (builtin.store) instead of direct file writes.
 */
describe('scheduler dispatch routes consolidation via the active provider contract', () => {
  it('threads the resolved active provider into runConsolidation (builtin S5)', async () => {
    const memoriesRoot = mkdtempSync(join(tmpdir(), 'reeboot-mem-routing-'));
    const memoriesDir = join(memoriesRoot, 'memories');
    mkdirSync(memoriesDir, { recursive: true });
    const config = {
      memory: {
        provider: 'builtin',
        enabled: true,
        providerConfig: {
          consolidation: { enabled: true, schedule: '0 2 * * *' },
          memoryCharLimit: 2200,
          userCharLimit: 1375,
        },
      },
    };

    const { createSchedulerTaskHandler } = await import('@src/scheduler-dispatch.js');
    const runConsolidationSpy = vi.fn().mockResolvedValue(undefined);
    const handler = createSchedulerTaskHandler({
      db: {} as any,
      bus: { publish: vi.fn() } as any,
      runConsolidation: runConsolidationSpy,
      llmCall: vi.fn().mockResolvedValue('ADD memory: x'),
      memoriesDir,
      memoryCharLimit: 2200,
      userCharLimit: 1375,
      config: config as any,
    });

    await handler({
      taskId: '__memory_consolidation__',
      prompt: '__memory_consolidation__: Run the memory consolidation process.',
      origin_channel: null,
      origin_peer: null,
    });

    expect(runConsolidationSpy).toHaveBeenCalledTimes(1);
    const opts = runConsolidationSpy.mock.calls[0][0];
    // The active provider must be resolved and threaded into runConsolidation.
    expect(opts.provider).toBeDefined();
    expect(opts.provider.id).toBe('builtin');
  });
});
