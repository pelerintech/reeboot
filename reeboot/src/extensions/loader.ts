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
 */

import { DefaultResourceLoader, type ResourceLoader } from '@mariozechner/pi-coding-agent';
import type { ExtensionFactory } from '@mariozechner/pi-coding-agent';
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

export function getBundledFactories(config: Config): ExtensionFactory[] {
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
  const injectionGuardEnabled = (core as any).injection_guard ?? true;

  const factories: ExtensionFactory[] = [];

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
    factories.push(async (pi) => {
      const mod = await importExt('confirm-destructive');
      if (mod?.default) mod.default(pi);
    });
  }

  if (protectedEnabled) {
    factories.push(async (pi) => {
      const mod = await importExt('protected-paths');
      if (mod?.default) mod.default(pi);
    });
  }

  if (sessionNameEnabled) {
    factories.push(async (pi) => {
      const mod = await importExt('session-name');
      if (mod?.default) mod.default(pi);
    });
  }

  if (compactionEnabled) {
    factories.push(async (pi) => {
      const mod = await importExt('custom-compaction');
      if (mod?.default) mod.default(pi);
    });
  }

  if (gitCheckpointEnabled) {
    factories.push(async (pi) => {
      const mod = await importExt('git-checkpoint');
      if (mod?.default) mod.default(pi);
    });
  }

  if (schedulerEnabled) {
    factories.push(async (pi) => {
      const mod = await importExt('scheduler-tool');
      if (mod?.default) mod.default(pi);
    });
  }

  if (tokenMeterEnabled) {
    factories.push(async (pi) => {
      const mod = await importExt('token-meter');
      if (mod?.default) mod.default(pi);
    });
  }

  if (webSearchEnabled) {
    factories.push(async (pi) => {
      const mod = await importExt('web-search');
      if (mod?.default) await (mod.default as any)(pi, config);
    });
  }

  if (skillManagerEnabled) {
    factories.push(async (pi) => {
      const mod = await importExt('skill-manager');
      if (mod?.default) await (mod.default as any)(pi, config);
    });
  }

  if (mcpEnabled) {
    factories.push(async (pi) => {
      const mod = await importExt('mcp-manager');
      if (mod?.default) await (mod.default as any)(pi, config);
    });
  }

  if (injectionGuardEnabled) {
    factories.push(async (pi) => {
      const mod = await importExt('injection-guard');
      if (mod?.default) await (mod.default as any)(pi, config);
    });
  }

  // Memory manager — always loaded so session_search is always available.
  // The extension itself gates the memory tool and system prompt injection
  // on config.memory.enabled internally.
  factories.push(async (pi) => {
    const mod = await importExt('memory-manager');
    if (mod?.default) await (mod.default as any)(pi, config);
  });

  // Knowledge manager — loaded when knowledge.enabled=true (default false).
  // Registers knowledge_search, knowledge_ingest, and optionally wiki tools.
  if (knowledgeEnabled) {
    factories.push(async (pi) => {
      const mod = await importExt('knowledge-manager');
      if (mod?.default) await (mod.default as any)(pi);
    });
  }

  return factories;
}

// ─── createLoader ─────────────────────────────────────────────────────────────

export function createLoader(context: ContextConfig, config: Config): ResourceLoader {
  const agentDir = join(homedir(), '.reeboot', 'agent');
  const extensionFactories = getBundledFactories(config);

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
