/**
 * Skills catalog — SDK-agnostic.
 *
 * Owns the physical catalog layout and the boundary between user-facing skills
 * and internal/harness skills:
 *
 *   <package>/skills/            user-facing bundled skills (github, gmail, ...)
 *   <package>/skills/internal/   internal/harness skills (always in context,
 *                                never user-manageable, never in the catalog)
 *   ~/.reeboot/skills-catalog/   user-uploaded skills
 *
 * Everything a user sees/toggles/loads comes from the *user catalog* (bundled
 * user-facing + uploaded). Internal skills are physically separate and excluded
 * by construction. This module has no pi/ree imports so it ports to any SDK.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, dirname, resolve, sep } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import type { Config } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// <package>/ (dist/skills → dist → package ; src/skills → src → package)
const PACKAGE_ROOT = resolve(__dirname, '../..');

/** The physical folder that holds internal/harness skills. */
export const INTERNAL_SKILLS_DIR = join(PACKAGE_ROOT, 'skills', 'internal');

/** The bundled user-facing skills folder (contains internal/ as a subfolder). */
export const BUNDLED_USER_SKILLS_DIR = join(PACKAGE_ROOT, 'skills');

/** Directory name of the internal folder (excluded from the user catalog scan). */
export const INTERNAL_DIR_NAME = 'internal';

/** Internal/harness skill names — never user-manageable, never in the catalog. */
export const INTERNAL_SKILL_NAMES: string[] = [
  'visual-charting',
  'visual-planning',
  'web-research',
  'send-message',
  'reeboot-tasks',
];

export interface SkillMeta {
  name: string;
  description: string;
}

export type SkillSource = 'bundled' | 'user' | 'remote';

export interface CatalogSkill extends SkillMeta {
  source: SkillSource;
  /** Absolute path to the skill dir (or null for loose internal md). */
  skillDir: string | null;
}

/** Default upload catalog root. */
export function defaultUploadCatalogDir(): string {
  return join(homedir(), '.reeboot', 'skills-catalog');
}

/** Default remote catalog root. */
export function defaultRemoteCatalogDir(): string {
  return join(homedir(), '.reeboot', 'skills-remote');
}

/** Resolve the upload catalog root (where uploaded skills are promoted). */
export function uploadCatalogDir(config?: Config): string {
  const catalogPath = (config?.skills as any)?.catalog_path;
  if (catalogPath && catalogPath.length > 0) return catalogPath;
  return defaultUploadCatalogDir();
}

/** Resolve the remote catalog root (where remote-installed skills are promoted). */
export function remoteCatalogDir(config?: Config): string {
  const remotePath = (config?.skills as any)?.remote_catalog_path;
  if (remotePath && remotePath.length > 0) return remotePath;
  return defaultRemoteCatalogDir();
}

/**
 * Resolve the user catalog roots, in order (bundled takes priority):
 *  1. bundled user-facing skills (skills/ minus internal/)
 *  2. remote-installed skills (config.skills.remote_catalog_path or
 *     ~/.reeboot/skills-remote)
 *  3. uploaded skills (config.skills.catalog_path or ~/.reeboot/skills-catalog)
 */
export function resolveUserCatalogRoots(config?: Config): { root: string; source: SkillSource }[] {
  const roots: { root: string; source: SkillSource }[] = [];
  roots.push({ root: BUNDLED_USER_SKILLS_DIR, source: 'bundled' });

  const skillsConfig = config?.skills as any;
  if (skillsConfig?.remote_catalog_path) {
    roots.push({ root: skillsConfig.remote_catalog_path, source: 'remote' });
  } else {
    const defaultRemote = defaultRemoteCatalogDir();
    if (existsSync(defaultRemote)) {
      roots.push({ root: defaultRemote, source: 'remote' });
    }
  }

  if (skillsConfig?.catalog_path) {
    roots.push({ root: skillsConfig.catalog_path, source: 'user' });
  } else {
    const defaultCatalog = defaultUploadCatalogDir();
    if (existsSync(defaultCatalog)) {
      roots.push({ root: defaultCatalog, source: 'user' });
    }
  }
  return roots;
}

/** True if the given directory path is inside the internal skills folder. */
export function isInternalSkillDir(skillDir: string): boolean {
  return skillDir.startsWith(INTERNAL_SKILLS_DIR + sep);
}

/** True if the given skill name is a known internal/harness skill. */
export function isInternalSkillName(name: string): boolean {
  return INTERNAL_SKILL_NAMES.includes(name);
}

/** Read a skill's SKILL.md frontmatter (name + description). Null on parse error. */
export function readSkillMeta(skillDir: string): SkillMeta | null {
  const skillMdPath = join(skillDir, 'SKILL.md');
  if (!existsSync(skillMdPath)) return null;
  try {
    const content = readFileSync(skillMdPath, 'utf-8');
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!fmMatch) return null;
    const frontmatter = fmMatch[1];
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
    if (!nameMatch || !descMatch) return null;
    return { name: nameMatch[1].trim(), description: descMatch[1].trim() };
  } catch {
    return null;
  }
}

/**
 * Scan a single root for skill directories (<root>/<name>/SKILL.md).
 * Returns the resolved skill dirs.
 */
function scanRoot(root: string, opts: { skipInternal?: boolean } = {}): string[] {
  if (!existsSync(root)) return [];
  const dirs: string[] = [];
  try {
    const entries = readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (opts.skipInternal && entry.name === INTERNAL_DIR_NAME) continue;
      const skillDir = join(root, entry.name);
      if (existsSync(join(skillDir, 'SKILL.md'))) {
        dirs.push(skillDir);
      }
    }
  } catch {
    // root not accessible — skip
  }
  return dirs;
}

/**
 * List all user-facing skills (bundled + uploaded), excluding internal.
 * Returns entries in a stable order: bundled first, then uploaded (alphabetical).
 */
export function listUserSkills(config?: Config): CatalogSkill[] {
  const roots = resolveUserCatalogRoots(config);
  const result: CatalogSkill[] = [];
  const seen = new Set<string>();

  // First root is bundled — skip internal folder.
  for (let i = 0; i < roots.length; i++) {
    const skipInternal = i === 0;
    const source: SkillSource = roots[i].source;
    for (const skillDir of scanRoot(roots[i].root, { skipInternal })) {
      const meta = readSkillMeta(skillDir);
      if (!meta) continue;
      if (seen.has(meta.name)) continue; // bundled takes priority
      seen.add(meta.name);
      result.push({ name: meta.name, description: meta.description, source, skillDir });
    }
  }
  return result;
}

/**
 * Resolve the internal/harness skills (dirs with SKILL.md inside the internal
 * folder), with their metadata. Loose internal `.md` files (no SKILL.md) are
 * not loadable skills and are excluded.
 */
export function resolveInternalSkillDirs(): CatalogSkill[] {
  const result: CatalogSkill[] = [];
  for (const skillDir of scanRoot(INTERNAL_SKILLS_DIR)) {
    const meta = readSkillMeta(skillDir);
    if (!meta) continue;
    result.push({ name: meta.name, description: meta.description, source: 'bundled', skillDir });
  }
  return result;
}

/**
 * Search the user catalog for a skill by name (bundled first). Case-insensitive.
 * Returns the skill dir or null. Never matches internal skills.
 */
export function findUserSkill(name: string, config?: Config): string | null {
  const lowerName = name.toLowerCase();
  const roots = resolveUserCatalogRoots(config);
  for (let i = 0; i < roots.length; i++) {
    const skipInternal = i === 0;
    const found = findSkillInRoot(name, lowerName, roots[i].root, skipInternal);
    if (found) return found;
  }
  return null;
}

function findSkillInRoot(name: string, lowerName: string, root: string, skipInternal: boolean): string | null {
  if (!existsSync(root)) return null;
  // direct match
  const direct = join(root, name);
  if (!(skipInternal && name === INTERNAL_DIR_NAME) && existsSync(join(direct, 'SKILL.md'))) {
    return direct;
  }
  // case-insensitive scan
  try {
    const entries = readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (skipInternal && entry.name === INTERNAL_DIR_NAME) continue;
      if (entry.name.toLowerCase() === lowerName) {
        const candidate = join(root, entry.name);
        if (existsSync(join(candidate, 'SKILL.md'))) return candidate;
      }
    }
  } catch {
    // skip
  }
  return null;
}

/**
 * Resolve a skill dir that is *deletable* — i.e. in a user or remote root
 * (not bundled, not internal). Mirrors decision D6: `user` and `remote` skills
 * are deletable; `bundled` are not. Returns the dir and its source.
 */
export function findDeletableSkill(
  name: string,
  config?: Config
): { skillDir: string; source: SkillSource } | null {
  const lowerName = name.toLowerCase();
  const roots = resolveUserCatalogRoots(config);
  for (let i = 1; i < roots.length; i++) {
    // Skip the bundled root (index 0) — bundled skills are never deletable.
    const { root, source } = roots[i];
    const found = findSkillInRoot(name, lowerName, root, false);
    if (found) return { skillDir: found, source };
  }
  return null;
}
