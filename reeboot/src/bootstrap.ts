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
import { scanDependencies } from './security/advisory-scanner.js';
import { join } from 'path';
import type { Scheduler } from './scheduler.js';

// Resolve paths relative to the reeboot package root
function getPackageRoot(): string {
  // The bootstrap runs from the compiled dist/ or via vitest from src/
  // Try to find package-lock.json relative to the reeboot package
  return join(import.meta.dirname, '..');
}

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

  // Supply chain advisory scan
  try {
    const root = getPackageRoot();
    const lockfilePath = join(root, 'package-lock.json');
    const advisoriesPath = join(root, 'src', 'security', 'advisories.json');
    const advisories = scanDependencies(lockfilePath, advisoriesPath);

    if (advisories.length > 0) {
      const acked: string[] = config?.security?.advisories?.acked_advisories ?? [];
      for (const adv of advisories) {
        if (acked.includes(adv.id)) {
          // Acknowledged — skip warning and banner at startup
          continue;
        }
        log.warn({
          component: 'advisory-scanner',
          advisoryId: adv.id,
          package: adv.package,
          version: adv.version,
        }, `⚠ Package '${adv.package}' v${adv.version} matches advisory ${adv.id}. Run 'reeboot doctor' for details.`);
        // Print banner to stdout
        console.warn(`⚠ Package '${adv.package}' v${adv.version} matches advisory ${adv.id}. Run 'reeboot doctor' for details.`);
      }
    }
  } catch (err: unknown) {
    log.error({ component: 'bootstrap', err }, 'Failed to run advisory scan');
  }
}
