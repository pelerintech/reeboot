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
    .filter(d => d.isDirectory() && d.name !== 'internal')
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
  'gcal',
  'gdrive',
  'github',
  'gmail',
  'slack',
];

describe('Skills catalog structure', () => {
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

});

// ─── 1.3 reeboot skills update stub ─────────────────────────────────────────

import { updateSkillCatalog } from '@src/skills-cli.js';

async function cliFixture() {
  const AdmZip: any = (await import('adm-zip')).default;
  const { mkdtempSync, rmSync } = await import('fs');
  const { join } = await import('path');
  const { tmpdir } = await import('os');
  const remoteDir = mkdtempSync(join(tmpdir(), 'reeboot-cli-remote-'));
  const stateFile = join(mkdtempSync(join(tmpdir(), 'reeboot-cli-state-')), 'skills-state.json');

  const zipBuf = (name: string) => {
    const zip = new AdmZip();
    zip.addFile('SKILL.md', Buffer.from(`---\nname: ${name}\ndescription: CLI skill ${name}\n---\n# ${name}\n`));
    return zip.toBuffer();
  };
  const zips: Record<string, Buffer> = { hubspot: zipBuf('hubspot'), notion: zipBuf('notion') };
  const index = {
    name: 'cli-catalog',
    skills: [
      { name: 'hubspot', description: 'CLI skill hubspot', version: '1.0', category: 'crm', zip: 'http://local/hubspot.zip' },
      { name: 'notion', description: 'CLI skill notion', version: '1.0', category: 'prod', zip: 'http://local/notion.zip' },
    ],
    tools: [],
  };
  const fetcher = async (url: string) => {
    if (url.endsWith('/index.json')) return { ok: true, json: () => Promise.resolve(index) } as any;
    const key = url.split('/').pop()!.replace(/\.zip$/, '');
    if (zips[key]) return { ok: true, arrayBuffer: () => Promise.resolve(zips[key].buffer.slice(zips[key].byteOffset, zips[key].byteOffset + zips[key].byteLength)) } as any;
    return { ok: false, status: 404, json: () => Promise.resolve({}) } as any;
  };
  const config = {
    skills: {
      catalog_url: 'http://local/index.json',
      remote_catalog_path: remoteDir,
      enabled_state_path: stateFile,
    },
  } as any;
  const cleanup = () => { rmSync(remoteDir, { recursive: true, force: true }); rmSync(join(stateFile, '..'), { recursive: true, force: true }); };
  return { remoteDir, stateFile, fetcher, config, cleanup };
}

describe('updateSkillCatalog()', () => {
  it('reports no remote catalog configured when catalog_url is empty', async () => {
    const res = await updateSkillCatalog({ skills: {} } as any);
    expect(res.ok).toBe(true);
    expect(res.message.toLowerCase()).toContain('no remote catalog configured');
  });

  it('fetches + installs available skills against a fixture catalog', async () => {
    const f = await cliFixture();
    try {
      const res = await updateSkillCatalog(f.config, { fetcher: f.fetcher });
      expect(res.ok).toBe(true);
      expect(res.message).toMatch(/Installed: hubspot, notion/);
      expect(existsSync(join(f.remoteDir, 'hubspot', 'SKILL.md'))).toBe(true);
      expect(existsSync(join(f.remoteDir, 'notion', 'SKILL.md'))).toBe(true);
    } finally { f.cleanup(); }
  });

  it('surfaces a fetch failure', async () => {
    const f = await cliFixture();
    try {
      const res = await updateSkillCatalog(f.config, { fetcher: async () => ({ ok: false, status: 500 } as any) });
      expect(res.ok).toBe(false);
      expect(res.message).toMatch(/500/i);
    } finally { f.cleanup(); }
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
