import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir, homedir } from 'os';
import { z } from 'zod';

// ─── Schema ──────────────────────────────────────────────────────────────────

const ModelConfigSchema = z.object({
  authMode: z.enum(['pi', 'own']).default('own'),
  provider: z.string().default(''),
  id: z.string().default(''),
  apiKey: z.string().default(''),
});

const AgentConfigSchema = z.object({
  name: z.string().default('Reeboot'),
  runner: z.string().default('pi'),
  model: ModelConfigSchema.default({}),
  turnTimeout: z.number().int().default(300_000), // 5 min
});

const ExtensionsCoreConfigSchema = z.object({
  sandbox: z.boolean().default(true),
  confirm_destructive: z.boolean().default(true),
  protected_paths: z.boolean().default(true),
  git_checkpoint: z.boolean().default(false),
  session_name: z.boolean().default(true),
  custom_compaction: z.boolean().default(true),
  scheduler_tool: z.boolean().default(true),
  token_meter: z.boolean().default(true),
});

const ExtensionsConfigSchema = z.object({
  core: ExtensionsCoreConfigSchema.default({}),
});

const SkillsConfigSchema = z.object({
  permanent: z.array(z.string()).default([]),
  ephemeral_ttl_minutes: z.number().int().min(1).default(60),
  catalog_path: z.string().default(''),
});
export type SkillsConfig = z.infer<typeof SkillsConfigSchema>;

const WebChannelSchema = z.object({
  enabled: z.boolean().default(true),
  port: z.number().int().default(3000),
});

const WhatsAppChannelSchema = z.object({
  enabled: z.boolean().default(false),
});

const SignalChannelSchema = z.object({
  enabled: z.boolean().default(false),
  phoneNumber: z.string().default(''),
  apiPort: z.number().int().default(8080),
  pollInterval: z.number().int().default(1000),
});

const ChannelsConfigSchema = z.object({
  web: WebChannelSchema.default({}),
  whatsapp: WhatsAppChannelSchema.default({}),
  signal: SignalChannelSchema.default({}),
});

const SandboxConfigSchema = z.object({
  mode: z.enum(['os', 'docker']).default('os'),
});

const LoggingConfigSchema = z.object({
  level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

const ServerConfigSchema = z.object({
  token: z.string().optional(),
});

const RoutingRuleSchema = z.union([
  z.object({ peer: z.string(), context: z.string() }),
  z.object({ channel: z.string(), context: z.string() }),
]);

const RoutingConfigSchema = z.object({
  default: z.string().default('main'),
  rules: z.array(RoutingRuleSchema).default([]),
});

const SessionConfigSchema = z.object({
  inactivityTimeout: z.number().int().default(14_400_000), // 4 hours
});

const CredentialProxyConfigSchema = z.object({
  enabled: z.boolean().default(false),
  port: z.number().int().default(3001),
});

const SearchConfigSchema = z.object({
  provider: z.enum(['none', 'duckduckgo', 'brave', 'tavily', 'serper', 'exa', 'searxng']).default('none'),
  apiKey: z.string().default(''),
  searxngBaseUrl: z.string().default('http://localhost:8888'),
});

const HeartbeatConfigSchema = z.object({
  enabled: z.boolean().default(false),
  interval: z.string().default('every 5m'),
  contextId: z.string().default('main'),
});

export const ConfigSchema = z.object({
  agent: AgentConfigSchema.default({}),
  channels: ChannelsConfigSchema.default({}),
  sandbox: SandboxConfigSchema.default({}),
  logging: LoggingConfigSchema.default({}),
  server: ServerConfigSchema.default({}),
  extensions: ExtensionsConfigSchema.default({}),
  routing: RoutingConfigSchema.default({}),
  session: SessionConfigSchema.default({}),
  credentialProxy: CredentialProxyConfigSchema.default({}),
  search: SearchConfigSchema.default({}),
  heartbeat: HeartbeatConfigSchema.default({}),
  skills: SkillsConfigSchema.default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
export type SearchConfig = z.infer<typeof SearchConfigSchema>;
export type HeartbeatConfig = z.infer<typeof HeartbeatConfigSchema>;

// ─── Defaults ────────────────────────────────────────────────────────────────

export const defaultConfig: Config = ConfigSchema.parse({});

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getDefaultConfigPath(): string {
  return join(homedir(), '.reeboot', 'config.json');
}

// ─── loadConfig ──────────────────────────────────────────────────────────────

export function loadConfig(configPath?: string): Config {
  const path = configPath ?? getDefaultConfigPath();

  let raw: unknown = {};

  if (existsSync(path)) {
    let text: string;
    try {
      text = readFileSync(path, 'utf-8');
    } catch (err) {
      throw new Error(`Failed to parse config: ${err}`);
    }

    try {
      raw = JSON.parse(text);
    } catch (err) {
      throw new Error(`Failed to parse config: ${err}`);
    }
  }

  // Parse with Zod (throws ZodError on schema violation, which includes field path)
  const result = ConfigSchema.parse(raw);

  // Apply environment variable overrides
  if (process.env.REEBOOT_PORT) {
    const port = parseInt(process.env.REEBOOT_PORT, 10);
    if (!isNaN(port)) {
      result.channels.web.port = port;
    }
  }

  if (process.env.REEBOOT_LOG_LEVEL) {
    const level = process.env.REEBOOT_LOG_LEVEL as Config['logging']['level'];
    result.logging.level = level;
  }

  if (process.env.REEBOOT_API_TOKEN) {
    result.server.token = process.env.REEBOOT_API_TOKEN;
  }

  return result;
}

// ─── saveConfig ──────────────────────────────────────────────────────────────

export function saveConfig(config: Config, configPath?: string): void {
  const path = configPath ?? getDefaultConfigPath();

  // Validate before writing
  ConfigSchema.parse(config);

  // Ensure directory exists
  mkdirSync(dirname(path), { recursive: true });

  // Atomic write: write to a temp file in the same directory then rename.
  // Using the same directory avoids EXDEV (cross-device rename) errors that
  // occur in Docker when /tmp is on a different filesystem than the config dir.
  const tmpFile = join(dirname(path), `.reeboot-config-${Date.now()}.json.tmp`);
  writeFileSync(tmpFile, JSON.stringify(config, null, 2), 'utf-8');
  renameSync(tmpFile, path);
}
