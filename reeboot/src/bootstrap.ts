/**
 * Bootstrap — Central server jobs registration.
 *
 * Called by server.ts after the Scheduler is initialised and setGlobalScheduler()
 * has been called. Owns the authoritative list of what server-level background
 * jobs to register at boot.
 *
 * Adding a new background job:
 *   1. Export registerServerJobs() from the extension file
 *   2. Add one import + one call in bootstrapServerJobs() below
 */

import type Database from 'better-sqlite3';
import { getLogger } from './observability/logger.js';
import { registerServerJobs as memoryServerJobs } from './extensions/memory-manager.js';
import { registerServerJobs as knowledgeServerJobs } from './extensions/knowledge-manager.js';
import type { Scheduler } from './scheduler.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function bootstrapServerJobs(db: Database.Database, scheduler: Scheduler, config: any): void {
  const log = getLogger();

  // Memory consolidation
  try {
    memoryServerJobs(db, scheduler, config);
    log.info({ component: 'bootstrap' }, 'Registered memory consolidation job');
  } catch (err: unknown) {
    log.error({ component: 'bootstrap', err }, 'Failed to register memory consolidation job');
  }

  // Knowledge wiki lint
  try {
    knowledgeServerJobs(db, scheduler, config);
    log.info({ component: 'bootstrap' }, 'Registered knowledge lint job');
  } catch (err: unknown) {
    log.error({ component: 'bootstrap', err }, 'Failed to register knowledge lint job');
  }
}
