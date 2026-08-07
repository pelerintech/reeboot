/**
 * Skills REST API tests.
 *
 * Covers:
 *   Task 2  — internal skills cannot be toggled/deleted via the API
 *   Task 5  — upload promotes + enables; name collision rejected
 *   Task 6  — GET shape, PUT toggle persists across re-buildApp, DELETE user-only
 *   Task 7  — unauthorized (non-loopback, token configured) is rejected
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import AdmZip from 'adm-zip';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { buildTestApp, type TestAppHost } from './helpers/test-app.js';

function skillZip(name: string): Buffer {
  const zip = new AdmZip();
  zip.addFile('SKILL.md', Buffer.from(`---\nname: ${name}\ndescription: Test skill ${name}\n---\n# ${name}\n`, 'utf-8'));
  zip.addFile('helper.js', Buffer.from('module.exports = 1;', 'utf-8'));
  return zip.toBuffer();
}

// Shared temp upload + state dirs across hosts so persistence is observable.
const uploadDir = mkdtempSync(join(tmpdir(), 'reeboot-upload-'));
const remoteDir = mkdtempSync(join(tmpdir(), 'reeboot-remote-api-'));
const stateFile = join(mkdtempSync(join(tmpdir(), 'reeboot-state-')), 'skills-state.json');

const config = () => ({
  skills: { catalog_path: uploadDir, remote_catalog_path: remoteDir, enabled_state_path: stateFile },
});

let host: TestAppHost;

beforeAll(async () => {
  host = await buildTestApp({ config: config() });
});

afterAll(async () => {
  await host.stop();
  host.cleanup();
  rmSync(uploadDir, { recursive: true, force: true });
  rmSync(remoteDir, { recursive: true, force: true });
  rmSync(join(stateFile, '..'), { recursive: true, force: true });
});

function api(path: string, init?: any): Promise<Response> {
  return host.app.request(`http://localhost${path}`, init);
}

function uploadReq(buffer: Buffer): Promise<Response> {
  const form = new FormData();
  form.append('file', new File([buffer], 'skill.zip'));
  return api('/api/skills/upload', { method: 'POST', body: form });
}

describe('Task 2 — internal skills cannot be managed', () => {
  it('rejects PUT on an internal skill', async () => {
    const res = await api('/api/skills', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'visual-charting', enabled: true }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects DELETE on an internal skill', async () => {
    const res = await api('/api/skills/web-research', { method: 'DELETE' });
    expect(res.status).toBe(400);
  });
});

describe('Task 5 — upload promotes and collides', () => {
  it('uploads a valid skill and lists it as enabled', async () => {
    const res = await uploadReq(skillZip('my-skills-api-skill'));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('my-skills-api-skill');
    expect(body.enabled).toBe(true);

    const list = await (await api('/api/skills')).json();
    const found = (list as any[]).find((s) => s.name === 'my-skills-api-skill');
    expect(found).toBeTruthy();
    expect(found.source).toBe('user');
    expect(found.enabled).toBe(true);
  });

  it('rejects a colliding name (bundled already exists)', async () => {
    const res = await uploadReq(skillZip('github'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/exists/i);
  });
});

describe('Task 6 — GET shape, PUT persistence, DELETE user-only', () => {
  it('GET returns {name, description, source, enabled} and excludes internal', async () => {
    const res = await api('/api/skills');
    expect(res.status).toBe(200);
    const list = (await res.json()) as any[];
    expect(Array.isArray(list)).toBe(true);
    for (const s of list) {
      expect(s).toHaveProperty('name');
      expect(s).toHaveProperty('description');
      expect(s).toHaveProperty('source');
      expect(s).toHaveProperty('enabled');
    }
    expect(list.map((s) => s.name)).not.toContain('visual-charting');
    expect(list.map((s) => s.name)).not.toContain('send-message');
  });

  it('PUT toggles and persists across a re-buildApp', async () => {
    const put = await api('/api/skills', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'github', enabled: true }),
    });
    expect(put.status).toBe(200);

    // Fresh host sharing the same state file observes the persisted toggle.
    const host2 = await buildTestApp({ config: config() });
    try {
      const list = (await (await host2.app.request('http://localhost/api/skills')).json()) as any[];
      const github = list.find((s) => s.name === 'github');
      expect(github.enabled).toBe(true);
    } finally {
      await host2.stop();
      // NOTE: do not call host2.cleanup() — it closes the shared DB singleton.
    }
  });

  it('DELETE removes a user-uploaded skill; bundled cannot be deleted', async () => {
    await uploadReq(skillZip('delete-me-skill'));
    const del = await api('/api/skills/delete-me-skill', { method: 'DELETE' });
    expect(del.status).toBe(200);
    const list = (await (await api('/api/skills')).json()) as any[];
    expect(list.map((s) => s.name)).not.toContain('delete-me-skill');

    const delBundled = await api('/api/skills/github', { method: 'DELETE' });
    expect(delBundled.status).toBe(400);
  });
});

describe('Task 7 — unauthorized access is rejected', () => {
  it('returns 401 for non-loopback request without a valid token', async () => {
    const authHost = await buildTestApp({ token: 'sekret', config: config() });
    try {
      const res = await authHost.app.request('http://localhost/api/skills');
      expect(res.status).toBe(401);
    } finally {
      await authHost.stop();
    }
  });
});

describe('Task 7b — remote source + remote delete (bundle-lean-catalog)', () => {
  function seedRemote(name: string, description: string) {
    const dir = join(remoteDir, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n`);
  }

  it('lists a remote-installed skill with source remote', async () => {
    seedRemote('api-remote-skill', 'Remote skill via api');
    const list = (await (await api('/api/skills')).json()) as any[];
    const found = list.find((s) => s.name === 'api-remote-skill');
    expect(found).toBeTruthy();
    expect(found.source).toBe('remote');
  });

  it('DELETE removes a remote skill and disables it', async () => {
    seedRemote('api-remote-del', 'Remote deletable');
    const del = await api('/api/skills/api-remote-del', { method: 'DELETE' });
    expect(del.status).toBe(200);
    const list = (await (await api('/api/skills')).json()) as any[];
    expect(list.map((s) => s.name)).not.toContain('api-remote-del');
  });

  it('bundled + internal skills still reject delete', async () => {
    const delBundled = await api('/api/skills/github', { method: 'DELETE' });
    expect(delBundled.status).toBe(400);
    const delInternal = await api('/api/skills/visual-charting', { method: 'DELETE' });
    expect(delInternal.status).toBe(400);
  });
});

describe('Task 8 — catalog browse + install endpoints (bundle-lean-catalog)', () => {
  let server: any;
  let baseUrl: string;
  let catalogHost: TestAppHost;
  const remoteRoot = mkdtempSync(join(tmpdir(), 'reeboot-catalog-endpoint-remote-'));
  const statePath = join(mkdtempSync(join(tmpdir(), 'reeboot-catalog-endpoint-state-')), 'skills-state.json');

  beforeAll(async () => {
    const http = await import('http');
    const name = 'catalog-cloud-skill';
    const zip = new AdmZip();
    zip.addFile('SKILL.md', Buffer.from(`---\nname: ${name}\ndescription: Cloud catalog skill\n---\n# ${name}\n`));
    const zipBytes = zip.toBuffer();
    const manifest = {
      name: 'endpoint-catalog',
      skills: [
        { name, description: 'Cloud catalog skill', version: '2.0.0', category: 'cloud', zip: '' },
      ],
      tools: [],
    };
    server = http.createServer((req: any, res: any) => {
      const url = req.url ?? '';
      if (url.endsWith('/index.json')) {
        manifest.skills[0].zip = `${baseUrl}/catalog-cloud-skill.zip`;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(manifest));
        return;
      }
      res.setHeader('content-type', 'application/zip');
      res.end(zipBytes);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    catalogHost = await buildTestApp({
      config: {
        skills: {
          catalog_url: `${baseUrl}/index.json`,
          remote_catalog_path: remoteRoot,
          enabled_state_path: statePath,
        },
      },
    });
  });

  afterAll(async () => {
    await catalogHost.stop();
    catalogHost.cleanup();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(remoteRoot, { recursive: true, force: true });
    rmSync(join(statePath, '..'), { recursive: true, force: true });
  });

  function catApi(path: string, init?: any): Promise<Response> {
    return catalogHost.app.request(`http://localhost${path}`, init);
  }

  it('GET /api/skills/catalog returns available entries with no collision', async () => {
    const res = await catApi('/api/skills/catalog');
    expect(res.status).toBe(200);
    const list = (await res.json()) as any[];
    const entry = list.find((s) => s.name === 'catalog-cloud-skill');
    expect(entry).toBeTruthy();
    expect(entry.name).toBe('catalog-cloud-skill');
    expect(entry.description).toBe('Cloud catalog skill');
    expect(entry.version).toBe('2.0.0');
    expect(entry.category).toBe('cloud');
    expect(entry.collision).toBe(false);
  });

  it('POST /api/skills/catalog/install installs and returns source remote enabled', async () => {
    const res = await catApi('/api/skills/catalog/install', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'catalog-cloud-skill' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('catalog-cloud-skill');
    expect(body.source).toBe('remote');
    expect(body.enabled).toBe(true);

    // Now it appears in the main list with source remote and flagged as collision.
    const list = (await (await catApi('/api/skills')).json()) as any[];
    expect(list.map((s) => s.name)).toContain('catalog-cloud-skill');
    const catalog = (await (await catApi('/api/skills/catalog')).json()) as any[];
    expect(catalog.find((s) => s.name === 'catalog-cloud-skill')?.collision).toBe(true);
  });

  it('rejects install of an unknown name', async () => {
    const res = await catApi('/api/skills/catalog/install', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'nope-not-in-catalog' }),
    });
    expect([400, 404]).toContain(res.status);
  });

  it('enforces auth on the catalog endpoints', async () => {
    const authHost = await buildTestApp({
      token: 'sekret',
      config: { skills: { catalog_url: `${baseUrl}/index.json`, remote_catalog_path: remoteRoot, enabled_state_path: statePath } },
    });
    try {
      const browse = await authHost.app.request('http://localhost/api/skills/catalog');
      expect(browse.status).toBe(401);
      const install = await authHost.app.request('http://localhost/api/skills/catalog/install', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'catalog-cloud-skill' }),
      });
      expect(install.status).toBe(401);
    } finally {
      await authHost.stop();
    }
  });
});
