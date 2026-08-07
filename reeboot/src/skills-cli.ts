/**
 * Skills CLI helper — extracted so tests can import without subprocess spawn.
 * Used by `reeboot skills list` and `reeboot skills update`.
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  configuredCatalogUrl,
  fetchCatalogIndex,
  listAvailable,
  installCatalogSkill,
} from './skills/remote-catalog.js';
import type { Config } from './config.js';

// ─── types ────────────────────────────────────────────────────────────────────

export interface SkillEntry {
  name: string;
  description: string;
}

// ─── listBundledSkills ────────────────────────────────────────────────────────

/**
 * Scan a skills directory, parse YAML frontmatter from each SKILL.md,
 * and return sorted entries.
 */
export function listBundledSkills(skillsDir: string): SkillEntry[] {
  if (!existsSync(skillsDir)) return [];

  return readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
      const skillMd = join(skillsDir, d.name, 'SKILL.md');
      if (!existsSync(skillMd)) return null;
      const content = readFileSync(skillMd, 'utf-8');
      const descMatch = content.match(/^description:\s*(.+)$/m);
      return {
        name: d.name,
        description: descMatch?.[1]?.trim() ?? '',
      };
    })
    .filter((entry): entry is SkillEntry => entry !== null && entry.description.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ─── updateSkillCatalog ──────────────────────────────────────────────────

/**
 * Fetch + install the curated remote catalog for `reeboot skills update`.
 * Reads the catalog address from `config.skills.catalog_url` (never hardcoded).
 * If unset, reports "no remote catalog configured" without erroring.
 * Returns a summary ready for the CLI to print; exit code is the caller's
 * concern (command keeps exit 0, matching the previous stub).
 */
export async function updateSkillCatalog(
  config?: Config,
  deps: { fetcher?: (u: string) => Promise<Response> } = {}
): Promise<{ ok: boolean; message: string }> {
  const url = configuredCatalogUrl(config);
  if (!url) {
    return {
      ok: true,
      message: 'No remote catalog configured. Set skills.catalog_url in config.json to enable the curated catalog.',
    };
  }

  const fetched = await fetchCatalogIndex(url, deps.fetcher);
  if (!fetched.ok || !fetched.index) {
    return { ok: false, message: fetched.error ?? 'Catalog fetch failed' };
  }

  const available = listAvailable(fetched.index, config);
  const skipped = available.filter((e) => e.collision).map((e) => e.name);
  const installed: string[] = [];
  const failed: string[] = [];
  for (const entry of available) {
    if (entry.collision) continue;
    const res = await installCatalogSkill(entry.name, { index: fetched.index, config, fetcher: deps.fetcher });
    if (res.ok && res.name) installed.push(res.name);
    else failed.push(entry.name);
  }

  let message = `Fetched ${available.length} catalog entries.`;
  message += installed.length ? ` Installed: ${installed.join(', ')}.` : ' Nothing to install.';
  if (skipped.length) message += ` Skipped (already present): ${skipped.join(', ')}.`;
  if (failed.length) message += ` Failed: ${failed.join(', ')}.`;
  return { ok: failed.length === 0, message };
}

// ─── printSkillsList ──────────────────────────────────────────────────────────

/**
 * Print the skills list table to stdout.
 */
export function printSkillsList(skillsDir: string): void {
  const skills = listBundledSkills(skillsDir);
  if (skills.length === 0) {
    console.log('No bundled skills found.');
    return;
  }
  const nameWidth = Math.max(...skills.map(s => s.name.length), 4);
  console.log(`${'Name'.padEnd(nameWidth)}  Description`);
  console.log(`${'─'.repeat(nameWidth)}  ${'─'.repeat(60)}`);
  for (const s of skills) {
    console.log(`${s.name.padEnd(nameWidth)}  ${s.description}`);
  }
}
