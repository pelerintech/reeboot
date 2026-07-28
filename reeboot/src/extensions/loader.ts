/**
 * Extension Loader
 *
 * Creates a DefaultResourceLoader for a given context, configured with:
 *   - agentDir: ~/.reeboot/  (global extensions, skills, prompts)
 *   - cwd: context.workspacePath  (project-local .pi/ discovery)
 *   - extensionFactories: bundled extensions (always active unless toggled off)
 *   - additionalSkillPaths: bundled skills directory
 *
 * Bundled extension files live in <repoRoot>/extensions/ at the reeboot package root.
 * The loader resolves them relative to this source file's compiled location.
 *
 * SDK pluggability: the loader wraps pi's ExtensionAPI in a PiExtensionAdapter
 * before passing it to extensions. Extensions depend on reeboot's ExtensionAPI
 * interface, not pi directly. The adapter bridges pi events/methods to our
 * typed event model.
 */

import { DefaultResourceLoader, type ResourceLoader } from '@earendil-works/pi-coding-agent';
import type { ExtensionFactory } from '@earendil-works/pi-coding-agent';
import { PiExtensionAdapter } from './pi-adapter.js';
import type { ExtensionContext } from './extension-api.js';
import { homedir } from 'os';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { Config } from '../config.js';
import type { ContextConfig } from '../agent-runner/interface.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve the extensions/ and skills/ directories at the reeboot package root.
// __dirname is dist/extensions/ (compiled output location).
// All bundled extensions are compiled to dist/extensions/*.js via the main tsc.
// In vitest (source mode), __dirname = src/extensions/ so .js files don't exist —
// importExt() falls back to .ts for that case.
const PACKAGE_ROOT = resolve(__dirname, '../../');
const BUNDLED_EXTENSIONS_DIR = join(__dirname);
const BUNDLED_SKILLS_DIR = join(PACKAGE_ROOT, 'skills');

// ─── getBundledFactories ─────────────────────────────────────────────────────
// Returns the list of bundled ExtensionFactory functions based on config toggles.
// Exported for testing.

export function getBundledFactories(context: ContextConfig, config: Config): ExtensionFactory[] {
  const core = config?.extensions?.core ?? {};

  // Defaults (matching ConfigSchema defaults)
  const sandboxEnabled       = core.sandbox            ?? true;
  const confirmEnabled       = core.confirm_destructive ?? true;
  const protectedEnabled     = core.protected_paths    ?? true;
  const gitCheckpointEnabled = core.git_checkpoint     ?? false;
  const sessionNameEnabled   = core.session_name       ?? true;
  const compactionEnabled    = core.custom_compaction  ?? true;
  const schedulerEnabled     = core.scheduler_tool     ?? true;
  const tokenMeterEnabled    = core.token_meter        ?? true;
  const webSearchEnabled     = (core as any).web_search ?? true;
  const memoryEnabled        = (config as any).memory?.enabled ?? true;
  const knowledgeEnabled     = (config as any).knowledge?.enabled ?? false;
  const skillManagerEnabled  = (core as any).skill_manager ?? true;
  const mcpEnabled           = (core as any).mcp ?? true;
  const delegateEnabled      = (core as any).delegate ?? true;
  const injectionGuardEnabled = (core as any).injection_guard ?? true;

  const factories: ExtensionFactory[] = [];

  /**
   * Create an extension context from pi's runtime context.
   * The adapter will merge this with pi's ExtensionContext at runtime.
   */
  const createExtensionContext = (): ExtensionContext => ({
    cwd: context.workspacePath,
    workspacePath: context.workspacePath,
    config,
    ui: { select: async () => undefined, confirm: async () => false, input: async () => undefined, notify: () => {} },
    hasUI: false,
  });

  /**
   * Wrap an extension factory to inject the PiExtensionAdapter.
   * pi's DefaultResourceLoader passes pi's ExtensionAPI as `pi`.
   * We wrap it in our adapter so extensions receive reeboot's ExtensionAPI.
   */
  const withAdapter = (init: (api: any) => void | Promise<void>) => {
    return (pi: any) => {
      const adapter = new PiExtensionAdapter(pi, createExtensionContext());
      return init(adapter);
    };
  };

  // Note: sandbox requires its own npm install (has a package.json).
  // We load it as a factory only when enabled AND its index.ts is resolvable.
  // In test environments we skip sandbox gracefully.
  if (sandboxEnabled) {
    factories.push((pi) => {
      // Lazy-load so missing deps don't break startup in CI / test
      const sandboxPath = join(PACKAGE_ROOT, 'extensions', 'sandbox', 'index.ts');
      try {
        // Extensions are loaded by DefaultResourceLoader as file paths; we register
        // a no-op factory here and let the loader discover the file-based extension.
        // For inline factory we just return undefined (sandbox handles itself via additionalExtensionPaths).
      } catch { /* skip */ }
    });
  }

  // Simple file-based extensions registered as inline factories for reliability.
  // We use dynamic import factories so TypeScript strict mode is satisfied.

  // Helper: try compiled .js first (production dist/extensions/),
  // fall back to .ts (vitest runs from src/extensions/ without compilation)
  const importExt = (name: string) =>
    import(join(BUNDLED_EXTENSIONS_DIR, `${name}.js`))
      .catch(() => import(join(BUNDLED_EXTENSIONS_DIR, `${name}.ts`)))
      .catch(() => null);

  if (confirmEnabled) {
    factories.push(withAdapter(async (api) => {
      const mod = await importExt('confirm-destructive');
      if (mod?.default) mod.default(api);
    }));
  }

  if (protectedEnabled) {
    factories.push(withAdapter(async (api) => {
      const mod = await importExt('protected-paths');
      if (mod?.default) mod.default(api);
    }));
  }

  if (sessionNameEnabled) {
    factories.push(withAdapter(async (api) => {
      const mod = await importExt('session-name');
      if (mod?.default) mod.default(api);
    }));
  }

  if (compactionEnabled) {
    factories.push(withAdapter(async (api) => {
      const mod = await importExt('custom-compaction');
      if (mod?.default) mod.default(api);
    }));
  }

  if (gitCheckpointEnabled) {
    factories.push(withAdapter(async (api) => {
      const mod = await importExt('git-checkpoint');
      if (mod?.default) mod.default(api);
    }));
  }

  if (schedulerEnabled) {
    factories.push(withAdapter(async (api) => {
      const mod = await importExt('scheduler-tool');
      if (mod?.default) mod.default(api);
    }));
  }

  if (tokenMeterEnabled) {
    factories.push(withAdapter(async (api) => {
      const mod = await importExt('token-meter');
      if (mod?.default) mod.default(api);
    }));
  }

  if (webSearchEnabled) {
    factories.push(withAdapter(async (api) => {
      const mod = await importExt('web-search');
      if (mod?.default) await (mod.default as any)(api, config);
    }));
  }

  if (skillManagerEnabled) {
    factories.push(withAdapter(async (api) => {
      const mod = await importExt('skill-manager');
      if (mod?.default) await (mod.default as any)(api, config);
    }));
  }

  if (mcpEnabled) {
    factories.push(withAdapter(async (api) => {
      const mod = await importExt('mcp-manager');
      if (mod?.default) await (mod.default as any)(api, config);
    }));
  }

  if (injectionGuardEnabled) {
    factories.push(withAdapter(async (api) => {
      const mod = await importExt('injection-guard');
      if (mod?.default) await (mod.default as any)(api, config);
    }));
  }

  // Delegate tool — SDK-agnostic sub-agent delegation (feature flag).
  if (delegateEnabled) {
    factories.push(withAdapter(async (api) => {
      const mod = await importExt('delegate');
      if (mod?.delegateExtension) {
        // Pass runner factory and A2A client through config
        mod.delegateExtension(api, {});
      } else if (mod?.default) {
        (mod.default as any)(api, {});
      }
    }));
  }

  // Trust-enforcer — always loaded (no feature flag).
  // Hooks tool_call and blocks disallowed tools for end-user trust.
  // No-op when trust is owner or no whitelist is configured.
  factories.push(withAdapter(async (api) => {
    const mod = await importExt('trust-enforcer');
    if (mod?.makeTrustEnforcerExtension) {
      mod.makeTrustEnforcerExtension(api, config);
    } else if (mod?.default) {
      await (mod.default as any)(api, config);
    }
  }));

  // Memory manager — always loaded so session_search is always available.
  // The extension itself gates the memory tool and system prompt injection
  // on config.memory.enabled internally.
  factories.push(withAdapter(async (api) => {
    const mod = await importExt('memory-manager');
    if (mod?.default) await (mod.default as any)(api, config);
  }));

  // Budget manager — always loaded (no feature flag).
  // Registers set_budget, check_budget, budget_status tools and turn_end/agent_end hooks.
  factories.push(withAdapter(async (api) => {
    const mod = await importExt('budget-manager');
    if (mod?.makeBudgetManagerExtension) {
      const { getDb } = await import('../db/index.js');
      try {
        const db = getDb();
        mod.makeBudgetManagerExtension(api, { workspacePath: context.workspacePath, config });
      } catch {
        // If DB not available, fall back to default export
        if (mod?.default) mod.default(api);
      }
    } else if (mod?.default) {
      await (mod.default as any)(api, config);
    }
  }));

  // Observability extension — always loaded (no feature flag).
  // Registers session_shutdown and after_provider_response hooks.
  // Uses getDb() singleton to access the database.
  factories.push(withAdapter(async (api) => {
    const mod = await importExt('observability');
    if (mod?.makeObservabilityExtension) {
      const { getDb } = await import('../db/index.js');
      try {
        const db = getDb();
        const threshold = (config as any)?.logging?.rate_limit_warn_threshold ?? 5000;
        const configProvider: string = (config as any)?.agent?.model?.provider ?? 'unknown';
        mod.makeObservabilityExtension(api, db, { rateLimitWarnThreshold: threshold, configProvider });
      } catch {
        // DB not available yet — skip observability hooks silently
      }
    }
  }));

  // Capabilities discovery extension — always loaded (no feature flag).
  // Discovers all registered tools and injects a capabilities block into
  // the system prompt on every session start. Must be loaded AFTER all
  // other extensions so getAllTools() sees the full tool set.
  factories.push(withAdapter(async (api) => {
    const mod = await importExt('capabilities');
    if (mod?.default) await (mod.default as any)(api, config);
  }));

  // Knowledge manager — loaded when knowledge.enabled=true (default false).
  // Registers knowledge_search, knowledge_ingest, and optionally wiki tools.
  if (knowledgeEnabled) {
    factories.push(withAdapter(async (api) => {
      const mod = await importExt('knowledge-manager');
      if (mod?.makeKnowledgeExtension) {
        const { getDb } = await import('../db/index.js');
        try {
          const db = getDb();
          mod.makeKnowledgeExtension(api, config, db);
        } catch {
          // DB not available — call without DB
          mod.makeKnowledgeExtension(api, config);
        }
      } else if (mod?.default) {
        await (mod.default as any)(api);
      }
    }));
  }

  return factories;
}

// ─── getReeFactories ─────────────────────────────────────────────────────────
// Returns the list of ExtensionFactory functions for ree mode (TanStack AI).
// Unlike getBundledFactories, these factories take (api: ExtensionAPI) => void
// directly — NO withAdapter wrapper. The ReeRuntime calls each factory with
// a ReeExtensionAdapter directly.
//
// Four extensions run through the ree adapter:
// 1. observability — session_shutdown, after_provider_response
// 2. session-name — registerCommand, setSessionName/getSessionName
// 3. token-meter — agent_end
// 4. capabilities — before_agent_start, getAllTools (loaded LAST)

export function getReeFactories(config: Config): import('./extension-api.js').ExtensionFactory[] {
  const factories: import('./extension-api.js').ExtensionFactory[] = [];

  // Helper: try compiled .js first (production dist/extensions/),
  // fall back to .ts (vitest runs from src/extensions/ without compilation)
  const importExt = (name: string) =>
    import(join(BUNDLED_EXTENSIONS_DIR, `${name}.js`))
      .catch(() => import(join(BUNDLED_EXTENSIONS_DIR, `${name}.ts`)))
      .catch(() => null);

  // 1. observability — makeObservabilityExtension(api, db, opts)
  factories.push(async (api) => {
    const mod = await importExt('observability');
    if (mod?.makeObservabilityExtension) {
      try {
        const { getDb } = await import('../db/index.js');
        const db = getDb();
        const threshold = (config as any)?.logging?.rate_limit_warn_threshold ?? 5000;
        const configProvider: string = (config as any)?.agent?.model?.provider ?? 'unknown';
        mod.makeObservabilityExtension(api, db, { rateLimitWarnThreshold: threshold, configProvider });
      } catch {
        // DB not available — skip observability hooks silently
      }
    }
  });

  // 2. session-name — default(api)
  factories.push(async (api) => {
    const mod = await importExt('session-name');
    if (mod?.default) mod.default(api);
  });

  // 3. token-meter — default(api)
  factories.push(async (api) => {
    const mod = await importExt('token-meter');
    if (mod?.default) mod.default(api);
  });

  // 4. capabilities — default(api, config) — loads BEFORE session_search so
  //    session_search sees the full tool set from capabilities
  factories.push(async (api) => {
    const mod = await importExt('capabilities');
    if (mod?.default) await (mod.default as any)(api, config);
  });

  // 5. ree-session-search — session_search tool (ree mode only, scoped to current chat)
  factories.push(async (api) => {
    const mod = await importExt('ree-session-search');
    if (mod?.default) await (mod.default as any)(api, config);
  });

  // 6. injection-guard — default(api, config) — warns/blocks injection in untrusted messages
  factories.push(async (api) => {
    const mod = await importExt('injection-guard');
    if (mod?.default) (mod.default as any)(api, config);
  });

  // 7. trust-enforcer — makeTrustEnforcerExtension(api, config) — enforces trust policy per tool
  factories.push(async (api) => {
    const mod = await importExt('trust-enforcer');
    if (mod?.makeTrustEnforcerExtension) {
      mod.makeTrustEnforcerExtension(api, config);
    } else if (mod?.default) {
      await (mod.default as any)(api, config);
    }
  });

  // 8. delegate — delegateExtension(api, opts) — sub-agent delegation (ree mode)
  factories.push(async (api) => {
    const mod = await importExt('delegate');
    if (mod?.delegateExtension) {
      mod.delegateExtension(api, {});
    } else if (mod?.default) {
      (mod.default as any)(api, {});
    }
  });

  return factories;
}

// ─── createLoader ─────────────────────────────────────────────────────────────

export function createLoader(context: ContextConfig, config: Config): ResourceLoader {
  const agentDir = join(homedir(), '.reeboot', 'agent');
  const extensionFactories = getBundledFactories(context, config);

  // For sandbox, use additionalExtensionPaths so DefaultResourceLoader handles it
  const additionalExtensionPaths: string[] = [];
  const core = config?.extensions?.core ?? {};
  if (core.sandbox ?? true) {
    additionalExtensionPaths.push(join(PACKAGE_ROOT, 'extensions', 'sandbox', 'index.ts'));
  }

  return new DefaultResourceLoader({
    cwd: context.workspacePath,
    agentDir,
    extensionFactories,
    additionalExtensionPaths,
    additionalSkillPaths: [BUNDLED_SKILLS_DIR],
  });
}
