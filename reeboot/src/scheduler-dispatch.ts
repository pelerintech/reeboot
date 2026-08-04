/**
 * Scheduler task dispatch.
 *
 * Extracted from server.ts to be testable.
 * Routes the `__memory_consolidation__` sentinel to `runConsolidation`
 * instead of publishing to the bus as an ordinary agent turn.
 */

import type Database from 'better-sqlite3';
import type { IncomingMessage } from './channels/interface.js';
import type { ScheduledTaskRef } from './scheduler.js';
import type { MemoryProvider } from './memory-provider.js';

export type RunConsolidationFn = (opts: {
  db: Database.Database;
  memoriesDir: string;
  memoryCharLimit: number;
  userCharLimit: number;
  llmCall: (prompt: string) => Promise<string>;
  /** The resolved active memory provider so the job routes via the provider contract (never direct file writes). */
  provider?: MemoryProvider;
}) => Promise<void>;

export interface SchedulerTaskHandlerDeps {
  db: Database.Database;
  bus: {
    publish: (msg: IncomingMessage) => void;
  };
  runConsolidation: RunConsolidationFn;
  llmCall: (prompt: string) => Promise<string>;
  memoriesDir: string;
  memoryCharLimit: number;
  userCharLimit: number;
  /** Full app config; used to resolve the active memory provider for consolidation routing. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config?: any;
}

/**
 * Create a scheduler task handler that intercepts the consolidation sentinel.
 *
 * When a task with `taskId === '__memory_consolidation__'` fires, it routes
 * to `runConsolidation` instead of publishing to the bus.
 * Normal tasks dispatch to the bus as before.
 */
/**
 * Resolve the active memory provider for consolidation routing. Returns the
 * active provider, or undefined if it cannot be resolved (the caller falls
 * back to the legacy direct-write path). The provider is threaded into
 * runConsolidation so the job writes via builtin.store/provider.store — never
 * direct file writes (builtin-provider S5).
 */
async function resolveActiveProvider(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any,
  memoriesDir: string
): Promise<MemoryProvider | undefined> {
  try {
    const { resolveConfiguredProvider } = await import('./extensions/memory-manager.js');
    return resolveConfiguredProvider(config, memoriesDir).manager.active;
  } catch {
    return undefined;
  }
}

export function createSchedulerTaskHandler(deps: SchedulerTaskHandlerDeps) {
  const { db, bus, runConsolidation, llmCall, memoriesDir, memoryCharLimit, userCharLimit, config } = deps;

  return async (task: ScheduledTaskRef): Promise<void> => {
    // Intercept memory consolidation sentinel
    if (task.taskId === '__memory_consolidation__') {
      const provider = config ? await resolveActiveProvider(config, memoriesDir) : undefined;
      await runConsolidation({
        db,
        memoriesDir,
        memoryCharLimit,
        userCharLimit,
        llmCall,
        provider,
      });
      return;
    }

    // Normal task — publish to bus
    const { createIncomingMessage } = await import('./channels/interface.js');
    const { buildScheduledPrompt } = await import('./scheduler.js');
    const enrichedPrompt = buildScheduledPrompt(task);
    bus.publish(
      createIncomingMessage({
        channelType: 'scheduler',
        peerId: 'scheduler',
        content: enrichedPrompt,
        raw: {
          taskId: task.taskId,
          origin_channel: task.origin_channel ?? null,
          origin_peer: task.origin_peer ?? null,
        },
      })
    );
  };
}
