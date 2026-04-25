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
  mcp: z.boolean().default(true),
  injection_guard: z.boolean().default(true),
});

const McpPermissionsSchema = z.object({
  network:    z.boolean().default(false),
  filesystem: z.boolean().default(false),
});

const McpServerSchema = z.object({
  name:        z.string().min(1),
  command:     z.string().min(1),
  args:        z.array(z.string()).default([]),
  env:         z.record(z.string()).default({}),
  permissions: McpPermissionsSchema.default({}),
});

const McpConfigSchema = z.object({
  servers: z.array(McpServerSchema).default([]),
});

export type McpPermissions = z.infer<typeof McpPermissionsSchema>;
export type McpServerConfig = z.infer<typeof McpServerSchema>;
export type McpConfig = z.infer<typeof McpConfigSchema>;

const ExtensionsConfigSchema = z.object({
  core: ExtensionsCoreConfigSchema.default({}),
});

const SkillsConfigSchema = z.object({
  permanent: z.array(z.string()).default([]),
  ephemeral_ttl_minutes: z.number().int().min(1).default(60),
  catalog_path: z.string().default(''),
});
export type SkillsConfig = z.infer<typeof SkillsConfigSchema>;

const ChannelTrustFields = {
  trust: z.enum(['owner', 'end-user']).default('owner'),
  trusted_senders: z.array(z.string()).default([]),
};

const WebChannelSchema = z.object({
  enabled: z.boolean().default(true),
  port: z.number().int().default(3000),
  ...ChannelTrustFields,
});

const WhatsAppChannelSchema = z.object({
  enabled: z.boolean().default(false),
  /** The owner's phone number or JID on this channel.
   *  Empty = Mode 1 (self-chat: agent runs on your own account).
   *  Non-empty = Mode 2 (dedicated account: agent runs on a separate account). */
  owner_id: z.string().default(''),
  /** When true, only messages from the owner are processed. Defaults to true — opt-out explicitly if you want the agent to respond to others. */
  owner_only: z.boolean().default(true),
  ...ChannelTrustFields,
});

const SignalChannelSchema = z.object({
  enabled: z.boolean().default(false),
  phoneNumber: z.string().default(''),
  apiPort: z.number().int().default(8080),
  pollInterval: z.number().int().default(1000),
  /** The owner's phone number (e.g. '+40700000001').
   *  Empty = Mode 1 (self-chat / note-to-self).
   *  Non-empty = Mode 2 (dedicated account). */
  owner_id: z.string().default(''),
  /** When true, only messages from the owner are processed. Defaults to true — opt-out explicitly if you want the agent to respond to others. */
  owner_only: z.boolean().default(true),
  ...ChannelTrustFields,
});

const ChannelsConfigSchema = z.object({
  web: WebChannelSchema.default({}),
  whatsapp: WhatsAppChannelSchema.default({}),
  signal: SignalChannelSchema.default({}),
});

const MemoryConsolidationSchema = z.object({
  enabled: z.boolean().default(true),
  schedule: z.string().default('0 2 * * *'),
});

const MemoryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  memoryCharLimit: z.number().int().default(2200),
  userCharLimit: z.number().int().default(1375),
  consolidation: MemoryConsolidationSchema.default({}),
});

export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;
export type MemoryConsolidationConfig = z.infer<typeof MemoryConsolidationSchema>;

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

const ViolationConfigSchema = z.object({
  log: z.boolean().default(true),
});

const PermissionsConfigSchema = z.object({
  violations: ViolationConfigSchema.default({}),
});

const InjectionGuardConfigSchema = z.object({
  enabled: z.boolean().default(true),
  external_source_tools: z.array(z.string()).default(['fetch_url', 'web_fetch']),
});

const SecurityConfigSchema = z.object({
  injection_guard: InjectionGuardConfigSchema.default({}),
});

const ContextToolsSchema = z.object({
  whitelist: z.array(z.string()).default([]),
});

const ContextConfigEntrySchema = z.object({
  name: z.string(),
  tools: ContextToolsSchema.default({}),
});

export type ContextConfig = z.infer<typeof ContextConfigEntrySchema>;

const KnowledgeWikiLintSchema = z.object({
  schedule: z.string().default('0 9 * * 1'),
});

const KnowledgeWikiSchema = z.object({
  enabled: z.boolean().default(false),
  lint: KnowledgeWikiLintSchema.default({}),
});

const KnowledgeConfigSchema = z.object({
  enabled: z.boolean().default(false),
  embeddingModel: z.string().default('nomic-ai/nomic-embed-text-v1.5'),
  dimensions: z.number().int().default(768),
  chunkSize: z.number().int().default(512),
  chunkOverlap: z.number().int().default(64),
  wiki: KnowledgeWikiSchema.default({}),
});

const ResilienceRecoverySchema = z.object({
  mode: z.enum(['safe_only', 'always', 'never']).default('safe_only'),
  side_effect_tools: z.array(z.string()).default([]),
});

const ResilienceSchedulerSchema = z.object({
  catchup_window: z.string().default('1h'),
});

const ResilienceSchema = z.object({
  recovery: ResilienceRecoverySchema.default({}),
  scheduler: ResilienceSchedulerSchema.default({}),
  outage_threshold: z.number().int().min(1).default(3),
  probe_interval: z.string().default('1h'),
});

export type ResilienceConfig = z.infer<typeof ResilienceSchema>;

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
  mcp: McpConfigSchema.default({}),
  permissions: PermissionsConfigSchema.default({}),
  security: SecurityConfigSchema.default({}),
  contexts: z.array(ContextConfigEntrySchema).default([]),
  memory: MemoryConfigSchema.default({}),
  knowledge: KnowledgeConfigSchema.default({}),
  resilience: ResilienceSchema.default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
export type KnowledgeConfig = z.infer<typeof KnowledgeConfigSchema>;
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

  if (process.env.REEBOOT_AUTH_MODE === 'pi' || process.env.REEBOOT_AUTH_MODE === 'own') {
    result.agent.model.authMode = process.env.REEBOOT_AUTH_MODE;
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
