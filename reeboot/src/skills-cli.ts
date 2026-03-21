/**
 * Skills CLI helper — extracted so tests can import without subprocess spawn.
 * Used by `reeboot skills list` and `reeboot skills update`.
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

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

// ─── getSkillsUpdateMessage ───────────────────────────────────────────────────

/**
 * Return the stub message for `reeboot skills update`.
 */
export function getSkillsUpdateMessage(skillsDir: string): string {
  const count = listBundledSkills(skillsDir).length;
  return `Extended skill catalog update coming soon. Currently using ${count} bundled skills.`;
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
