/**
 * Headless ExtensionContext synthesizer.
 *
 * Pass-through MCP calls have no live agent session. This builder produces a
 * standards-compliant `ExtensionContext` for a headless tool invocation: no UI,
 * a scratch workspace, and the app's config/db/modelRegistry so self-contained
 * tools (those pulling getDb()/getLogger()) run unchanged.
 */
import type { ExtensionContext } from './extension-api.js';

export interface HeadlessContextInputs {
  workspacePath: string;
  config: Record<string, any>;
  db?: any;
  modelRegistry?: any;
  sessionManager?: any;
}

export function buildHeadlessContext(inputs: HeadlessContextInputs): ExtensionContext {
  return {
    cwd: inputs.workspacePath,
    workspacePath: inputs.workspacePath,
    config: inputs.config,
    db: inputs.db,
    modelRegistry: inputs.modelRegistry,
    sessionManager: inputs.sessionManager,
    ui: {
      select: async () => undefined,
      confirm: async () => false,
      input: async () => undefined,
      notify: () => {},
    },
    hasUI: false,
  };
}
