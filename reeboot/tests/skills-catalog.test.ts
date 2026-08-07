/**
 * Skills catalog boundary tests.
 *
 * Verifies that GET /api/skills returns only user-facing skills, never the
 * internal/harness skills. The bundled catalog ships both; the REST surface
 * must expose only the user catalog.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestApp, type TestAppHost } from './helpers/test-app.js';

let host: TestAppHost;

beforeAll(async () => {
  host = await buildTestApp();
});

afterAll(async () => {
  await host.stop();
  host.cleanup();
});

async function getSkills(): Promise<any[]> {
  const res = await host.app.request('http://localhost/api/skills');
  expect(res.status).toBe(200);
  return res.json();
}

const INTERNAL = ['visual-charting', 'visual-planning', 'web-research', 'send-message', 'reeboot-tasks'];
const USER_FACING = ['gmail', 'gcal', 'slack', 'github', 'gdrive'];

// Skills that were pruned from the bundle and relocated into the catalog repo.
const CUT_SKILLS = ['files', 'postgres', 'sqlite', 'docker', 'hubspot', 'linear', 'notion'];

describe('listUserSkills — bundled core', () => {
  it('returns exactly the 5 core skills against the package root', async () => {
    const { listUserSkills } = await import('../src/skills/catalog.js');
    const skills = listUserSkills();
    const names = skills.filter((s: any) => s.source === 'bundled').map((s: any) => s.name).sort();
    expect(names).toEqual([...USER_FACING].sort());
  });

  it('does not list the cut skills as bundled', async () => {
    const { listUserSkills } = await import('../src/skills/catalog.js');
    const names = listUserSkills().map((s: any) => s.name);
    for (const cut of CUT_SKILLS) {
      expect(names).not.toContain(cut);
    }
  });
});

describe('remote source + third catalog root', () => {
  it('SkillSource allows remote (type-level) and listUserSkills tags remote skills', async () => {
    const { listUserSkills, resolveUserCatalogRoots } = await import('../src/skills/catalog.js');
    const { mkdtempSync, rmSync, mkdirSync, writeFileSync } = await import('fs');
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    const remoteDir = mkdtempSync(join(tmpdir(), 'reeboot-remote-root-'));
    const skillDir = join(remoteDir, 'remote-skill-cat');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: remote-skill-cat\ndescription: Remote skill from catalog\n---\n# Remote\n'
    );
    try {
      const config = { skills: { remote_catalog_path: remoteDir } } as any;
      const roots = resolveUserCatalogRoots(config);
      expect(roots.map((r: any) => r.root)).toContain(remoteDir);
      expect(roots.find((r: any) => r.root === remoteDir)?.source).toBe('remote');

      const skills = listUserSkills(config);
      const found = skills.find((s: any) => s.name === 'remote-skill-cat');
      expect(found).toBeTruthy();
      expect(found!.source).toBe('remote');
      expect(found!.description).toBe('Remote skill from catalog');
    } finally {
      rmSync(remoteDir, { recursive: true, force: true });
    }
  });
});

// Runtime value typed as the SkillSource union to lock the 'remote' member.
const _remoteSource: import('../src/skills/catalog.js').SkillSource = 'remote';

describe('GET /api/skills — catalog boundary', () => {
  it('returns user-facing skills', async () => {
    const skills = await getSkills();
    const names = skills.map((s: any) => s.name);
    for (const u of USER_FACING) {
      expect(names).toContain(u);
    }
  });

  it('never lists internal/harness skills', async () => {
    const skills = await getSkills();
    const names = skills.map((s: any) => s.name);
    for (const i of INTERNAL) {
      expect(names).not.toContain(i);
    }
  });
});
