/**
 * Deterministic event-loop drain helper.
 *
 * Replaces ad-hoc `await new Promise(r => setTimeout(r, N))` real wall-clock
 * waits in tests. Drains pending microtasks and macrotask passes without
 * waiting on a wall-clock interval, so tests are not timing-dependent.
 *
 * NOTE: this does NOT advance real timers (e.g. a production `setTimeout`
 * backoff). For tests that must fire a real timer-scheduled callback, use
 * `vi.useFakeTimers()` + `advanceTimersByTimeAsync` instead.
 */
import { setImmediate as awaitImmediate } from 'timers/promises';

export async function drainEventLoop(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve(); // flush the microtask queue
    await awaitImmediate(); // flush one macrotask/I/O pass
  }
}
