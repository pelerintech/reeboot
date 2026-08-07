/**
 * Skill upload pipeline — validate, extract to temp, re-validate, promote.
 *
 * Layer 1 only: package validation + promotion. Content trust (Layer 2) is
 * delegated to existing agent security policies. SDK-agnostic.
 */
import AdmZip from 'adm-zip';
import { mkdtempSync, rmSync, mkdirSync, cpSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { validateSkillZip } from './zip-validate.js';
import { readSkillMeta, listUserSkills, uploadCatalogDir, type CatalogSkill } from './catalog.js';
import type { Config } from '../config.js';

export interface PromoteResult {
  ok: boolean;
  error?: string;
  name?: string;
  description?: string;
}

/**
 * Validate and promote a zip into the upload catalog.
 * - Runs the Layer-1 zip validation (no extraction before it passes).
 * - Extracts into a temp dir, re-checks SKILL.md + frontmatter.
 * - Rejects a name collision with any existing user-facing skill.
 * - Promotes into <uploadDir>/<name>/.
 */
export function promoteSkillZip(buffer: Buffer, config?: Config, uploadDirOverride?: string): PromoteResult {
  const validated = validateSkillZip(buffer);
  if (!validated.ok) return { ok: false, error: validated.error };

  const uploadDir = uploadDirOverride ?? uploadCatalogDir(config);

  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    return { ok: false, error: 'Invalid zip archive' };
  }

  const tmp = mkdtempSync(join(tmpdir(), 'reeboot-skill-upload-'));
  try {
    // Bounded extraction (validation already capped entries + expanded size).
    zip.extractAllTo(tmp, true);

    // Re-validate extracted result: SKILL.md + valid frontmatter.
    const meta = readSkillMeta(tmp);
    if (!meta) {
      return { ok: false, error: 'SKILL.md is missing or lacks valid name/description frontmatter' };
    }
    const name = meta.name;

    // Name collision with any existing user-facing skill (bundled or uploaded).
    const existing = listUserSkills(config).map((s) => s.name.toLowerCase());
    if (existing.includes(name.toLowerCase())) {
      return { ok: false, error: `A skill named "${name}" already exists` };
    }

    // Promote into <uploadDir>/<name>/.
    const dest = join(uploadDir, name);
    try {
      mkdirSync(dest, { recursive: true });
      cpSync(tmp, dest, { recursive: true });
    } catch (err: any) {
      return { ok: false, error: `Failed to promote skill: ${err?.message ?? 'unknown error'}` };
    }

    return { ok: true, name, description: meta.description };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Absolute path of a skill dir in the upload catalog by name (or null). */
export function uploadedSkillDir(name: string, config?: Config, override?: string): string | null {
  const uploadDir = override ?? uploadCatalogDir(config);
  return join(uploadDir, name);
}

/** Find a user-uploaded skill's catalog entry by dir (for DELETE). */
export function findUploadedSkill(name: string, config?: Config, override?: string): CatalogSkill | null {
  const uploadDir = override ?? uploadCatalogDir(config);
  const entry = listUserSkills(config).find(
    (s) => s.source === 'user' && s.name.toLowerCase() === name.toLowerCase()
  );
  if (!entry || !entry.skillDir) return null;
  if (!entry.skillDir.startsWith(uploadDir)) return null;
  return entry;
}
