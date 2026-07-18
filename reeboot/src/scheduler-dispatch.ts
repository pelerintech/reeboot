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

export type RunConsolidationFn = (opts: {
  db: Database.Database;
  memoriesDir: string;
  memoryCharLimit: number;
  userCharLimit: number;
  llmCall: (prompt: string) => Promise<string>;
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
}

/**
 * Create a scheduler task handler that intercepts the consolidation sentinel.
 *
 * When a task with `taskId === '__memory_consolidation__'` fires, it routes
 * to `runConsolidation` instead of publishing to the bus.
 * Normal tasks dispatch to the bus as before.
 */
export function createSchedulerTaskHandler(deps: SchedulerTaskHandlerDeps) {
  const { db, bus, runConsolidation, llmCall, memoriesDir, memoryCharLimit, userCharLimit } = deps;

  return async (task: ScheduledTaskRef): Promise<void> => {
    // Intercept memory consolidation sentinel
    if (task.taskId === '__memory_consolidation__') {
      await runConsolidation({
        db,
        memoriesDir,
        memoryCharLimit,
        userCharLimit,
        llmCall,
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
