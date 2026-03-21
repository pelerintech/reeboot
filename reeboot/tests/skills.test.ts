/**
 * Skills catalog tests (reeboot-skills change) — TDD red/green
 *
 * Tasks 1.1–1.4: catalog structure, CLI commands, content quality.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// skills/ lives at reeboot/skills/ — one level up from tests/
const SKILLS_DIR = resolve(__dirname, '../skills');

// ─── helpers ─────────────────────────────────────────────────────────────────

function getSkillDirs(): string[] {
  if (!existsSync(SKILLS_DIR)) return [];
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
}

function readSkillMd(skillName: string): string | null {
  const p = join(SKILLS_DIR, skillName, 'SKILL.md');
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf-8');
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    result[key] = value;
  }
  return result;
}

// ─── 1.1 catalog structure ───────────────────────────────────────────────────

const EXPECTED_SKILLS = [
  'docker',
  'files',
  'gcal',
  'gdrive',
  'github',
  'gmail',
  'hubspot',
  'linear',
  'notion',
  'postgres',
  'reeboot-tasks',
  'send-message',
  'slack',
  'sqlite',
  'web-research',
];

describe('Skills catalog structure', () => {
  it('skills/ directory exists', () => {
    expect(existsSync(SKILLS_DIR), `skills/ dir not found at ${SKILLS_DIR}`).toBe(true);
  });

  it('all 15 expected skills are present', () => {
    const dirs = getSkillDirs().sort();
    for (const expected of EXPECTED_SKILLS) {
      expect(dirs, `missing skill: ${expected}`).toContain(expected);
    }
    expect(dirs.length).toBe(15);
  });

  it('each skill directory contains SKILL.md', () => {
    const dirs = getSkillDirs();
    for (const dir of dirs) {
      expect(
        existsSync(join(SKILLS_DIR, dir, 'SKILL.md')),
        `${dir}/SKILL.md missing`
      ).toBe(true);
    }
  });

  it('each SKILL.md has valid YAML frontmatter with name and description', () => {
    const dirs = getSkillDirs();
    for (const dir of dirs) {
      const content = readSkillMd(dir);
      expect(content, `${dir}/SKILL.md is null`).not.toBeNull();
      const fm = parseFrontmatter(content!);
      expect(fm.name, `${dir}: missing frontmatter 'name'`).toBeTruthy();
      expect(fm.description, `${dir}: missing frontmatter 'description'`).toBeTruthy();
    }
  });

  it('frontmatter name matches directory name exactly', () => {
    const dirs = getSkillDirs();
    for (const dir of dirs) {
      const content = readSkillMd(dir);
      const fm = parseFrontmatter(content!);
      expect(fm.name, `${dir}: frontmatter name '${fm.name}' does not match dir '${dir}'`).toBe(dir);
    }
  });

  it('description is non-empty and under 1024 chars', () => {
    const dirs = getSkillDirs();
    for (const dir of dirs) {
      const content = readSkillMd(dir);
      const fm = parseFrontmatter(content!);
      expect(fm.description.length, `${dir}: description is empty`).toBeGreaterThan(0);
      expect(
        fm.description.length,
        `${dir}: description exceeds 1024 chars (${fm.description.length})`
      ).toBeLessThanOrEqual(1024);
    }
  });
});

// ─── 1.2 reeboot skills list CLI ─────────────────────────────────────────────

import { listBundledSkills } from '@src/skills-cli.js';

describe('listBundledSkills()', () => {
  it('returns an array (empty if skills/ not found)', () => {
    const result = listBundledSkills('/nonexistent/path');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('returns one entry per skill directory with SKILL.md', () => {
    const result = listBundledSkills(SKILLS_DIR);
    expect(result.length).toBe(15);
  });

  it('each entry has name and description', () => {
    const result = listBundledSkills(SKILLS_DIR);
    for (const entry of result) {
      expect(entry.name, 'missing name').toBeTruthy();
      expect(entry.description, `${entry.name}: missing description`).toBeTruthy();
    }
  });

  it('output is sorted alphabetically by name', () => {
    const result = listBundledSkills(SKILLS_DIR);
    const names = result.map(r => r.name);
    expect(names).toEqual([...names].sort());
  });

  it('each entry name matches expected skill names', () => {
    const result = listBundledSkills(SKILLS_DIR);
    const names = result.map(r => r.name).sort();
    expect(names).toEqual(EXPECTED_SKILLS);
  });
});

// ─── 1.3 reeboot skills update stub ─────────────────────────────────────────

import { getSkillsUpdateMessage } from '@src/skills-cli.js';

describe('getSkillsUpdateMessage()', () => {
  it('returns a non-empty string', () => {
    const msg = getSkillsUpdateMessage(SKILLS_DIR);
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });

  it('mentions "coming soon" or "not yet available"', () => {
    const msg = getSkillsUpdateMessage(SKILLS_DIR).toLowerCase();
    const hasComing = msg.includes('coming soon') || msg.includes('not yet available');
    expect(hasComing, `update message should mention upcoming feature: "${msg}"`).toBe(true);
  });

  it('includes the count of bundled skills', () => {
    const msg = getSkillsUpdateMessage(SKILLS_DIR);
    expect(msg).toContain('15');
  });
});

// ─── 1.4 skill content quality ───────────────────────────────────────────────

// Skills that wrap CLI tools (binary name must appear in Setup section)
const CLI_SKILLS: Record<string, string> = {
  github: 'gh',
  gmail: 'gmcli',
  gcal: 'gccli',
  gdrive: 'gdcli',
  postgres: 'psql',
  docker: 'docker',
  sqlite: 'sqlite3',
};

// Skills that use API keys (env var name must appear)
const API_KEY_SKILLS: Record<string, string> = {
  notion: 'NOTION_API_KEY',
  slack: 'SLACK_BOT_TOKEN',
  linear: 'LINEAR_API_KEY',
  hubspot: 'HUBSPOT_ACCESS_TOKEN',
  postgres: 'DATABASE_URL',
  sqlite: 'DATABASE_PATH',
};

describe('Skill content quality', () => {
  it('each SKILL.md contains a ## Setup section', () => {
    const dirs = getSkillDirs();
    for (const dir of dirs) {
      const content = readSkillMd(dir)!;
      expect(
        content,
        `${dir}/SKILL.md missing '## Setup' section`
      ).toMatch(/^## Setup/m);
    }
  });

  it('each SKILL.md contains a ## Usage section', () => {
    const dirs = getSkillDirs();
    for (const dir of dirs) {
      const content = readSkillMd(dir)!;
      expect(
        content,
        `${dir}/SKILL.md missing '## Usage' section`
      ).toMatch(/^## Usage/m);
    }
  });

  it('CLI-wrapping skills mention the binary name in Setup section', () => {
    for (const [skill, binary] of Object.entries(CLI_SKILLS)) {
      const content = readSkillMd(skill);
      if (!content) continue; // will fail in structure tests
      // Extract Setup section
      const setupMatch = content.match(/## Setup\n([\s\S]*?)(?=\n## |$)/);
      const setupSection = setupMatch?.[1] ?? content;
      expect(
        setupSection,
        `${skill}/SKILL.md Setup section should mention binary '${binary}'`
      ).toContain(binary);
    }
  });

  it('API-key skills mention the env var name', () => {
    for (const [skill, envVar] of Object.entries(API_KEY_SKILLS)) {
      const content = readSkillMd(skill);
      if (!content) continue;
      expect(
        content,
        `${skill}/SKILL.md should mention env var '${envVar}'`
      ).toContain(envVar);
    }
  });

  it('no skill SKILL.md is empty beyond frontmatter', () => {
    const dirs = getSkillDirs();
    for (const dir of dirs) {
      const content = readSkillMd(dir)!;
      // Strip frontmatter
      const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
      expect(body.length, `${dir}/SKILL.md has no body beyond frontmatter`).toBeGreaterThan(50);
    }
  });
});
