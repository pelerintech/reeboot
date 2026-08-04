/**
 * Hot-memory routing coordinator.
 *
 * The memory-manager extension sets whether reeboot should run its own hot-memory
 * wiring based on the ACTIVE provider's capability declaration. The hot-memory
 * extension reads this flag so a provider that self-serves retrieval (e.g. dreem)
 * prevents reeboot's own hot-memory from running.
 *
 * Module-level state shared across extensions (not persisted).
 */

let reebootHotMemoryEnabled = true;

/** Set whether reeboot runs its own hot-memory (false = provider self-serves). */
export function setReebootHotMemoryEnabled(enabled: boolean): void {
  reebootHotMemoryEnabled = enabled;
}

/** Whether reeboot's own hot-memory wiring should run for the active provider. */
export function isReebootHotMemoryEnabled(): boolean {
  return reebootHotMemoryEnabled;
}
