/**
 * MCP Manager Extension Tests (TDD)
 *
 * Covers:
 *   2  — mcp tool registered
 *   3  — system prompt injection
 *   4  — list action (connect + list tools)
 *   5  — unknown server returns error text
 *   6  — call action
 *   7  — subprocess reuse
 *   8  — spawn failure returns error text
 *   9  — session_shutdown disconnects all servers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Config, McpPermissions } from '@src/config.js';

// ─── Mock pi API ──────────────────────────────────────────────────────────────

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
    _handlers: handlers,
    _tools: tools,
    _fire: async (event: string, payload?: any) => {
      const hs = handlers[event] ?? [];
      let result: any;
      for (const h of hs) {
        result = await h(payload ?? {});
      }
      return result;
    },
    _callTool: async (name: string, params: any) => {
      const tool = tools[name];
      if (!tool) throw new Error(`tool ${name} not registered`);
      return tool.execute('run-id', params, undefined, undefined, undefined);
    },
  };
}

// ─── Config helpers ───────────────────────────────────────────────────────────

function makeConfig(
  servers: Array<{ name: string; command: string; args?: string[]; env?: Record<string, string>; permissions?: McpPermissions }> = [],
  opts: { violationsLog?: boolean } = {},
): Config {
  return {
    agent: { name: 'Reeboot', runner: 'pi', model: { authMode: 'own', provider: '', id: '', apiKey: '' }, turnTimeout: 300000 },
    channels: { web: { enabled: true, port: 3000 }, whatsapp: { enabled: false }, signal: { enabled: false, phoneNumber: '', apiPort: 8080, pollInterval: 1000 } },
    sandbox: { mode: 'os' },
    logging: { level: 'info' },
    server: {},
    extensions: { core: { sandbox: true, confirm_destructive: true, protected_paths: true, git_checkpoint: false, session_name: true, custom_compaction: true, scheduler_tool: true, token_meter: true, mcp: true } },
    routing: { default: 'main', rules: [] },
    session: { inactivityTimeout: 14400000 },
    credentialProxy: { enabled: false, port: 3001 },
    search: { provider: 'none', apiKey: '', searxngBaseUrl: 'http://localhost:8888' },
    heartbeat: { enabled: false, interval: 'every 5m', contextId: 'main' },
    skills: { permanent: [], ephemeral_ttl_minutes: 60, catalog_path: '' },
    mcp: { servers: servers.map(s => ({ name: s.name, command: s.command, args: s.args ?? [], env: s.env ?? {}, permissions: s.permissions ?? { network: false, filesystem: false } })) },
    permissions: { violations: { log: opts.violationsLog ?? true } },
  } as Config;
}

// ─── Module-level mock for @modelcontextprotocol/sdk ─────────────────────────

let mockClientInstance: ReturnType<typeof makeMockClient> | null = null;

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => mockClientInstance ?? makeMockClient()),
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({})),
}));

beforeEach(() => {
  mockClientInstance = null;
  vi.clearAllMocks();
});

// ─── 2: Tool registration ─────────────────────────────────────────────────────

describe('2: mcp tool registration', () => {
  it('registers exactly one tool named "mcp"', async () => {
    const { mcpManagerExtension } = await import('@src/extensions/mcp-manager.js');
    const pi = makeMockPi();
    const config = makeConfig([]);
    mcpManagerExtension(pi as any, config);
    expect(pi.registerTool).toHaveBeenCalledTimes(1);
    expect(pi.registerTool).toHaveBeenCalledWith(expect.objectContaining({ name: 'mcp' }));
  });
});

// ─── SDK mock helpers ─────────────────────────────────────────────────────────

function makeMockClient(overrides: Partial<{
  connect: () => Promise<void>;
  listTools: () => Promise<any>;
  callTool: (params: any) => Promise<any>;
  close: () => Promise<void>;
}> = {}) {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({ tools: [] }),
    callTool: vi.fn().mockResolvedValue({ content: [] }),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ─── 4: list action ───────────────────────────────────────────────────────────

describe('4: mcp list action', () => {
  it('connects to the server and returns tool descriptors', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const mockClient = makeMockClient({
      listTools: vi.fn().mockResolvedValue({
        tools: [
          { name: 'query', description: 'Run SQL' },
          { name: 'list_tables', description: 'List tables' },
        ],
      }),
    });
    mockClientInstance = mockClient;
    vi.mocked(Client).mockImplementation(() => mockClient as any);

    const { mcpManagerExtension } = await import('@src/extensions/mcp-manager.js');
    const pi = makeMockPi();
    const config = makeConfig([{ name: 'postgres', command: 'pg-mcp' }]);
    mcpManagerExtension(pi as any, config);

    const result = await pi._callTool('mcp', { action: 'list', server: 'postgres' });
    const text = result.content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ name: 'query', description: 'Run SQL' });
    expect(mockClient.connect).toHaveBeenCalledTimes(1);
  });

  it('reuses existing connection on second list call', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const mockClient = makeMockClient({
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'query', description: 'Run SQL' }] }),
    });
    mockClientInstance = mockClient;
    vi.mocked(Client).mockImplementation(() => mockClient as any);

    const { mcpManagerExtension } = await import('@src/extensions/mcp-manager.js');
    const pi = makeMockPi();
    const config = makeConfig([{ name: 'postgres', command: 'pg-mcp' }]);
    mcpManagerExtension(pi as any, config);

    await pi._callTool('mcp', { action: 'list', server: 'postgres' });
    await pi._callTool('mcp', { action: 'list', server: 'postgres' });

    expect(Client).toHaveBeenCalledTimes(1);
  });
});

// ─── 9: session_shutdown ─────────────────────────────────────────────────────

describe('9: session_shutdown', () => {
  it('calls close() on all connected clients when session ends', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');

    const pgClient = makeMockClient({ listTools: vi.fn().mockResolvedValue({ tools: [] }) });
    const ghClient = makeMockClient({ listTools: vi.fn().mockResolvedValue({ tools: [] }) });
    let callCount = 0;
    vi.mocked(Client).mockImplementation(() => {
      callCount++;
      return callCount === 1 ? pgClient as any : ghClient as any;
    });

    const { mcpManagerExtension } = await import('@src/extensions/mcp-manager.js');
    const pi = makeMockPi();
    const config = makeConfig([
      { name: 'postgres', command: 'pg-mcp' },
      { name: 'github', command: 'gh-mcp' },
    ]);
    mcpManagerExtension(pi as any, config);

    // Connect both servers
    await pi._callTool('mcp', { action: 'list', server: 'postgres' });
    await pi._callTool('mcp', { action: 'list', server: 'github' });

    // Trigger shutdown
    await pi._fire('session_shutdown');

    expect(pgClient.close).toHaveBeenCalledTimes(1);
    expect(ghClient.close).toHaveBeenCalledTimes(1);
  });
});

// ─── 8: spawn failure ─────────────────────────────────────────────────────────

describe('8: spawn failure', () => {
  it('returns error text and does not throw when connect() rejects', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const mockClient = makeMockClient({
      connect: vi.fn().mockRejectedValue(new Error('spawn ENOENT')),
    });
    mockClientInstance = mockClient;
    vi.mocked(Client).mockImplementation(() => mockClient as any);

    const { mcpManagerExtension } = await import('@src/extensions/mcp-manager.js');
    const pi = makeMockPi();
    const config = makeConfig([{ name: 'postgres', command: 'not-a-real-binary' }]);
    mcpManagerExtension(pi as any, config);

    const result = await pi._callTool('mcp', { action: 'list', server: 'postgres' });
    expect(result.content[0].text).toContain('Failed to start MCP server');
    expect(result.content[0].text).toContain('postgres');
  });
});

// ─── 7: subprocess reuse ─────────────────────────────────────────────────────

describe('7: subprocess reuse', () => {
  it('Client constructor called once across multiple tool calls to same server', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const mockClient = makeMockClient({
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'query', description: 'SQL' }] }),
      callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }),
    });
    mockClientInstance = mockClient;
    vi.mocked(Client).mockImplementation(() => mockClient as any);

    const { mcpManagerExtension } = await import('@src/extensions/mcp-manager.js');
    const pi = makeMockPi();
    const config = makeConfig([{ name: 'postgres', command: 'pg-mcp' }]);
    mcpManagerExtension(pi as any, config);

    await pi._callTool('mcp', { action: 'list', server: 'postgres' });
    await pi._callTool('mcp', { action: 'call', server: 'postgres', tool: 'query', args: {} });
    await pi._callTool('mcp', { action: 'list', server: 'postgres' });

    expect(Client).toHaveBeenCalledTimes(1);
  });
});

// ─── 6: call action ───────────────────────────────────────────────────────────

describe('6: mcp call action', () => {
  it('routes tool call to MCP server and returns result text', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const mockClient = makeMockClient({
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '1 row' }],
      }),
    });
    mockClientInstance = mockClient;
    vi.mocked(Client).mockImplementation(() => mockClient as any);

    const { mcpManagerExtension } = await import('@src/extensions/mcp-manager.js');
    const pi = makeMockPi();
    const config = makeConfig([{ name: 'postgres', command: 'pg-mcp' }]);
    mcpManagerExtension(pi as any, config);

    const result = await pi._callTool('mcp', {
      action: 'call',
      server: 'postgres',
      tool: 'query',
      args: { sql: 'SELECT 1' },
    });

    expect(result.content[0].text).toContain('1 row');
    expect(mockClient.callTool).toHaveBeenCalledWith({
      name: 'query',
      arguments: { sql: 'SELECT 1' },
    });
  });

  it('lazy-connects before calling tool if not yet started', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const mockClient = makeMockClient({
      callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }),
    });
    mockClientInstance = mockClient;
    vi.mocked(Client).mockImplementation(() => mockClient as any);

    const { mcpManagerExtension } = await import('@src/extensions/mcp-manager.js');
    const pi = makeMockPi();
    const config = makeConfig([{ name: 'postgres', command: 'pg-mcp' }]);
    mcpManagerExtension(pi as any, config);

    // Call without listing first — should still connect
    await pi._callTool('mcp', { action: 'call', server: 'postgres', tool: 'query', args: {} });
    expect(mockClient.connect).toHaveBeenCalledTimes(1);
  });
});

// ─── 5: Unknown server ────────────────────────────────────────────────────────

describe('5: unknown server name', () => {
  it('returns error text naming the unknown server and listing configured ones', async () => {
    const { mcpManagerExtension } = await import('@src/extensions/mcp-manager.js');
    const pi = makeMockPi();
    const config = makeConfig([{ name: 'postgres', command: 'pg-mcp' }]);
    mcpManagerExtension(pi as any, config);

    const result = await pi._callTool('mcp', { action: 'list', server: 'unknown' });
    expect(result.content[0].text).toContain('Unknown MCP server: unknown');
    expect(result.content[0].text).toContain('postgres');
  });
});

// ─── 3: System prompt injection ───────────────────────────────────────────────

describe('3: system prompt injection', () => {
  it('injects server names and usage example when servers are configured', async () => {
    const { mcpManagerExtension } = await import('@src/extensions/mcp-manager.js');
    const pi = makeMockPi();
    const config = makeConfig([
      { name: 'postgres', command: 'pg-mcp' },
      { name: 'github', command: 'gh-mcp' },
    ]);
    mcpManagerExtension(pi as any, config);
    const result = await pi._fire('before_agent_start', { systemPrompt: 'base prompt' });
    expect(result).toBeDefined();
    expect(result.systemPrompt).toContain('postgres');
    expect(result.systemPrompt).toContain('github');
    expect(result.systemPrompt).toContain('action: "list"');
    expect(result.systemPrompt).toContain('action: "call"');
    expect(result.systemPrompt).toContain('mcp');
  });

  it('returns undefined when no servers are configured', async () => {
    const { mcpManagerExtension } = await import('@src/extensions/mcp-manager.js');
    const pi = makeMockPi();
    const config = makeConfig([]);
    mcpManagerExtension(pi as any, config);
    const result = await pi._fire('before_agent_start', { systemPrompt: 'base prompt' });
    expect(result).toBeUndefined();
  });
});

// ─── 10: Sandbox wrapper selection ───────────────────────────────────────────

describe('10: sandbox wrapper — restricted profile injected via DI', () => {
  it('wraps command with sandbox-exec and mcp-restricted.sb for default-deny server', async () => {
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const mockClient = makeMockClient({ listTools: vi.fn().mockResolvedValue({ tools: [] }) });
    mockClientInstance = mockClient;
    vi.mocked(Client).mockImplementation(() => mockClient as any);

    const { McpServerPool } = await import('@src/extensions/mcp-manager.js');
    const config = makeConfig([{ name: 'postgres', command: 'pg-mcp', permissions: { network: false, filesystem: false } }]);

    // Inject a mock sandbox wrapper that simulates sandbox-exec being available
    const mockWrapper = vi.fn().mockResolvedValue({
      command: 'sandbox-exec',
      args: ['-f', '/path/to/mcp-restricted.sb', 'pg-mcp'],
    });
    const pool = new McpServerPool(config, mockWrapper);
    await pool.getOrConnect('postgres');

    expect(StdioClientTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'sandbox-exec',
        args: expect.arrayContaining(['-f', expect.stringMatching(/mcp-restricted\.sb/)]),
      }),
    );
    expect(mockWrapper).toHaveBeenCalledWith('pg-mcp', [], { network: false, filesystem: false }, 'postgres');
  });
});

// ─── 11: Graceful fallback when sandbox unavailable ──────────────────────────

describe('11: graceful fallback when no sandbox tool available', () => {
  it('spawns with original command and logs a warning when no sandbox tool found', async () => {
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const mockClient = makeMockClient({ listTools: vi.fn().mockResolvedValue({ tools: [] }) });
    mockClientInstance = mockClient;
    vi.mocked(Client).mockImplementation(() => mockClient as any);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { McpServerPool } = await import('@src/extensions/mcp-manager.js');
    const config = makeConfig([{ name: 'postgres', command: 'pg-mcp' }]);

    // Inject a wrapper that simulates no sandbox tool available
    const fallbackWrapper = async (command: string, args: string[], _permissions: any, serverName: string) => {
      console.warn(`sandbox unavailable for MCP server "${serverName}" — spawning without restrictions`);
      return { command, args };
    };
    const pool = new McpServerPool(config, fallbackWrapper);
    await pool.getOrConnect('postgres');

    expect(StdioClientTransport).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'pg-mcp' }),
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/sandbox unavailable/i));

    warnSpy.mockRestore();
  });
});

// ─── 12: Violation logging on OS-level errors ────────────────────────────────

describe('12: violation logging on EPERM error', () => {
  it('logs warn entry with mcp_permission_violation event when EPERM error occurs', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const mockClient = makeMockClient({
      callTool: vi.fn().mockRejectedValue(new Error('EPERM: operation not permitted')),
    });
    mockClientInstance = mockClient;
    vi.mocked(Client).mockImplementation(() => mockClient as any);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { mcpManagerExtension, McpServerPool } = await import('@src/extensions/mcp-manager.js');
    const pi = makeMockPi();
    const config = makeConfig([{ name: 'postgres', command: 'pg-mcp' }], { violationsLog: true });

    // Inject no-op sandbox wrapper to avoid sandbox-exec side effects
    const noopWrapper = async (cmd: string, args: string[]) => ({ command: cmd, args });
    const pool = new McpServerPool(config, noopWrapper);
    mcpManagerExtension(pi as any, config, pool);

    await pi._callTool('mcp', { action: 'call', server: 'postgres', tool: 'query', args: {} });

    const violationCall = warnSpy.mock.calls.find(callArgs =>
      callArgs.some(a => typeof a === 'string' && a.includes('mcp_permission_violation'))
    );
    expect(violationCall).toBeDefined();

    warnSpy.mockRestore();
  });
});

// ─── 13: Violation logging disabled by config ────────────────────────────────

describe('13: violation logging disabled by config', () => {
  it('does not emit mcp_permission_violation log when violations.log is false', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const mockClient = makeMockClient({
      callTool: vi.fn().mockRejectedValue(new Error('EPERM: operation not permitted')),
    });
    mockClientInstance = mockClient;
    vi.mocked(Client).mockImplementation(() => mockClient as any);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { mcpManagerExtension, McpServerPool } = await import('@src/extensions/mcp-manager.js');
    const pi = makeMockPi();
    const config = makeConfig([{ name: 'postgres', command: 'pg-mcp' }], { violationsLog: false });

    const noopWrapper = async (cmd: string, args: string[]) => ({ command: cmd, args });
    const pool = new McpServerPool(config, noopWrapper);
    mcpManagerExtension(pi as any, config, pool);

    const result = await pi._callTool('mcp', { action: 'call', server: 'postgres', tool: 'query', args: {} });

    const violationCall = warnSpy.mock.calls.find(callArgs =>
      callArgs.some(a => typeof a === 'string' && a.includes('mcp_permission_violation'))
    );
    expect(violationCall).toBeUndefined();
    // Error is still returned to caller
    expect(result.content[0].text).toContain('EPERM');

    warnSpy.mockRestore();
  });
});
