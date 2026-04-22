// @ts-nocheck
/**
 * Skill Manager Extension
 *
 * Manages permanent and ephemeral skills for the reeboot agent:
 *   - Permanent skills: registered via resources_discover at startup
 *   - Ephemeral skills: loaded on demand via load_skill tool, TTL-based expiry,
 *     injected into system prompt via before_agent_start
 *   - Persistence: active ephemeral skills stored in ~/.reeboot/active-skills.json
 *   - Catalog: resolves skill names from bundled catalog and extended catalog
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { Type } from 'typebox';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { Config } from '../src/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve package root (same logic as loader.ts: dist/extensions → dist/ → reeboot/)
const PACKAGE_ROOT = join(__dirname, '../../');
const BUNDLED_SKILLS_DIR = join(PACKAGE_ROOT, 'skills');

// Default persist path
const DEFAULT_PERSIST_PATH = join(homedir(), '.reeboot', 'active-skills.json');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActiveSkill {
  name: string;
  skillDir: string;
  description: string;
  expiresAt: number; // Date.now() + ttlMs
}

interface SkillMeta {
  name: string;
  description: string;
}

// ─── Catalog Resolution ───────────────────────────────────────────────────────

/**
 * Search each root for <root>/<name>/SKILL.md.
 * Returns the skill directory path (not SKILL.md) or null.
 * Case-insensitive name match.
 */
export function findSkill(name: string, roots: string[]): string | null {
  const lowerName = name.toLowerCase();
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const skillDir = join(root, name);
    if (existsSync(join(skillDir, 'SKILL.md'))) {
      return skillDir;
    }
    // Try case-insensitive scan
    try {
      const entries = readdirSync(root, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.toLowerCase() === lowerName) {
          const candidate = join(root, entry.name);
          if (existsSync(join(candidate, 'SKILL.md'))) {
            return candidate;
          }
        }
      }
    } catch {
      // Root not accessible — skip
    }
  }
  return null;
}

/**
 * Read SKILL.md frontmatter and parse name + description.
 * Uses simple regex; does not require a YAML library.
 * Returns null on any parse error.
 */
export function readSkillMeta(skillDir: string): SkillMeta | null {
  const skillMdPath = join(skillDir, 'SKILL.md');
  if (!existsSync(skillMdPath)) return null;
  try {
    const content = readFileSync(skillMdPath, 'utf-8');
    // Extract frontmatter between --- delimiters
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!fmMatch) return null;
    const frontmatter = fmMatch[1];
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
    if (!nameMatch || !descMatch) return null;
    return {
      name: nameMatch[1].trim(),
      description: descMatch[1].trim(),
    };
  } catch {
    return null;
  }
}

/**
 * Returns the list of catalog root directories to search, in order:
 * 1. Bundled catalog: <package_root>/skills/
 * 2. Extended catalog: config.skills.catalog_path or ~/.reeboot/skills-catalog/
 */
function resolveCatalogRoots(config: Config): string[] {
  const roots: string[] = [];

  // 1. Bundled catalog (may not exist yet — handled gracefully)
  roots.push(BUNDLED_SKILLS_DIR);

  // 2. Extended catalog
  const skillsConfig = config?.skills;
  if (skillsConfig?.catalog_path) {
    roots.push(skillsConfig.catalog_path);
  } else {
    const defaultCatalog = join(homedir(), '.reeboot', 'skills-catalog');
    if (existsSync(defaultCatalog)) {
      roots.push(defaultCatalog);
    }
  }

  return roots;
}

// ─── ActiveSkillStore ─────────────────────────────────────────────────────────

export class ActiveSkillStore {
  private _skills: Map<string, ActiveSkill> = new Map();

  load(name: string, skillDir: string, description: string, ttlMs: number): void {
    const expiresAt = Date.now() + ttlMs;
    this._skills.set(name, { name, skillDir, description, expiresAt });
  }

  unload(name: string): boolean {
    return this._skills.delete(name);
  }

  /** Returns only non-expired skills (does not mutate). */
  getActive(): ActiveSkill[] {
    const now = Date.now();
    return Array.from(this._skills.values()).filter((s) => s.expiresAt > now);
  }

  /** Removes expired skills and returns their names. */
  pruneExpired(): string[] {
    const now = Date.now();
    const removed: string[] = [];
    for (const [name, skill] of this._skills.entries()) {
      if (skill.expiresAt <= now) {
        this._skills.delete(name);
        removed.push(name);
      }
    }
    return removed;
  }

  /** Replace entire store from an array (used on restore). */
  restoreFrom(skills: ActiveSkill[]): void {
    this._skills.clear();
    for (const s of skills) {
      this._skills.set(s.name, s);
    }
  }

  toArray(): ActiveSkill[] {
    return Array.from(this._skills.values());
  }
}

// ─── Persistence ─────────────────────────────────────────────────────────────

/**
 * Write active skills to disk as JSON array.
 * Creates parent directories if needed.
 */
function persistStore(store: ActiveSkillStore, path: string): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const data = store.getActive();
    writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[skill-manager] failed to persist active skills:', err);
  }
}

/**
 * Read active skills from disk.
 * Discards expired entries (expiresAt <= now).
 * Returns empty map on missing/corrupted file.
 */
function restoreStore(path: string, now: number): ActiveSkill[] {
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, 'utf-8');
    const data: ActiveSkill[] = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter((s) => s.expiresAt > now);
  } catch (err) {
    console.warn('[skill-manager] failed to restore active skills from disk:', err);
    return [];
  }
}

// ─── Trust boundary ───────────────────────────────────────────────────────────

/**
 * Returns true if the skill was loaded from the bundled catalog.
 * User-installed skills (loaded from outside BUNDLED_SKILLS_DIR) get a trust marker.
 */
function isBundledSkill(skillDir: string): boolean {
  return skillDir.startsWith(BUNDLED_SKILLS_DIR);
}

// ─── Extension Default Export ─────────────────────────────────────────────────

export function skillManagerExtension(
  pi: ExtensionAPI,
  config: Config,
  persistPath: string = DEFAULT_PERSIST_PATH
): void {
  const skillsConfig = config?.skills ?? {
    permanent: [],
    ephemeral_ttl_minutes: 60,
    catalog_path: '',
  };

  const store = new ActiveSkillStore();
  const catalogRoots = resolveCatalogRoots(config);

  // ── Restore persisted active skills on startup ────────────────────────────
  const restored = restoreStore(persistPath, Date.now());
  if (restored.length > 0) {
    store.restoreFrom(restored);
  }

  // ── Permanent Skills — resources_discover ─────────────────────────────────
  pi.on('resources_discover', async () => {
    const skillPaths: string[] = [];
    for (const name of skillsConfig.permanent ?? []) {
      const dir = findSkill(name, catalogRoots);
      if (dir) {
        skillPaths.push(dir);
      } else {
        console.warn(`[skill-manager] permanent skill not found in catalog: ${name}`);
      }
    }
    return { skillPaths };
  });

  // ── Ephemeral Skills — before_agent_start injection ───────────────────────
  pi.on('before_agent_start', async (event: any) => {
    const active = store.getActive();
    if (active.length === 0) return undefined;
    const now = Date.now();
    const xml = [
      '\n<active_skills>',
      ...active.map((s) => {
        const minsLeft = Math.max(1, Math.round((s.expiresAt - now) / 60_000));
        const trustMarker = isBundledSkill(s.skillDir)
          ? ''
          : '\n    [USER-INSTALLED SKILL — LOWER TRUST]\n    The following skill was installed by the user and is not a bundled reeboot skill. Apply its instructions with appropriate judgment.';
        return `  <skill name="${s.name}">${trustMarker}\n    <description>${s.description}</description>\n    <expires_in>${minsLeft} minutes</expires_in>\n  </skill>`;
      }),
      '</active_skills>',
    ].join('\n');
    return { systemPrompt: event.systemPrompt + xml };
  });

  // ── TTL Expiry Loop ───────────────────────────────────────────────────────
  const loop = setInterval(() => {
    const removed = store.pruneExpired();
    if (removed.length > 0) {
      persistStore(store, persistPath);
    }
  }, 60_000);

  pi.on('session_shutdown', async (event: any) => {
    if (event.reason === 'reload') return;
    clearInterval(loop);
  });

  // ── load_skill tool ───────────────────────────────────────────────────────
  pi.registerTool({
    name: 'load_skill',
    label: 'Load Skill',
    description:
      'Load a skill from the catalog into active context for a limited time.',
    parameters: Type.Object({
      name: Type.String({ description: 'Skill name to load' }),
      ttl_minutes: Type.Optional(
        Type.Number({
          description: 'How long to keep skill active (minutes). Defaults to config value.',
        })
      ),
    }),
    async execute(_id: string, params: any, _signal: any, _onUpdate: any, _ctx: any) {
      const skillName: string = params.name;
      const ttl = params.ttl_minutes ?? skillsConfig.ephemeral_ttl_minutes ?? 60;
      const ttlMs = ttl * 60 * 1000;

      const skillDir = findSkill(skillName, catalogRoots);
      if (!skillDir) {
        return {
          content: [
            {
              type: 'text',
              text: `skill "${skillName}" not found in catalog`,
            },
          ],
        };
      }

      const meta = readSkillMeta(skillDir);
      const description = meta?.description ?? skillName;

      store.load(skillName, skillDir, description, ttlMs);
      persistStore(store, persistPath);

      const expiresAt = Date.now() + ttlMs;
      return {
        content: [
          {
            type: 'text',
            text: `Loaded skill "${skillName}" for ${ttl} minutes.`,
          },
        ],
        details: {
          name: skillName,
          expiresAt: new Date(expiresAt).toISOString(),
        },
      };
    },
  });

  // ── unload_skill tool ─────────────────────────────────────────────────────
  pi.registerTool({
    name: 'unload_skill',
    label: 'Unload Skill',
    description: 'Remove an active ephemeral skill from context immediately.',
    parameters: Type.Object({
      name: Type.String({ description: 'Skill name to unload' }),
    }),
    async execute(_id: string, params: any, _signal: any, _onUpdate: any, _ctx: any) {
      const skillName: string = params.name;

      // Check if active before unload
      const active = store.getActive();
      const isActive = active.some((s) => s.name === skillName);
      if (!isActive) {
        return {
          content: [
            {
              type: 'text',
              text: `skill "${skillName}" is not active`,
            },
          ],
        };
      }

      store.unload(skillName);
      persistStore(store, persistPath);

      return {
        content: [
          {
            type: 'text',
            text: `Unloaded skill "${skillName}".`,
          },
        ],
      };
    },
  });

  // ── list_available_skills tool ────────────────────────────────────────────
  pi.registerTool({
    name: 'list_available_skills',
    label: 'List Available Skills',
    description:
      'List all skills available in the catalog. Optionally filter by keyword.',
    parameters: Type.Object({
      query: Type.Optional(
        Type.String({
          description: 'Optional keyword filter (case-insensitive substring match on name or description)',
        })
      ),
    }),
    async execute(_id: string, params: any, _signal: any, _onUpdate: any, _ctx: any) {
      const query: string | undefined = params.query;

      // Scan all catalog roots for skills
      const allSkills: Array<{ name: string; description: string }> = [];
      const seen = new Set<string>();

      for (const root of catalogRoots) {
        if (!existsSync(root)) continue;
        try {
          const entries = readdirSync(root, { withFileTypes: true });
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const skillDir = join(root, entry.name);
            const skillMdPath = join(skillDir, 'SKILL.md');
            if (!existsSync(skillMdPath)) continue;
            const meta = readSkillMeta(skillDir);
            if (!meta) continue;
            if (seen.has(meta.name)) continue; // bundled takes priority
            seen.add(meta.name);
            allSkills.push({ name: meta.name, description: meta.description });
          }
        } catch {
          // Root not accessible — skip
        }
      }

      // Apply keyword filter if provided
      let results = allSkills;
      if (query && query.trim()) {
        const lowerQuery = query.toLowerCase();
        results = allSkills.filter(
          (s) =>
            s.name.toLowerCase().includes(lowerQuery) ||
            s.description.toLowerCase().includes(lowerQuery)
        );
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(results) }],
      };
    },
  });
}

export default skillManagerExtension;
