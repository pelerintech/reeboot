/**
 * EnabledSkillsStore — SDK-agnostic enabled-set store.
 *
 * Persists the user's on/off set of user-facing skills to a small JSON file
 * ({ enabled: string[] }). The file is the single source of truth shared by the
 * REST layer (writes) and the skill-manager extension (reads). It is live-read:
 * every read re-reads the file so a write from another instance (or the UI) is
 * observed on the next call — no restart needed.
 *
 * No pi/ree imports. Ports to any SDK.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { Config } from '../config.js';
import { listUserSkills } from './catalog.js';

export const DEFAULT_ENABLED_STATE_PATH = join(homedir(), '.reeboot', 'skills-state.json');

/** Resolve the enabled-state file path (config-drivable, shared by REST + extension). */
export function enabledStatePath(config?: Config): string {
  const path = (config?.skills as any)?.enabled_state_path;
  return path && path.length > 0 ? path : DEFAULT_ENABLED_STATE_PATH;
}

/**
 * Build the shared enabled-set store. Defaults to all user-facing skills
 * enabled when no state file exists yet, so the REST layer and the extension
 * agree on the single source of truth.
 */
export function createSkillsStore(config?: Config): EnabledSkillsStore {
  const defaults = listUserSkills(config).map((s) => s.name);
  return new EnabledSkillsStore(enabledStatePath(config), config, defaults);
}

export class EnabledSkillsStore {
  private readonly path: string;
  private readonly permanentDefault: string[];
  private readonly defaultNames: string[];

  constructor(path?: string, config?: Config, defaultNames: string[] = []) {
    this.path = path ?? enabledStatePath(config);
    this.permanentDefault = ((config?.skills as any)?.permanent ?? []) as string[];
    this.defaultNames = defaultNames;
  }

  /** Read the current enabled set from disk, or fall back to default. */
  private readFromDisk(): string[] {
    if (existsSync(this.path)) {
      try {
        const raw = JSON.parse(readFileSync(this.path, 'utf-8'));
        if (Array.isArray(raw?.enabled)) return raw.enabled as string[];
      } catch {
        // corrupted — fall back to default
      }
    }
    if (this.permanentDefault.length > 0) return [...this.permanentDefault];
    return [...this.defaultNames];
  }

  /** Current enabled skill names (live read from disk every call). */
  getEnabled(): string[] {
    return [...new Set(this.readFromDisk())];
  }

  isEnabled(name: string): boolean {
    return this.getEnabled().includes(name);
  }

  /** Returns a map name → enabled for the given candidate names. */
  toMap(names: string[]): Record<string, boolean> {
    const enabled = new Set(this.getEnabled());
    const out: Record<string, boolean> = {};
    for (const name of names) out[name] = enabled.has(name);
    return out;
  }

  /** Set a skill's enabled state and persist immediately. */
  setEnabled(name: string, enabled: boolean): void {
    const set = new Set(this.readFromDisk());
    if (enabled) set.add(name);
    else set.delete(name);
    const arr = Array.from(set).sort();
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(this.path, JSON.stringify({ enabled: arr }, null, 2), 'utf-8');
    } catch {
      // best-effort persist; log-and-continue
    }
  }
}
