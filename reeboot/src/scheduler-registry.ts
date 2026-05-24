/**
 * Global Scheduler registry singleton.
 * Set by server.ts after the Scheduler is initialised.
 */

import type { SchedulerToolsTarget, Scheduler } from './scheduler.js';
export { startHeartbeat, stopHeartbeat } from './scheduler/heartbeat.js';

export type JobDef = { id: string; contextId: string; schedule: string; prompt: string };

// Stub scheduler that no-ops until a real one is registered
export const noopScheduler: SchedulerToolsTarget & { start(): Promise<void>; stop(): void } = {
  registerJob: () => {},
  cancelJob: () => {},
  start: async () => {},
  stop: () => {},
};

export let globalScheduler: SchedulerToolsTarget & { start(): Promise<void>; stop(): void } =
  noopScheduler;

// Deferred queue: holds jobs registered before the real scheduler is set
const _pending: JobDef[] = [];
let _real: (SchedulerToolsTarget & { start(): Promise<void>; stop(): void }) | null = null;

export function registerJob(job: JobDef): void {
  if (_real) {
    _real.registerJob(job);
  } else {
    _pending.push(job);
  }
}

export function setGlobalScheduler(scheduler: Scheduler): void {
  _real = scheduler;
  globalScheduler = scheduler;
  for (const job of _pending) {
    scheduler.registerJob(job);
  }
  _pending.length = 0;
}
