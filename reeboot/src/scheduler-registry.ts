/**
 * Global Scheduler registry singleton.
 * Set by server.ts after the Scheduler is initialised.
 */

import type { SchedulerToolsTarget, Scheduler } from './scheduler.js';
export { startHeartbeat, stopHeartbeat } from './scheduler/heartbeat.js';

// Stub scheduler that no-ops until a real one is registered
const noopScheduler: SchedulerToolsTarget & { start(): Promise<void>; stop(): void } = {
  registerJob: () => {},
  cancelJob: () => {},
  start: async () => {},
  stop: () => {},
};

export let globalScheduler: SchedulerToolsTarget & { start(): Promise<void>; stop(): void } =
  noopScheduler;

export function setGlobalScheduler(scheduler: Scheduler): void {
  globalScheduler = scheduler;
}
