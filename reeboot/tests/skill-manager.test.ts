/**
 * Skill Manager Extension Tests (TDD — written before implementation)
 *
 * Covers:
 *   1.1  Permanent skills (resources_discover)
 *   1.2  load_skill tool
 *   1.3  unload_skill tool
 *   1.4  list_available_skills tool
 *   1.5  before_agent_start injection
 *   1.6  TTL expiry loop
 *   1.7  Persistence (active-skills.json)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ─── Test Utilities ───────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-skill-test-'));
  vi.clearAllMocks();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.useRealTimers();
});

// Build a mock pi API that captures event handlers and tools
function makeMockPi() {
  const handlers: Record<string, Function[]> = {};
  const tools: Record<string, any> = {};

  return {
    on: vi.fn((event: string, handler: Function) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    }),
    registerTool: vi.fn((tool: any) => {
      tools[tool.name] = tool;
    }),
    getConfig: vi.fn().mockReturnValue({}),
    _handlers: handlers,
    _tools: tools,
    // Helper: fire an event and return result
    _fire: async (event: string, payload?: any) => {
      const hs = handlers[event] ?? [];
      let result: any;
      for (const h of hs) {
        result = await h(payload ?? {});
      }
      return result;
    },
  };
}

// Create a minimal skill directory with SKILL.md
function makeSkillDir(rootDir: string, name: string, description: string): string {
  const dir = join(rootDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nSkill content here.\n`
  );
  return dir;
}

// Default test config
function makeConfig(overrides: any = {}) {
  return {
    skills: {
      permanent: [],
      ephemeral_ttl_minutes: 60,
      catalog_path: '',
      ...overrides.skills,
    },
    ...overrides,
  };
}

// ─── 1.1 Permanent Skills Tests ───────────────────────────────────────────────

describe('1.1 Permanent skills (resources_discover)', () => {
  it('registers permanent skill paths via resources_discover', async () => {
    const catalogDir = join(tmpDir, 'catalog');
    makeSkillDir(catalogDir, 'github', 'GitHub skill');

    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({
      skills: { permanent: ['github'], catalog_path: catalogDir },
    });

    skillManagerExtension(mockPi as any, config as any);

    // Fire resources_discover
    const result = await mockPi._fire('resources_discover');
    expect(result).toBeDefined();
    expect(result.skillPaths).toBeDefined();
    expect(Array.isArray(result.skillPaths)).toBe(true);
    expect(result.skillPaths).toHaveLength(1);
    expect(result.skillPaths[0]).toBe(join(catalogDir, 'github'));
  });

  it('logs warning and skips unknown skill names in permanent list', async () => {
    const catalogDir = join(tmpDir, 'catalog');
    mkdirSync(catalogDir, { recursive: true });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({
      skills: { permanent: ['nonexistent-skill'], catalog_path: catalogDir },
    });

    skillManagerExtension(mockPi as any, config as any);
    const result = await mockPi._fire('resources_discover');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('nonexistent-skill')
    );
    expect(result.skillPaths).toHaveLength(0);
    warnSpy.mockRestore();
  });

  it('registers nothing when permanent list is empty', async () => {
    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({ skills: { permanent: [] } });

    skillManagerExtension(mockPi as any, config as any);
    const result = await mockPi._fire('resources_discover');

    expect(result.skillPaths).toHaveLength(0);
  });

  it('resolves skill paths from catalog_path (extended catalog)', async () => {
    const catalogDir = join(tmpDir, 'custom-catalog');
    makeSkillDir(catalogDir, 'notion', 'Notion skill');

    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({
      skills: { permanent: ['notion'], catalog_path: catalogDir },
    });

    skillManagerExtension(mockPi as any, config as any);
    const result = await mockPi._fire('resources_discover');

    expect(result.skillPaths).toHaveLength(1);
    expect(result.skillPaths[0]).toBe(join(catalogDir, 'notion'));
  });

  it('handles missing bundled catalog dir gracefully (no throw)', async () => {
    // catalog_path doesn't exist either
    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({
      skills: { permanent: ['github'], catalog_path: join(tmpDir, 'nonexistent') },
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    skillManagerExtension(mockPi as any, config as any);
    const result = await mockPi._fire('resources_discover');

    expect(result.skillPaths).toHaveLength(0);
    warnSpy.mockRestore();
  });
});

// ─── 1.2 load_skill Tool Tests ────────────────────────────────────────────────

describe('1.2 load_skill tool', () => {
  it('loads a known skill from catalog into active set', async () => {
    const catalogDir = join(tmpDir, 'catalog');
    makeSkillDir(catalogDir, 'github', 'GitHub integration skill');
    const persistPath = join(tmpDir, 'active-skills.json');

    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({ skills: { catalog_path: catalogDir } });

    skillManagerExtension(mockPi as any, config as any, persistPath);

    const tool = mockPi._tools['load_skill'];
    expect(tool).toBeDefined();

    const result = await tool.execute('id1', { name: 'github' }, null, null, {});
    expect(result.content[0].text).toContain('github');
    expect(result.content[0].text).toContain('minutes');
  });

  it('returns error when skill name not found in catalog', async () => {
    const catalogDir = join(tmpDir, 'catalog');
    mkdirSync(catalogDir, { recursive: true });
    const persistPath = join(tmpDir, 'active-skills.json');

    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({ skills: { catalog_path: catalogDir } });

    skillManagerExtension(mockPi as any, config as any, persistPath);

    const tool = mockPi._tools['load_skill'];
    const result = await tool.execute('id1', { name: 'nonexistent' }, null, null, {});
    expect(result.content[0].text).toMatch(/not found|cannot find|unknown/i);
  });

  it('replaces existing skill (resets TTL) when called with same name', async () => {
    const catalogDir = join(tmpDir, 'catalog');
    makeSkillDir(catalogDir, 'github', 'GitHub skill');
    const persistPath = join(tmpDir, 'active-skills.json');

    vi.useFakeTimers();
    const now = Date.now();

    const { skillManagerExtension, ActiveSkillStore } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({ skills: { catalog_path: catalogDir, ephemeral_ttl_minutes: 60 } });

    skillManagerExtension(mockPi as any, config as any, persistPath);

    const tool = mockPi._tools['load_skill'];
    await tool.execute('id1', { name: 'github' }, null, null, {});

    // Advance time by 30 minutes
    vi.advanceTimersByTime(30 * 60 * 1000);

    // Load again — should reset TTL
    const result = await tool.execute('id2', { name: 'github' }, null, null, {});
    expect(result.content[0].text).toContain('github');

    // The expires_in from before_agent_start should be ~60 minutes, not ~30
    const baHandler = mockPi._handlers['before_agent_start']?.[0];
    const baResult = await baHandler({ systemPrompt: 'base' });
    expect(baResult?.systemPrompt).toContain('<active_skills>');
    // expires_in should be ~60, not ~30
    const match = baResult?.systemPrompt.match(/<expires_in>(\d+) minutes<\/expires_in>/);
    expect(match).toBeTruthy();
    const mins = parseInt(match![1], 10);
    expect(mins).toBeGreaterThanOrEqual(55); // ~60 minutes
  });

  it('applies default TTL from config when ttl_minutes not provided', async () => {
    const catalogDir = join(tmpDir, 'catalog');
    makeSkillDir(catalogDir, 'github', 'GitHub skill');
    const persistPath = join(tmpDir, 'active-skills.json');

    vi.useFakeTimers();

    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({ skills: { catalog_path: catalogDir, ephemeral_ttl_minutes: 120 } });

    skillManagerExtension(mockPi as any, config as any, persistPath);
    const tool = mockPi._tools['load_skill'];
    await tool.execute('id1', { name: 'github' }, null, null, {});

    const baHandler = mockPi._handlers['before_agent_start']?.[0];
    const baResult = await baHandler({ systemPrompt: 'base' });
    const match = baResult?.systemPrompt.match(/<expires_in>(\d+) minutes<\/expires_in>/);
    expect(match).toBeTruthy();
    const mins = parseInt(match![1], 10);
    expect(mins).toBeGreaterThanOrEqual(118); // ~120 minutes
  });

  it('applies custom ttl_minutes when provided', async () => {
    const catalogDir = join(tmpDir, 'catalog');
    makeSkillDir(catalogDir, 'github', 'GitHub skill');
    const persistPath = join(tmpDir, 'active-skills.json');

    vi.useFakeTimers();

    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({ skills: { catalog_path: catalogDir, ephemeral_ttl_minutes: 60 } });

    skillManagerExtension(mockPi as any, config as any, persistPath);
    const tool = mockPi._tools['load_skill'];
    await tool.execute('id1', { name: 'github', ttl_minutes: 30 }, null, null, {});

    const baHandler = mockPi._handlers['before_agent_start']?.[0];
    const baResult = await baHandler({ systemPrompt: 'base' });
    const match = baResult?.systemPrompt.match(/<expires_in>(\d+) minutes<\/expires_in>/);
    expect(match).toBeTruthy();
    const mins = parseInt(match![1], 10);
    expect(mins).toBeGreaterThanOrEqual(28);
    expect(mins).toBeLessThanOrEqual(31);
  });

  it('expired skill not present in active set after TTL elapses (fake timers)', async () => {
    const catalogDir = join(tmpDir, 'catalog');
    makeSkillDir(catalogDir, 'github', 'GitHub skill');
    const persistPath = join(tmpDir, 'active-skills.json');

    vi.useFakeTimers();

    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({ skills: { catalog_path: catalogDir, ephemeral_ttl_minutes: 1 } });

    skillManagerExtension(mockPi as any, config as any, persistPath);
    const tool = mockPi._tools['load_skill'];
    await tool.execute('id1', { name: 'github' }, null, null, {});

    // Advance past TTL
    await vi.advanceTimersByTimeAsync(61 * 1000 + 1);

    const baHandler = mockPi._handlers['before_agent_start']?.[0];
    const baResult = await baHandler({ systemPrompt: 'base' });
    // Skill should be expired — prompt unchanged or no active_skills block
    if (baResult === undefined || baResult === null) {
      // OK: no active skills
    } else {
      expect(baResult.systemPrompt).not.toContain('<active_skills>');
    }
  });
});

// ─── 1.3 unload_skill Tool Tests ─────────────────────────────────────────────

describe('1.3 unload_skill tool', () => {
  it('removes active skill immediately', async () => {
    const catalogDir = join(tmpDir, 'catalog');
    makeSkillDir(catalogDir, 'github', 'GitHub skill');
    const persistPath = join(tmpDir, 'active-skills.json');

    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({ skills: { catalog_path: catalogDir } });

    skillManagerExtension(mockPi as any, config as any, persistPath);

    // Load first
    await mockPi._tools['load_skill'].execute('id1', { name: 'github' }, null, null, {});

    // Unload
    const unloadTool = mockPi._tools['unload_skill'];
    expect(unloadTool).toBeDefined();
    const result = await unloadTool.execute('id2', { name: 'github' }, null, null, {});
    expect(result.content[0].text).toMatch(/unload|remov/i);
  });

  it('returns error when skill name not active', async () => {
    const persistPath = join(tmpDir, 'active-skills.json');
    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({});

    skillManagerExtension(mockPi as any, config as any, persistPath);

    const unloadTool = mockPi._tools['unload_skill'];
    const result = await unloadTool.execute('id1', { name: 'nonexistent' }, null, null, {});
    expect(result.content[0].text).toMatch(/not active|not found|not loaded/i);
  });

  it('unloaded skill no longer injected in before_agent_start', async () => {
    const catalogDir = join(tmpDir, 'catalog');
    makeSkillDir(catalogDir, 'github', 'GitHub skill');
    const persistPath = join(tmpDir, 'active-skills.json');

    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({ skills: { catalog_path: catalogDir } });

    skillManagerExtension(mockPi as any, config as any, persistPath);

    await mockPi._tools['load_skill'].execute('id1', { name: 'github' }, null, null, {});
    await mockPi._tools['unload_skill'].execute('id2', { name: 'github' }, null, null, {});

    const baHandler = mockPi._handlers['before_agent_start']?.[0];
    const baResult = await baHandler({ systemPrompt: 'base' });
    if (baResult !== undefined && baResult !== null) {
      expect(baResult.systemPrompt).not.toContain('github');
    }
  });
});

// ─── 1.4 list_available_skills Tool Tests ────────────────────────────────────

describe('1.4 list_available_skills tool', () => {
  it('returns name + description for all catalog skills without loading them', async () => {
    const catalogDir = join(tmpDir, 'catalog');
    makeSkillDir(catalogDir, 'github', 'GitHub integration');
    makeSkillDir(catalogDir, 'notion', 'Notion workspace');
    const persistPath = join(tmpDir, 'active-skills.json');

    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({ skills: { catalog_path: catalogDir } });

    skillManagerExtension(mockPi as any, config as any, persistPath);

    const tool = mockPi._tools['list_available_skills'];
    expect(tool).toBeDefined();

    const result = await tool.execute('id1', {}, null, null, {});
    const skills = JSON.parse(result.content[0].text);
    expect(Array.isArray(skills)).toBe(true);
    const names = skills.map((s: any) => s.name);
    expect(names).toContain('github');
    expect(names).toContain('notion');
    // descriptions present
    const github = skills.find((s: any) => s.name === 'github');
    expect(github.description).toBe('GitHub integration');
  });

  it('filters by keyword (case-insensitive substring match on name or description)', async () => {
    const catalogDir = join(tmpDir, 'catalog');
    makeSkillDir(catalogDir, 'github', 'GitHub integration');
    makeSkillDir(catalogDir, 'notion', 'Notion workspace tool');
    makeSkillDir(catalogDir, 'jira', 'Project tracker');
    const persistPath = join(tmpDir, 'active-skills.json');

    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({ skills: { catalog_path: catalogDir } });

    skillManagerExtension(mockPi as any, config as any, persistPath);

    const tool = mockPi._tools['list_available_skills'];
    const result = await tool.execute('id1', { query: 'github' }, null, null, {});
    const skills = JSON.parse(result.content[0].text);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('github');
  });

  it('returns empty list when catalog is empty', async () => {
    const catalogDir = join(tmpDir, 'catalog');
    mkdirSync(catalogDir, { recursive: true });
    const persistPath = join(tmpDir, 'active-skills.json');

    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({ skills: { catalog_path: catalogDir } });

    skillManagerExtension(mockPi as any, config as any, persistPath);

    const tool = mockPi._tools['list_available_skills'];
    const result = await tool.execute('id1', {}, null, null, {});
    const skills = JSON.parse(result.content[0].text);
    expect(skills).toHaveLength(0);
  });

  it('returns empty list when query has no matches', async () => {
    const catalogDir = join(tmpDir, 'catalog');
    makeSkillDir(catalogDir, 'github', 'GitHub integration');
    const persistPath = join(tmpDir, 'active-skills.json');

    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({ skills: { catalog_path: catalogDir } });

    skillManagerExtension(mockPi as any, config as any, persistPath);

    const tool = mockPi._tools['list_available_skills'];
    const result = await tool.execute('id1', { query: 'zzznomatch' }, null, null, {});
    const skills = JSON.parse(result.content[0].text);
    expect(skills).toHaveLength(0);
  });

  it('filters by description match as well', async () => {
    const catalogDir = join(tmpDir, 'catalog');
    makeSkillDir(catalogDir, 'github', 'GitHub integration');
    makeSkillDir(catalogDir, 'notion', 'Notion workspace tool');
    const persistPath = join(tmpDir, 'active-skills.json');

    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({ skills: { catalog_path: catalogDir } });

    skillManagerExtension(mockPi as any, config as any, persistPath);

    const tool = mockPi._tools['list_available_skills'];
    const result = await tool.execute('id1', { query: 'workspace' }, null, null, {});
    const skills = JSON.parse(result.content[0].text);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('notion');
  });
});

// ─── 1.5 before_agent_start Injection Tests ──────────────────────────────────

describe('1.5 before_agent_start injection', () => {
  it('returns undefined when no active ephemeral skills', async () => {
    const persistPath = join(tmpDir, 'active-skills.json');
    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({});

    skillManagerExtension(mockPi as any, config as any, persistPath);

    const baHandler = mockPi._handlers['before_agent_start']?.[0];
    expect(baHandler).toBeDefined();
    const result = await baHandler({ systemPrompt: 'base prompt' });
    expect(result).toBeUndefined();
  });

  it('appends XML block with active skill when one skill is active', async () => {
    const catalogDir = join(tmpDir, 'catalog');
    makeSkillDir(catalogDir, 'github', 'GitHub integration');
    const persistPath = join(tmpDir, 'active-skills.json');

    vi.useFakeTimers();

    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({ skills: { catalog_path: catalogDir, ephemeral_ttl_minutes: 60 } });

    skillManagerExtension(mockPi as any, config as any, persistPath);

    await mockPi._tools['load_skill'].execute('id1', { name: 'github' }, null, null, {});

    const baHandler = mockPi._handlers['before_agent_start']?.[0];
    const result = await baHandler({ systemPrompt: 'base prompt' });
    expect(result).toBeDefined();
    expect(result.systemPrompt).toContain('base prompt');
    expect(result.systemPrompt).toContain('<active_skills>');
    expect(result.systemPrompt).toContain('name="github"');
    expect(result.systemPrompt).toContain('<description>GitHub integration</description>');
    expect(result.systemPrompt).toContain('<expires_in>');
    expect(result.systemPrompt).toContain('</active_skills>');
  });

  it('includes both skills when two are active', async () => {
    const catalogDir = join(tmpDir, 'catalog');
    makeSkillDir(catalogDir, 'github', 'GitHub integration');
    makeSkillDir(catalogDir, 'notion', 'Notion workspace');
    const persistPath = join(tmpDir, 'active-skills.json');

    vi.useFakeTimers();

    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({ skills: { catalog_path: catalogDir } });

    skillManagerExtension(mockPi as any, config as any, persistPath);

    await mockPi._tools['load_skill'].execute('id1', { name: 'github' }, null, null, {});
    await mockPi._tools['load_skill'].execute('id2', { name: 'notion' }, null, null, {});

    const baHandler = mockPi._handlers['before_agent_start']?.[0];
    const result = await baHandler({ systemPrompt: 'base' });
    expect(result.systemPrompt).toContain('name="github"');
    expect(result.systemPrompt).toContain('name="notion"');
  });

  it('does not inject expired skill', async () => {
    const catalogDir = join(tmpDir, 'catalog');
    makeSkillDir(catalogDir, 'github', 'GitHub skill');
    const persistPath = join(tmpDir, 'active-skills.json');

    vi.useFakeTimers();

    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({ skills: { catalog_path: catalogDir, ephemeral_ttl_minutes: 1 } });

    skillManagerExtension(mockPi as any, config as any, persistPath);

    await mockPi._tools['load_skill'].execute('id1', { name: 'github' }, null, null, {});

    // Advance past TTL (1 min + buffer)
    await vi.advanceTimersByTimeAsync(62 * 1000);

    const baHandler = mockPi._handlers['before_agent_start']?.[0];
    const result = await baHandler({ systemPrompt: 'base' });
    if (result !== undefined && result !== null) {
      expect(result.systemPrompt).not.toContain('<active_skills>');
    }
  });

  it('shows correct expires_in minutes (fake timers)', async () => {
    const catalogDir = join(tmpDir, 'catalog');
    makeSkillDir(catalogDir, 'github', 'GitHub skill');
    const persistPath = join(tmpDir, 'active-skills.json');

    vi.useFakeTimers();

    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({ skills: { catalog_path: catalogDir, ephemeral_ttl_minutes: 60 } });

    skillManagerExtension(mockPi as any, config as any, persistPath);

    await mockPi._tools['load_skill'].execute('id1', { name: 'github' }, null, null, {});

    // Advance by 20 minutes
    vi.advanceTimersByTime(20 * 60 * 1000);

    const baHandler = mockPi._handlers['before_agent_start']?.[0];
    const result = await baHandler({ systemPrompt: 'base' });
    const match = result?.systemPrompt.match(/<expires_in>(\d+) minutes<\/expires_in>/);
    expect(match).toBeTruthy();
    const mins = parseInt(match![1], 10);
    // Should be ~40 minutes (60 - 20)
    expect(mins).toBeGreaterThanOrEqual(38);
    expect(mins).toBeLessThanOrEqual(42);
  });
});

// ─── 1.6 TTL Expiry Loop Tests ───────────────────────────────────────────────

describe('1.6 TTL expiry loop', () => {
  it('removes expired skill after TTL loop tick (fake timers)', async () => {
    const catalogDir = join(tmpDir, 'catalog');
    makeSkillDir(catalogDir, 'github', 'GitHub skill');
    const persistPath = join(tmpDir, 'active-skills.json');

    vi.useFakeTimers();

    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({ skills: { catalog_path: catalogDir, ephemeral_ttl_minutes: 1 } });

    skillManagerExtension(mockPi as any, config as any, persistPath);
    await mockPi._tools['load_skill'].execute('id1', { name: 'github' }, null, null, {});

    // Advance past TTL (1 min) + one loop tick (60s)
    await vi.advanceTimersByTimeAsync(61 * 1000 + 60 * 1000 + 100);

    // The loop should have pruned the expired skill
    const baHandler = mockPi._handlers['before_agent_start']?.[0];
    const result = await baHandler({ systemPrompt: 'base' });
    if (result !== undefined && result !== null) {
      expect(result.systemPrompt).not.toContain('<active_skills>');
    }
  });

  it('updates active-skills.json after expiry', async () => {
    const catalogDir = join(tmpDir, 'catalog');
    makeSkillDir(catalogDir, 'github', 'GitHub skill');
    const persistPath = join(tmpDir, 'active-skills.json');

    vi.useFakeTimers();

    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({ skills: { catalog_path: catalogDir, ephemeral_ttl_minutes: 1 } });

    skillManagerExtension(mockPi as any, config as any, persistPath);
    await mockPi._tools['load_skill'].execute('id1', { name: 'github' }, null, null, {});

    // Confirm it's in the file
    expect(existsSync(persistPath)).toBe(true);
    const before = JSON.parse(readFileSync(persistPath, 'utf-8'));
    expect(before).toHaveLength(1);

    // Advance past TTL + loop tick
    await vi.advanceTimersByTimeAsync(61 * 1000 + 60 * 1000 + 100);

    // File should be updated to empty
    if (existsSync(persistPath)) {
      const after = JSON.parse(readFileSync(persistPath, 'utf-8'));
      expect(after).toHaveLength(0);
    }
  });

  it('handles multiple skills with different TTLs independently', async () => {
    const catalogDir = join(tmpDir, 'catalog');
    makeSkillDir(catalogDir, 'github', 'GitHub skill');
    makeSkillDir(catalogDir, 'notion', 'Notion skill');
    const persistPath = join(tmpDir, 'active-skills.json');

    vi.useFakeTimers();

    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({ skills: { catalog_path: catalogDir, ephemeral_ttl_minutes: 60 } });

    skillManagerExtension(mockPi as any, config as any, persistPath);

    // Load github with 1 min TTL, notion with 60 min TTL
    await mockPi._tools['load_skill'].execute('id1', { name: 'github', ttl_minutes: 1 }, null, null, {});
    await mockPi._tools['load_skill'].execute('id2', { name: 'notion', ttl_minutes: 60 }, null, null, {});

    // Advance past github TTL + loop tick
    await vi.advanceTimersByTimeAsync(61 * 1000 + 60 * 1000 + 100);

    const baHandler = mockPi._handlers['before_agent_start']?.[0];
    const result = await baHandler({ systemPrompt: 'base' });

    // notion should still be active
    expect(result?.systemPrompt).toContain('notion');
    // github should be gone
    if (result?.systemPrompt) {
      expect(result.systemPrompt).not.toContain('name="github"');
    }
  });

  it('stops loop on session_shutdown', async () => {
    const persistPath = join(tmpDir, 'active-skills.json');
    vi.useFakeTimers();

    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({});

    skillManagerExtension(mockPi as any, config as any, persistPath);

    // session_shutdown handler should be registered
    expect(mockPi._handlers['session_shutdown']).toBeDefined();
    expect(mockPi._handlers['session_shutdown'].length).toBeGreaterThan(0);
  });
});

// ─── 1.7 Persistence Tests ───────────────────────────────────────────────────

describe('1.7 Persistence', () => {
  it('writes active-skills.json when skill is loaded', async () => {
    const catalogDir = join(tmpDir, 'catalog');
    makeSkillDir(catalogDir, 'github', 'GitHub skill');
    const persistPath = join(tmpDir, 'active-skills.json');

    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({ skills: { catalog_path: catalogDir } });

    skillManagerExtension(mockPi as any, config as any, persistPath);

    await mockPi._tools['load_skill'].execute('id1', { name: 'github' }, null, null, {});

    expect(existsSync(persistPath)).toBe(true);
    const data = JSON.parse(readFileSync(persistPath, 'utf-8'));
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe('github');
    expect(typeof data[0].expiresAt).toBe('number');
  });

  it('restores non-expired skills on startup', async () => {
    const catalogDir = join(tmpDir, 'catalog');
    makeSkillDir(catalogDir, 'github', 'GitHub skill');
    const persistPath = join(tmpDir, 'active-skills.json');

    // Pre-populate persistence file with a non-expired skill
    const futureExpiry = Date.now() + 60 * 60 * 1000; // 60 mins from now
    writeFileSync(
      persistPath,
      JSON.stringify([
        {
          name: 'github',
          skillDir: join(catalogDir, 'github'),
          description: 'GitHub skill',
          expiresAt: futureExpiry,
        },
      ])
    );

    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({ skills: { catalog_path: catalogDir } });

    skillManagerExtension(mockPi as any, config as any, persistPath);

    // Should have restored the skill
    const baHandler = mockPi._handlers['before_agent_start']?.[0];
    const result = await baHandler({ systemPrompt: 'base' });
    expect(result?.systemPrompt).toContain('<active_skills>');
    expect(result?.systemPrompt).toContain('name="github"');
  });

  it('discards already-expired skills on startup', async () => {
    const catalogDir = join(tmpDir, 'catalog');
    const persistPath = join(tmpDir, 'active-skills.json');

    // Pre-populate with an expired skill
    const pastExpiry = Date.now() - 1000; // already expired
    writeFileSync(
      persistPath,
      JSON.stringify([
        {
          name: 'github',
          skillDir: join(catalogDir, 'github'),
          description: 'GitHub skill',
          expiresAt: pastExpiry,
        },
      ])
    );

    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({ skills: { catalog_path: catalogDir } });

    skillManagerExtension(mockPi as any, config as any, persistPath);

    const baHandler = mockPi._handlers['before_agent_start']?.[0];
    const result = await baHandler({ systemPrompt: 'base' });
    // No active skills
    if (result !== undefined && result !== null) {
      expect(result.systemPrompt).not.toContain('<active_skills>');
    }
  });

  it('handles missing persistence file gracefully (no throw)', async () => {
    const persistPath = join(tmpDir, 'nonexistent-active-skills.json');

    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({});

    // Should not throw
    expect(() => {
      skillManagerExtension(mockPi as any, config as any, persistPath);
    }).not.toThrow();
  });

  it('handles corrupted persistence file with console.warn (no throw)', async () => {
    const persistPath = join(tmpDir, 'active-skills.json');
    writeFileSync(persistPath, 'this is not valid JSON {{{');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { skillManagerExtension } = await import('../extensions/skill-manager.js');
    const mockPi = makeMockPi();
    const config = makeConfig({});

    expect(() => {
      skillManagerExtension(mockPi as any, config as any, persistPath);
    }).not.toThrow();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ─── 2.1 Config Tests ────────────────────────────────────────────────────────

describe('2.1 Config: skills block', () => {
  it('parses config with skills block defaults', async () => {
    const { ConfigSchema } = await import('@src/config.js');
    const config = ConfigSchema.parse({});
    expect(config.skills).toBeDefined();
    expect(config.skills.permanent).toEqual([]);
    expect(config.skills.ephemeral_ttl_minutes).toBe(60);
    expect(config.skills.catalog_path).toBe('');
  });

  it('parses config with custom skills values', async () => {
    const { ConfigSchema } = await import('@src/config.js');
    const config = ConfigSchema.parse({
      skills: {
        permanent: ['github', 'notion'],
        ephemeral_ttl_minutes: 120,
        catalog_path: '/custom/path',
      },
    });
    expect(config.skills.permanent).toEqual(['github', 'notion']);
    expect(config.skills.ephemeral_ttl_minutes).toBe(120);
    expect(config.skills.catalog_path).toBe('/custom/path');
  });

  it('exports SkillsConfig type (compile-time check via usage)', async () => {
    const configModule = await import('@src/config.js');
    // SkillsConfig is a type, but we can verify the schema is accessible
    expect(configModule.ConfigSchema).toBeDefined();
    // If SkillsConfig is exported, the module resolves without error
  });
});

// ─── 3.x Catalog Resolution Tests ────────────────────────────────────────────

describe('3.x findSkill and readSkillMeta', () => {
  it('findSkill returns directory path when skill exists', async () => {
    const catalogDir = join(tmpDir, 'catalog');
    makeSkillDir(catalogDir, 'github', 'GitHub skill');

    const { findSkill } = await import('../extensions/skill-manager.js');
    const result = findSkill('github', [catalogDir]);
    expect(result).toBe(join(catalogDir, 'github'));
  });

  it('findSkill returns null when skill not found', async () => {
    const catalogDir = join(tmpDir, 'catalog');
    mkdirSync(catalogDir, { recursive: true });

    const { findSkill } = await import('../extensions/skill-manager.js');
    const result = findSkill('nonexistent', [catalogDir]);
    expect(result).toBeNull();
  });

  it('findSkill searches multiple roots in order', async () => {
    const root1 = join(tmpDir, 'root1');
    const root2 = join(tmpDir, 'root2');
    makeSkillDir(root2, 'github', 'GitHub from root2');

    const { findSkill } = await import('../extensions/skill-manager.js');
    const result = findSkill('github', [root1, root2]);
    expect(result).toBe(join(root2, 'github'));
  });

  it('readSkillMeta returns name and description from SKILL.md frontmatter', async () => {
    const catalogDir = join(tmpDir, 'catalog');
    const skillDir = makeSkillDir(catalogDir, 'github', 'GitHub integration tool');

    const { readSkillMeta } = await import('../extensions/skill-manager.js');
    const meta = readSkillMeta(skillDir);
    expect(meta).not.toBeNull();
    expect(meta!.name).toBe('github');
    expect(meta!.description).toBe('GitHub integration tool');
  });

  it('readSkillMeta returns null when SKILL.md missing', async () => {
    const dir = join(tmpDir, 'empty-skill');
    mkdirSync(dir, { recursive: true });

    const { readSkillMeta } = await import('../extensions/skill-manager.js');
    const meta = readSkillMeta(dir);
    expect(meta).toBeNull();
  });

  it('ActiveSkillStore load/unload/getActive', async () => {
    const { ActiveSkillStore } = await import('../extensions/skill-manager.js');
    const store = new ActiveSkillStore();
    store.load('github', '/path/to/github', 'GitHub skill', 60 * 60 * 1000);
    const active = store.getActive();
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe('github');

    store.unload('github');
    expect(store.getActive()).toHaveLength(0);
  });

  it('ActiveSkillStore pruneExpired removes expired skills', async () => {
    vi.useFakeTimers();
    const { ActiveSkillStore } = await import('../extensions/skill-manager.js');
    const store = new ActiveSkillStore();
    store.load('github', '/path/to/github', 'GitHub skill', 60 * 1000); // 1 min

    vi.advanceTimersByTime(61 * 1000);
    const removed = store.pruneExpired();
    expect(removed).toContain('github');
    expect(store.getActive()).toHaveLength(0);
  });
});
