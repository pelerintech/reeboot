import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-test-'));
  vi.resetModules();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('wizard — prepend new provider to list', () => {
  it('prepends new provider to existing providers array in launch step', async () => {
    // Create an existing config with one provider
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      agent: {
        name: 'OldAgent',
        model: {
          authMode: 'own',
          provider: 'anthropic',
          id: 'claude-sonnet-4-5',
          apiKey: 'sk-old-key',
          baseUrl: '',
          api: 'openai-completions',
          providers: [
            {
              name: 'Anthropic',
              provider: 'anthropic',
              id: 'claude-sonnet-4-5',
              apiKey: 'sk-old-key',
              baseUrl: '',
              api: 'openai-completions',
              default: true,
            },
          ],
        },
      },
      channels: { web: { enabled: true, port: 3000, trust: 'owner', trusted_senders: [] } },
      sandbox: { mode: 'os' },
      logging: { level: 'info' },
      server: {},
      extensions: { core: {} },
      routing: { default: 'main', rules: [] },
      session: {},
      credentialProxy: { enabled: false, port: 3001 },
      search: { provider: 'none', apiKey: '', searxngBaseUrl: 'http://localhost:8888' },
      heartbeat: { enabled: false, interval: 'every 5m', contextId: 'main' },
      skills: { permanent: [], ephemeral_ttl_minutes: 60, catalog_path: '' },
      mcp: { servers: [] },
      permissions: { violations: { log: true } },
      security: { injection_guard: { enabled: true, external_source_tools: [] }, dangerous_commands: { mode: 'deny', yolo: false, timeout: 60 }, website_blocklist: { enabled: false, domains: [] }, allow_private_urls: false, advisories: { acked_advisories: [] } },
      contexts: [],
      memory: { enabled: true, memoryCharLimit: 2200, userCharLimit: 1375, consolidation: { enabled: true, schedule: '0 2 * * *' } },
      knowledge: { enabled: false, embeddingModel: 'nomic-ai/nomic-embed-text-v1.5', dimensions: 768, chunkSize: 512, chunkOverlap: 64, wiki: { enabled: false, lint: { schedule: '0 9 * * 1' } } },
      resilience: { recovery: { mode: 'safe_only', side_effect_tools: [] }, scheduler: { catchup_window: '1h' }, outage_threshold: 3, probe_interval: '1h' },
      budget: { daily_tokens: null, daily_cost_usd: null, session_tokens: null, session_cost_usd: null, turn_tokens: null, turn_cost_usd: null, warn_threshold: 0.8 },
    }));

    const { runLaunchStep } = await import('@src/wizard/steps/launch.js');

    const fakePrompter = {
      confirm: vi.fn().mockResolvedValue(true),
    };

    await runLaunchStep({
      prompter: fakePrompter as any,
      configPath,
      draft: {
        authMode: 'own',
        provider: 'ollama',
        modelId: 'llama3',
        apiKey: 'sk-local-proxy',
        ollamaBaseUrl: 'http://localhost:11434/v1',
        agentName: 'NewAgent',
        whatsapp: false,
        signal: false,
        searchProvider: 'none',
      },
    });

    // Read the saved config
    const saved = JSON.parse(readFileSync(configPath, 'utf-8'));

    // Should have 2 providers, new one first
    expect(saved.agent.model.providers).toHaveLength(2);
    expect(saved.agent.model.providers[0].provider).toBe('ollama');
    expect(saved.agent.model.providers[0].default).toBe(true);
    expect(saved.agent.model.providers[1].provider).toBe('anthropic');
    expect(saved.agent.model.providers[1].default).toBe(false);
  });

  it('creates providers array when none existed (legacy config)', async () => {
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      agent: {
        name: 'OldAgent',
        model: {
          authMode: 'own',
          provider: 'openai',
          id: 'gpt-4o',
          apiKey: 'sk-openai-key',
        },
      },
      channels: { web: { enabled: true, port: 3000, trust: 'owner', trusted_senders: [] } },
      sandbox: { mode: 'os' },
      logging: { level: 'info' },
      server: {},
      extensions: { core: {} },
      routing: { default: 'main', rules: [] },
      session: {},
      credentialProxy: { enabled: false, port: 3001 },
      search: { provider: 'none', apiKey: '', searxngBaseUrl: 'http://localhost:8888' },
      heartbeat: { enabled: false, interval: 'every 5m', contextId: 'main' },
      skills: { permanent: [], ephemeral_ttl_minutes: 60, catalog_path: '' },
      mcp: { servers: [] },
      permissions: { violations: { log: true } },
      security: { injection_guard: { enabled: true, external_source_tools: [] }, dangerous_commands: { mode: 'deny', yolo: false, timeout: 60 }, website_blocklist: { enabled: false, domains: [] }, allow_private_urls: false, advisories: { acked_advisories: [] } },
      contexts: [],
      memory: { enabled: true, memoryCharLimit: 2200, userCharLimit: 1375, consolidation: { enabled: true, schedule: '0 2 * * *' } },
      knowledge: { enabled: false, embeddingModel: 'nomic-ai/nomic-embed-text-v1.5', dimensions: 768, chunkSize: 512, chunkOverlap: 64, wiki: { enabled: false, lint: { schedule: '0 9 * * 1' } } },
      resilience: { recovery: { mode: 'safe_only', side_effect_tools: [] }, scheduler: { catchup_window: '1h' }, outage_threshold: 3, probe_interval: '1h' },
      budget: { daily_tokens: null, daily_cost_usd: null, session_tokens: null, session_cost_usd: null, turn_tokens: null, turn_cost_usd: null, warn_threshold: 0.8 },
    }));

    const { runLaunchStep } = await import('@src/wizard/steps/launch.js');

    const fakePrompter = {
      confirm: vi.fn().mockResolvedValue(true),
    };

    await runLaunchStep({
      prompter: fakePrompter as any,
      configPath,
      draft: {
        authMode: 'own',
        provider: 'ollama',
        modelId: 'llama3',
        apiKey: 'sk-local-proxy',
        ollamaBaseUrl: 'http://localhost:11434/v1',
        agentName: 'NewAgent',
        whatsapp: false,
        signal: false,
        searchProvider: 'none',
      },
    });

    const saved = JSON.parse(readFileSync(configPath, 'utf-8'));

    // Should have providers array with the new entry
    expect(saved.agent.model.providers).toBeDefined();
    expect(saved.agent.model.providers.length).toBeGreaterThanOrEqual(1);
    expect(saved.agent.model.providers[0].provider).toBe('ollama');
    expect(saved.agent.model.providers[0].default).toBe(true);
  });

  it('preserves existing default when user declines to mark new provider as default', async () => {
    // Create an existing config with one default provider
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      agent: {
        name: 'OldAgent',
        model: {
          authMode: 'own',
          provider: 'anthropic',
          id: 'claude-sonnet-4-5',
          apiKey: 'sk-old-key',
          baseUrl: '',
          api: 'openai-completions',
          providers: [
            {
              name: 'Anthropic',
              provider: 'anthropic',
              id: 'claude-sonnet-4-5',
              apiKey: 'sk-old-key',
              baseUrl: '',
              api: 'openai-completions',
              default: true,
            },
          ],
        },
      },
      channels: { web: { enabled: true, port: 3000, trust: 'owner', trusted_senders: [] } },
      sandbox: { mode: 'os' },
      logging: { level: 'info' },
      server: {},
      extensions: { core: {} },
      routing: { default: 'main', rules: [] },
      session: {},
      credentialProxy: { enabled: false, port: 3001 },
      search: { provider: 'none', apiKey: '', searxngBaseUrl: 'http://localhost:8888' },
      heartbeat: { enabled: false, interval: 'every 5m', contextId: 'main' },
      skills: { permanent: [], ephemeral_ttl_minutes: 60, catalog_path: '' },
      mcp: { servers: [] },
      permissions: { violations: { log: true } },
      security: { injection_guard: { enabled: true, external_source_tools: [] }, dangerous_commands: { mode: 'deny', yolo: false, timeout: 60 }, website_blocklist: { enabled: false, domains: [] }, allow_private_urls: false, advisories: { acked_advisories: [] } },
      contexts: [],
      memory: { enabled: true, memoryCharLimit: 2200, userCharLimit: 1375, consolidation: { enabled: true, schedule: '0 2 * * *' } },
      knowledge: { enabled: false, embeddingModel: 'nomic-ai/nomic-embed-text-v1.5', dimensions: 768, chunkSize: 512, chunkOverlap: 64, wiki: { enabled: false, lint: { schedule: '0 9 * * 1' } } },
      resilience: { recovery: { mode: 'safe_only', side_effect_tools: [] }, scheduler: { catchup_window: '1h' }, outage_threshold: 3, probe_interval: '1h' },
      budget: { daily_tokens: null, daily_cost_usd: null, session_tokens: null, session_cost_usd: null, turn_tokens: null, turn_cost_usd: null, warn_threshold: 0.8 },
    }));

    const { runLaunchStep } = await import('@src/wizard/steps/launch.js');

    // User declines to make the new provider the default
    const fakePrompter = {
      confirm: vi.fn().mockResolvedValue(false),
    };

    await runLaunchStep({
      prompter: fakePrompter as any,
      configPath,
      draft: {
        authMode: 'own',
        provider: 'ollama',
        modelId: 'llama3',
        apiKey: 'sk-local-proxy',
        ollamaBaseUrl: 'http://localhost:11434/v1',
        agentName: 'NewAgent',
        whatsapp: false,
        signal: false,
        searchProvider: 'none',
      },
    });

    // Read the saved config
    const saved = JSON.parse(readFileSync(configPath, 'utf-8'));

    // Should have 2 providers, new one first but NOT default
    expect(saved.agent.model.providers).toHaveLength(2);
    expect(saved.agent.model.providers[0].provider).toBe('ollama');
    expect(saved.agent.model.providers[0].default).toBe(false);
    // Existing default provider retains default: true
    expect(saved.agent.model.providers[1].provider).toBe('anthropic');
    expect(saved.agent.model.providers[1].default).toBe(true);

    // Confirm the prompt was called
    expect(fakePrompter.confirm).toHaveBeenCalledOnce();
    expect(fakePrompter.confirm).toHaveBeenCalledWith({
      message: 'Make this the default provider?',
      default: true,
    });
  });
});
