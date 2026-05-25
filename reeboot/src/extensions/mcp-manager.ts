/**
 * MCP Manager Extension
 *
 * Connects reeboot to stdio-based MCP servers configured under mcp.servers
 * in config.json. All MCP server tools are exposed through a single proxy
 * tool called `mcp` (proxy mode — keeps token cost flat).
 *
 * Flow:
 *   - before_agent_start: inject system prompt snippet listing server names
 *   - mcp tool:
 *       action "list"  → lazy-connect server, return tools/list result
 *       action "call"  → lazy-connect server, execute tools/call, return result
 *   - session_shutdown: kill all child processes
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Type } from 'typebox';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { Config, McpPermissions } from '../config.js';
import { getLogger } from '../observability/logger.js';

// ─── Safe environment variables for MCP subprocesses ──────────────────────────

export const SAFE_ENV_VARS = [
  'PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TERM', 'SHELL', 'TMPDIR',
];

/**
 * Filter an environment object to only safe variables.
 * XDG_* vars are always passed through.
 * Explicitly configured env vars override/add.
 */
export function filterEnv(
  baseEnv: Record<string, string | undefined>,
  explicitEnv?: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(baseEnv)) {
    if (val !== undefined && (SAFE_ENV_VARS.includes(key) || key.startsWith('XDG_'))) {
      result[key] = val;
    }
  }
  // Explicitly configured env overrides/adds on top
  if (explicitEnv) {
    Object.assign(result, explicitEnv);
  }
  return result;
}

// ─── Credential redaction ─────────────────────────────────────────────────────

const REDACTION_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // GitHub PAT: ghp_<36 chars>
  { pattern: /ghp_[A-Za-z0-9]{36,}/g, replacement: '[REDACTED-GITHUB-TOKEN]' },
  // OpenAI keys: sk-... and sk-proj-... (include hyphens in key)
  { pattern: /sk-[A-Za-z0-9_-]{20,}/g, replacement: '[REDACTED-OPENAI-KEY]' },
  // Bearer tokens: Bearer <base64>
  { pattern: /Bearer\s+[A-Za-z0-9._\-]+/g, replacement: 'Bearer [REDACTED]' },
  // API_KEY=<value>
  { pattern: /API_KEY=[^&\s]{8,}/gi, replacement: 'API_KEY=[REDACTED]' },
  // token=<value>
  { pattern: /token=[^&\s]{8,}/gi, replacement: 'token=[REDACTED]' },
  // password=<value>
  { pattern: /password=[^&\s]+/gi, replacement: 'password=[REDACTED]' },
  // secret=<value>
  { pattern: /secret=[^&\s]+/gi, replacement: 'secret=[REDACTED]' },
];

/**
 * Redact credential patterns from text before returning to the LLM.
 * Safe text is passed through unchanged.
 */
export function redactCredentials(text: string): string {
  let result = text;
  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ─── Sandbox helpers ──────────────────────────────────────────────────────────

const SANDBOX_PROFILES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../extensions/sandbox');

// OS violation error patterns
const VIOLATION_PATTERNS = ['EPERM', 'EACCES', 'connection refused'];

function isViolationError(message: string): boolean {
  return VIOLATION_PATTERNS.some(p => message.includes(p));
}

async function resolveSandboxTool(): Promise<string | null> {
  try {
    const { default: which } = await import('which');
    if (process.platform === 'darwin') {
      try { return await which('sandbox-exec'); } catch { /* fall through */ }
    }
    if (process.platform === 'linux') {
      try { return await which('bwrap'); } catch { /* fall through */ }
    }
  } catch {
    // which not available
  }
  return null;
}

function selectProfile(permissions: McpPermissions): string {
  if (permissions.network) return 'mcp-network';
  return 'mcp-restricted';
}

export async function defaultSandboxWrapper(
  command: string,
  args: string[],
  permissions: McpPermissions,
  serverName: string,
): Promise<{ command: string; args: string[] }> {
  const sandboxTool = await resolveSandboxTool();

  if (!sandboxTool) {
    getLogger().warn({ component: 'mcp-manager', serverName }, `sandbox unavailable for MCP server "${serverName}" — spawning without restrictions`);
    return { command, args };
  }

  const profileName = selectProfile(permissions);

  if (process.platform === 'darwin') {
    const profilePath = join(SANDBOX_PROFILES_DIR, `${profileName}.sb`);
    return {
      command: sandboxTool,
      args: ['-f', profilePath, command, ...args],
    };
  }

  // Linux — bwrap
  const profilePath = join(SANDBOX_PROFILES_DIR, `${profileName}.bwrap.json`);
  const { readFileSync } = await import('node:fs');
  const bwrapArgs: string[] = JSON.parse(readFileSync(profilePath, 'utf-8'));
  return {
    command: sandboxTool,
    args: [...bwrapArgs, command, ...args],
  };
}

export type SandboxWrapper = typeof defaultSandboxWrapper;

// ─── McpServerPool ────────────────────────────────────────────────────────────

/**
 * Manages the lifecycle of MCP server client connections within a session.
 * Clients are created lazily on first use and reused for subsequent calls.
 *
 * @param config - Reeboot configuration.
 * @param sandboxWrapper - Optional override for sandbox command wrapping (used in tests).
 */
export class McpServerPool {
  private _clients: Map<string, any> = new Map();
  private _config: Config;
  private _sandboxWrapper: SandboxWrapper;

  constructor(config: Config, sandboxWrapper: SandboxWrapper = defaultSandboxWrapper) {
    this._config = config;
    this._sandboxWrapper = sandboxWrapper;
  }

  /**
   * Returns an existing connected client or spawns + connects a new one.
   * Throws if the server command fails to connect.
   */
  async getOrConnect(name: string): Promise<any> {
    if (this._clients.has(name)) {
      return this._clients.get(name)!;
    }

    const serverCfg = this._config.mcp.servers.find((s) => s.name === name);
    if (!serverCfg) {
      throw new Error(`Unknown MCP server: ${name}`);
    }

    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

    const permissions = serverCfg.permissions ?? { network: false, filesystem: false };
    const wrapped = await this._sandboxWrapper(serverCfg.command, serverCfg.args, permissions, name);

    const transport = new StdioClientTransport({
      command: wrapped.command,
      args: wrapped.args,
      env: filterEnv(process.env as Record<string, string | undefined>, serverCfg.env) as Record<string, string>,
    });

    const client = new Client({ name: 'reeboot', version: '1.0.0' });
    await client.connect(transport);

    this._clients.set(name, client);
    return client;
  }

  /**
   * Close all active client connections.
   */
  async disconnectAll(): Promise<void> {
    const closes = Array.from(this._clients.values()).map((c) =>
      c.close().catch(() => {})
    );
    await Promise.all(closes);
    this._clients.clear();
  }

  get size(): number {
    return this._clients.size;
  }
}

// ─── Extension ────────────────────────────────────────────────────────────────

export function mcpManagerExtension(pi: ExtensionAPI, config: Config, pool?: McpServerPool): void {
  const servers = config?.mcp?.servers ?? [];
  const _pool = pool ?? new McpServerPool(config);

  // ── System prompt injection ───────────────────────────────────────────────
  pi.on('before_agent_start', async (event: any) => {
    if (servers.length === 0) return undefined;

    const serverNames = servers.map((s) => s.name).join(', ');
    const snippet = `
<mcp_servers>
You have access to MCP servers via the \`mcp\` tool.

Configured servers: ${serverNames}

Usage:
  List a server's tools: mcp({ action: "list", server: "<name>" })
  Call a tool:           mcp({ action: "call", server: "<name>", tool: "<tool>", args: { ... } })
</mcp_servers>`;

    return { systemPrompt: (event.systemPrompt ?? '') + snippet };
  });

  // ── session_shutdown ──────────────────────────────────────────────────────
  pi.on('session_shutdown', async (event: any) => {
    if (event.reason === 'reload') return;
    await _pool.disconnectAll();
  });

  // ── mcp proxy tool ────────────────────────────────────────────────────────
  pi.registerTool({
    name: 'mcp',
    label: 'MCP',
    description:
      'Access tools provided by configured MCP servers. Use action "list" to discover a server\'s tools, and action "call" to invoke one.',
    parameters: Type.Object({
      action: Type.Union([Type.Literal('list'), Type.Literal('call')], {
        description: '"list" to get available tools, "call" to invoke a tool',
      }),
      server: Type.String({ description: 'MCP server name as configured in mcp.servers' }),
      tool: Type.Optional(Type.String({ description: 'Tool name to call (required for action "call")' })),
      args: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: 'Arguments to pass to the tool' })),
    }),

    async execute(_id: string, params: any, _signal: any, _onUpdate: any, _ctx: any) {
      const configuredNames = servers.map((s) => s.name);

      // Validate server name
      if (!configuredNames.includes(params.server)) {
        return {
          content: [{
            type: 'text' as const,
            text: `Unknown MCP server: ${params.server}. Configured servers: ${configuredNames.join(', ') || '(none)'}`,
          }],
          details: null,
        };
      }

      let client: any;
      try {
        client = await _pool.getOrConnect(params.server);
      } catch (err: any) {
        return {
          content: [{
            type: 'text' as const,
            text: `Failed to start MCP server "${params.server}": ${err?.message ?? String(err)}`,
          }],
          details: null,
        };
      }

      if (params.action === 'list') {
        const result = await client.listTools();
        const tools = (result?.tools ?? []).map((t: any) => ({
          name: t.name,
          description: t.description ?? '',
        }));
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(tools, null, 2) }],
          details: null,
        };
      }

      if (params.action === 'call') {
        if (!params.tool) {
          return {
            content: [{ type: 'text' as const, text: 'action "call" requires a "tool" parameter' }],
            details: null,
          };
        }
        try {
          const result = await client.callTool({
            name: params.tool,
            arguments: params.args ?? {},
          });
          const content = result?.content ?? [];
          const text = content
            .map((c: any) => (c.type === 'text' ? c.text : JSON.stringify(c)))
            .join('\n');
          return {
            content: [{ type: 'text' as const, text }],
            details: null,
          };
        } catch (err: any) {
          const rawMessage = err?.message ?? String(err);
          const message = redactCredentials(rawMessage);
          const serverCfg = servers.find((s) => s.name === params.server);
          const permissions = serverCfg?.permissions ?? { network: false, filesystem: false };

          if (isViolationError(message) && config?.permissions?.violations?.log !== false) {
            getLogger().warn({
              component: 'mcp-manager',
              event: 'mcp_permission_violation',
              server: params.server,
              tool: params.tool,
              error: message,
              permissions,
            }, 'mcp_permission_violation');
          }

          return {
            content: [{ type: 'text' as const, text: `MCP tool call failed: ${message}` }],
            details: null,
          };
        }
      }

      return {
        content: [{ type: 'text' as const, text: `Unknown action: ${params.action}` }],
        details: null,
      };
    },
  });
}

export default mcpManagerExtension;
