import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-agent-dir-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('initAgentDir', () => {
  it('creates ~/.reeboot/agent/ directory', async () => {
    const { initAgentDir } = await import('@src/utils/agent-dir.js');
    await initAgentDir(tmpDir);
    expect(existsSync(join(tmpDir, 'agent'))).toBe(true);
  });

  it('scaffolds AGENTS.md from templates/main-agents.md', async () => {
    const { initAgentDir } = await import('@src/utils/agent-dir.js');
    await initAgentDir(tmpDir);
    const agentsPath = join(tmpDir, 'agent', 'AGENTS.md');
    expect(existsSync(agentsPath)).toBe(true);
    const content = readFileSync(agentsPath, 'utf-8');
    expect(content).toContain('Reeboot');
  });

  it('does not overwrite existing AGENTS.md', async () => {
    const { initAgentDir } = await import('@src/utils/agent-dir.js');
    // First call creates it
    await initAgentDir(tmpDir);
    const agentsPath = join(tmpDir, 'agent', 'AGENTS.md');
    // Modify it
    const { writeFileSync } = await import('fs');
    writeFileSync(agentsPath, '# Custom persona');
    // Second call should not overwrite
    await initAgentDir(tmpDir);
    const content = readFileSync(agentsPath, 'utf-8');
    expect(content).toBe('# Custom persona');
  });
});
