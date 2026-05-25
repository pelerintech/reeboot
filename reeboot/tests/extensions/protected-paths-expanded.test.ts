import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let tmpDir: string;

// ─── helpers ─────────────────────────────────────────────────────────────────

async function loadExtension() {
  const mod = await import('@src/extensions/protected-paths.js');
  let toolCallHandler: ((event: any, ctx: any) => any) | undefined;
  const mockPi: any = {
    on: vi.fn((event: string, handler: any) => {
      if (event === 'tool_call') toolCallHandler = handler;
    }),
    registerTool: vi.fn(),
  };
  mod.default(mockPi);
  return { toolCallHandler: toolCallHandler!, mockPi };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('protected-paths expanded', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-prot-test-'));
    // Set cwd to tmpDir so resolve() works predictably
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── New protected paths ──────────────────────────────────────────────────

  it('blocks write to ~/.ssh', async () => {
    const { toolCallHandler } = await loadExtension();
    const result = await toolCallHandler(
      { toolName: 'write', input: { path: '/home/user/.ssh/authorized_keys' } },
      { hasUI: false },
    );
    expect(result).toEqual({ block: true, reason: `Path "/home/user/.ssh/authorized_keys" is protected` });
  });

  it('blocks write to ~/.aws', async () => {
    const { toolCallHandler } = await loadExtension();
    const result = await toolCallHandler(
      { toolName: 'edit', input: { path: '/home/user/.aws/credentials' } },
      { hasUI: false },
    );
    expect(result).toEqual({ block: true, reason: `Path "/home/user/.aws/credentials" is protected` });
  });

  it('blocks write to ~/.gnupg', async () => {
    const { toolCallHandler } = await loadExtension();
    const result = await toolCallHandler(
      { toolName: 'write', input: { path: '/home/user/.gnupg/private-keys-v1.d/xxx.key' } },
      { hasUI: false },
    );
    expect(result).toEqual({ block: true, reason: `Path "/home/user/.gnupg/private-keys-v1.d/xxx.key" is protected` });
  });

  it('blocks write to system /etc/', async () => {
    const { toolCallHandler } = await loadExtension();
    const result = await toolCallHandler(
      { toolName: 'edit', input: { path: '/etc/hosts' } },
      { hasUI: false },
    );
    expect(result).toEqual({ block: true, reason: `Path "/etc/hosts" is protected` });
  });

  it('blocks write to /usr/', async () => {
    const { toolCallHandler } = await loadExtension();
    const result = await toolCallHandler(
      { toolName: 'write', input: { path: '/usr/local/bin/evil' } },
      { hasUI: false },
    );
    expect(result).toEqual({ block: true, reason: `Path "/usr/local/bin/evil" is protected` });
  });

  it('blocks write to /System/', async () => {
    const { toolCallHandler } = await loadExtension();
    const result = await toolCallHandler(
      { toolName: 'write', input: { path: '/System/foo' } },
      { hasUI: false },
    );
    expect(result).toEqual({ block: true, reason: `Path "/System/foo" is protected` });
  });

  // ── Still blocks original paths ──────────────────────────────────────────

  it('still blocks .env', async () => {
    const { toolCallHandler } = await loadExtension();
    const result = await toolCallHandler(
      { toolName: 'write', input: { path: '.env' } },
      { hasUI: false },
    );
    expect(result).toEqual({ block: true, reason: `Path ".env" is protected` });
  });

  it('still blocks .git/', async () => {
    const { toolCallHandler } = await loadExtension();
    const result = await toolCallHandler(
      { toolName: 'edit', input: { path: '.git/config' } },
      { hasUI: false },
    );
    expect(result).toEqual({ block: true, reason: `Path ".git/config" is protected` });
  });

  it('still blocks node_modules/', async () => {
    const { toolCallHandler } = await loadExtension();
    const result = await toolCallHandler(
      { toolName: 'write', input: { path: 'node_modules/evil/index.js' } },
      { hasUI: false },
    );
    expect(result).toEqual({ block: true, reason: `Path "node_modules/evil/index.js" is protected` });
  });

  it('still blocks config.json', async () => {
    const { toolCallHandler } = await loadExtension();
    const result = await toolCallHandler(
      { toolName: 'write', input: { path: 'config.json' } },
      { hasUI: false },
    );
    expect(result).toEqual({ block: true, reason: `Path "config.json" is protected` });
  });

  it('blocks ~/.reeboot/config.json (documented path)', async () => {
    const { toolCallHandler } = await loadExtension();
    const result = await toolCallHandler(
      { toolName: 'write', input: { path: '/home/user/.reeboot/config.json' } },
      { hasUI: false },
    );
    expect(result).toEqual({ block: true, reason: `Path "/home/user/.reeboot/config.json" is protected` });
  });

  // ── Safe paths are allowed ───────────────────────────────────────────────

  it('allows write to safe path notes.md', async () => {
    const { toolCallHandler } = await loadExtension();
    const result = await toolCallHandler(
      { toolName: 'write', input: { path: 'notes.md' } },
      { hasUI: false },
    );
    expect(result).toBeUndefined();
  });

  it('allows write to /tmp', async () => {
    const { toolCallHandler } = await loadExtension();
    const result = await toolCallHandler(
      { toolName: 'write', input: { path: '/tmp/output.txt' } },
      { hasUI: false },
    );
    expect(result).toBeUndefined();
  });

  it('allows write to src/', async () => {
    const { toolCallHandler } = await loadExtension();
    const result = await toolCallHandler(
      { toolName: 'write', input: { path: 'src/index.ts' } },
      { hasUI: false },
    );
    expect(result).toBeUndefined();
  });

  // ── Absolute path resolution ─────────────────────────────────────────────

  it('resolves ../../.ssh/config to absolute and blocks', async () => {
    const { toolCallHandler } = await loadExtension();
    // cwd is tmpDir, so ../../.ssh/config from tmpDir/foo/bar should resolve
    // to a path containing .ssh
    const subDir = join(tmpDir, 'foo', 'bar');
    vi.spyOn(process, 'cwd').mockReturnValue(subDir);

    const result = await toolCallHandler(
      { toolName: 'write', input: { path: '../../.ssh/config' } },
      { hasUI: false },
    );
    expect(result?.block).toBe(true);
    expect(result?.reason).toContain('.ssh');
    expect(result?.reason).toContain('protected');
  });

  // ── Non-write/edit tools ─────────────────────────────────────────────────

  it('does not block bash tool', async () => {
    const { toolCallHandler } = await loadExtension();
    const result = await toolCallHandler(
      { toolName: 'bash', input: { command: 'echo .ssh' } },
      { hasUI: false },
    );
    expect(result).toBeUndefined();
  });

  it('does not block read tool', async () => {
    const { toolCallHandler } = await loadExtension();
    const result = await toolCallHandler(
      { toolName: 'read', input: { path: '.ssh/config' } },
      { hasUI: false },
    );
    expect(result).toBeUndefined();
  });

  it('does not block grep tool', async () => {
    const { toolCallHandler } = await loadExtension();
    const result = await toolCallHandler(
      { toolName: 'grep', input: { path: '.ssh/config' } },
      { hasUI: false },
    );
    expect(result).toBeUndefined();
  });

  // ── UI notification on block ─────────────────────────────────────────────

  it('notifies UI when hasUI is true', async () => {
    const { toolCallHandler } = await loadExtension();
    const mockCtx: any = { hasUI: true, ui: { notify: vi.fn() } };
    await toolCallHandler(
      { toolName: 'write', input: { path: '/home/user/.ssh/config' } },
      mockCtx,
    );
    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      'Blocked write to protected path: /home/user/.ssh/config',
      'warning',
    );
  });
});
