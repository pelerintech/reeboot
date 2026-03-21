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

// Resolve the extensions/ and skills/ directories at the reeboot package root
// Compiled output is at dist/ so we go up two levels: dist/extensions/ → dist/ → reeboot/ then across to extensions/
const PACKAGE_ROOT = resolve(__dirname, '../../');
const BUNDLED_EXTENSIONS_DIR = join(PACKAGE_ROOT, 'extensions');
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
  const skillManagerEnabled  = (core as any).skill_manager ?? true;

  const factories: ExtensionFactory[] = [];

  // Note: sandbox requires its own npm install (has a package.json).
  // We load it as a factory only when enabled AND its index.ts is resolvable.
  // In test environments we skip sandbox gracefully.
  if (sandboxEnabled) {
    factories.push((pi) => {
      // Lazy-load so missing deps don't break startup in CI / test
      const sandboxPath = join(BUNDLED_EXTENSIONS_DIR, 'sandbox', 'index.ts');
      try {
        // Extensions are loaded by DefaultResourceLoader as file paths; we register
        // a no-op factory here and let the loader discover the file-based extension.
        // For inline factory we just return undefined (sandbox handles itself via additionalExtensionPaths).
      } catch { /* skip */ }
    });
  }

  // Simple file-based extensions registered as inline factories for reliability.
  // We use dynamic import factories so TypeScript strict mode is satisfied.

  if (confirmEnabled) {
    factories.push(async (pi) => {
      const mod = await import(join(BUNDLED_EXTENSIONS_DIR, 'confirm-destructive.ts')).catch(() => null);
      if (mod?.default) mod.default(pi);
    });
  }

  if (protectedEnabled) {
    factories.push(async (pi) => {
      const mod = await import(join(BUNDLED_EXTENSIONS_DIR, 'protected-paths.ts')).catch(() => null);
      if (mod?.default) mod.default(pi);
    });
  }

  if (sessionNameEnabled) {
    factories.push(async (pi) => {
      const mod = await import(join(BUNDLED_EXTENSIONS_DIR, 'session-name.ts')).catch(() => null);
      if (mod?.default) mod.default(pi);
    });
  }

  if (compactionEnabled) {
    factories.push(async (pi) => {
      const mod = await import(join(BUNDLED_EXTENSIONS_DIR, 'custom-compaction.ts')).catch(() => null);
      if (mod?.default) mod.default(pi);
    });
  }

  if (gitCheckpointEnabled) {
    factories.push(async (pi) => {
      const mod = await import(join(BUNDLED_EXTENSIONS_DIR, 'git-checkpoint.ts')).catch(() => null);
      if (mod?.default) mod.default(pi);
    });
  }

  if (schedulerEnabled) {
    factories.push(async (pi) => {
      const mod = await import(join(BUNDLED_EXTENSIONS_DIR, 'scheduler-tool.ts')).catch(() => null);
      if (mod?.default) mod.default(pi);
    });
  }

  if (tokenMeterEnabled) {
    factories.push(async (pi) => {
      const mod = await import(join(BUNDLED_EXTENSIONS_DIR, 'token-meter.ts')).catch(() => null);
      if (mod?.default) mod.default(pi);
    });
  }

  if (webSearchEnabled) {
    factories.push(async (pi) => {
      const mod = await import(join(BUNDLED_EXTENSIONS_DIR, 'web-search.ts')).catch(() => null);
      if (mod?.default) await (mod.default as any)(pi);
    });
  }

  if (skillManagerEnabled) {
    factories.push(async (pi) => {
      const mod = await import(join(BUNDLED_EXTENSIONS_DIR, 'skill-manager.ts')).catch(() => null);
      if (mod?.default) await (mod.default as any)(pi, config);
    });
  }

  return factories;
}

// ─── createLoader ─────────────────────────────────────────────────────────────

export function createLoader(context: ContextConfig, config: Config): ResourceLoader {
  const agentDir = join(homedir(), '.reeboot');
  const extensionFactories = getBundledFactories(config);

  // For sandbox, use additionalExtensionPaths so DefaultResourceLoader handles it
  const additionalExtensionPaths: string[] = [];
  const core = config?.extensions?.core ?? {};
  if (core.sandbox ?? true) {
    additionalExtensionPaths.push(join(BUNDLED_EXTENSIONS_DIR, 'sandbox', 'index.ts'));
  }

  return new DefaultResourceLoader({
    cwd: context.workspacePath,
    agentDir,
    extensionFactories,
    additionalExtensionPaths,
    additionalSkillPaths: [BUNDLED_SKILLS_DIR],
  });
}
