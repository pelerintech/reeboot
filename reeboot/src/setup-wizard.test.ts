import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-wizard-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('runWizard() non-interactive mode', () => {
  it('writes config.json with provided values', async () => {
    const { runWizard } = await import('./setup-wizard.js');
    const configPath = join(tmpDir, '.reeboot', 'config.json');
    await runWizard({
      interactive: false,
      provider: 'anthropic',
      apiKey: 'sk-test-123',
      model: 'claude-3-opus-20240229',
      channels: 'web',
      name: 'TestBot',
      configDir: join(tmpDir, '.reeboot'),
    });
    expect(existsSync(configPath)).toBe(true);
    const cfg = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(cfg.agent?.name).toBe('TestBot');
    expect(cfg.agent?.model?.provider).toBe('anthropic');
    expect(cfg.agent?.model?.apiKey).toBe('sk-test-123');
  });

  it('scaffolds required directories', async () => {
    const { runWizard } = await import('./setup-wizard.js');
    const configDir = join(tmpDir, '.reeboot');
    await runWizard({
      interactive: false,
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4',
      channels: 'web',
      name: 'Reeboot',
      configDir,
    });
    expect(existsSync(join(configDir, 'contexts', 'global'))).toBe(true);
    expect(existsSync(join(configDir, 'contexts', 'main', 'workspace'))).toBe(true);
    expect(existsSync(join(configDir, 'contexts', 'main', '.pi', 'extensions'))).toBe(true);
    expect(existsSync(join(configDir, 'contexts', 'main', '.pi', 'skills'))).toBe(true);
    expect(existsSync(join(configDir, 'channels'))).toBe(true);
    expect(existsSync(join(configDir, 'sessions', 'main'))).toBe(true);
  });

  it('copies AGENTS.md templates from templates/', async () => {
    const { runWizard } = await import('./setup-wizard.js');
    const configDir = join(tmpDir, '.reeboot');
    await runWizard({
      interactive: false,
      provider: 'anthropic',
      apiKey: 'sk-test',
      model: 'claude-3-opus-20240229',
      channels: 'web',
      name: 'Reeboot',
      configDir,
    });
    expect(existsSync(join(configDir, 'contexts', 'global', 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(configDir, 'contexts', 'main', 'AGENTS.md'))).toBe(true);
  });

  it('does not overwrite existing AGENTS.md', async () => {
    const { runWizard } = await import('./setup-wizard.js');
    const configDir = join(tmpDir, '.reeboot');

    // Pre-create an AGENTS.md
    mkdirSync(join(configDir, 'contexts', 'main'), { recursive: true });
    writeFileSync(join(configDir, 'contexts', 'main', 'AGENTS.md'), 'MY CUSTOM CONTENT');

    await runWizard({
      interactive: false,
      provider: 'anthropic',
      apiKey: 'sk-test',
      model: 'claude-3-opus-20240229',
      channels: 'web',
      name: 'Reeboot',
      configDir,
    });

    const content = readFileSync(join(configDir, 'contexts', 'main', 'AGENTS.md'), 'utf-8');
    expect(content).toBe('MY CUSTOM CONTENT');
  });
});
