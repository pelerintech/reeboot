/**
 * Global Scheduler registry singleton.
 * Set by server.ts after the Scheduler is initialised.
 */
export { startHeartbeat, stopHeartbeat } from './scheduler/heartbeat.js';
// Stub scheduler that no-ops until a real one is registered
const noopScheduler = {
    registerJob: () => { },
    cancelJob: () => { },
    start: async () => { },
    stop: () => { },
};
export let globalScheduler = noopScheduler;
export function setGlobalScheduler(scheduler) {
    globalScheduler = scheduler;
}
