/**
 * Global Scheduler registry singleton.
 * Set by server.ts after the Scheduler is initialised.
 */

import type { SchedulerToolsTarget } from './scheduler.js';

// Stub scheduler that no-ops until a real one is registered
const noopScheduler: SchedulerToolsTarget = {
  registerJob: () => {},
  cancelJob: () => {},
};

export let globalScheduler: SchedulerToolsTarget = noopScheduler;

export function setGlobalScheduler(scheduler: SchedulerToolsTarget): void {
  globalScheduler = scheduler;
}
