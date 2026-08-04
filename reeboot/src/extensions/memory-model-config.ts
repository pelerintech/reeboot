/**
 * Model-config sharing coordinator.
 *
 * reeboot's active model config (config.agent.model) is surfaced here so
 * providers (e.g. dreem) can inherit it and pass the same LLM choice to their
 * backend — unless the providerConfig.llm override takes precedence.
 * Module-level runtime state, not persisted.
 */

let modelConfig: Record<string, unknown> | undefined;

/** Set reeboot's active model config (called by the memory extension at load). */
export function setReebootModelConfig(mc?: Record<string, unknown>): void {
  modelConfig = mc;
}

/** Get reeboot's active model config (undefined when unset). */
export function getReebootModelConfig(): Record<string, unknown> | undefined {
  return modelConfig;
}
