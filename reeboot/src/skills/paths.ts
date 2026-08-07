/**
 * Active skill paths computation — SDK-agnostic.
 *
 * Computes the set of skill directory paths that should be handed to an SDK
 * (pi's `additionalSkillPaths`) so the agent only sees enabled user skills and
 * internal skills. This replaces passing the whole catalog dir.
 */
import { listUserSkills, resolveInternalSkillDirs, INTERNAL_SKILLS_DIR } from './catalog.js';
import { createSkillsStore } from './enabled-store.js';
import type { Config } from '../config.js';

/**
 * Pure helper: given the enabled user skill names, the internal skill names,
 * and a name→dir catalog map, return the active paths (internal + enabled,
 * excluding disabled user skills), deduped.
 */
export function computeActiveSkillPaths(
  enabled: string[],
  internal: string[],
  catalog: Record<string, string>
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const name of enabled) {
    const dir = catalog[name];
    if (dir && !seen.has(dir)) {
      seen.add(dir);
      out.push(dir);
    }
  }
  for (const name of internal) {
    const dir = catalog[name];
    if (dir && !seen.has(dir)) {
      seen.add(dir);
      out.push(dir);
    }
  }
  return out;
}

/**
 * Resolve the active skill paths for a config:
 *  - enabled user skills (from the shared enabled store)
 *  - internal skills (always in)
 */
export function activeSkillPaths(config?: Config): string[] {
  const userSkills = listUserSkills(config);
  const internal = resolveInternalSkillDirs();
  const catalog: Record<string, string> = {};
  for (const s of userSkills) {
    if (s.skillDir) catalog[s.name] = s.skillDir;
  }
  for (const entry of internal) {
    if (entry.skillDir) catalog[entry.name] = entry.skillDir;
  }
  const enabled = createSkillsStore(config).getEnabled();
  return computeActiveSkillPaths(enabled, internal.map((i) => i.name), catalog);
}

/** Absolute path of the internal skills folder (for loader passthrough). */
export function internalSkillsRoot(): string {
  return INTERNAL_SKILLS_DIR;
}
