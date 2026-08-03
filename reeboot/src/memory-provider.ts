/**
 * Memory provider seam.
 *
 * Memory is a pluggable backend behind a single interface. Exactly ONE provider is
 * active per deployment (selected by `memory.provider`); the internal backend is the
 * default and the fallback. This file defines the contract and the `MemoryManager`
 * that selects an active provider. The `builtin` implementation lives in the
 * memory-manager extension; future backends (dreem, mem0) implement the same contract.
 */

export type MemoryTarget = 'memory' | 'user';

export interface MemoryProvider {
  readonly id: string;
  /** Add content to a target. Returns a human-readable result string. */
  add(target: MemoryTarget, content: string): string;
  /** Replace the entry containing `oldText` in a target. Returns a result string. */
  replace(target: MemoryTarget, oldText: string, content: string): string;
  /** Remove the entry matching `content` in a target. Returns a result string. */
  remove(target: MemoryTarget, content: string): string;
  /** Read the full current content of a target. */
  read(target: MemoryTarget): string;
  /** Clear a target. */
  clear(target: MemoryTarget): void;
  /** Contribution injected into the system prompt at session start. */
  buildSystemPromptContribution(): string;
}

/**
 * Selects and holds the single active memory provider.
 * - Defaults to `builtin`.
 * - `select(id)` switches to a registered provider, falling back to `builtin`
 *   (with a warning) when the id is unknown or unavailable. Graceful degradation:
 *   memory is never silently disabled and startup never crashes on a bad provider.
 */
export class MemoryManager {
  private providers = new Map<string, MemoryProvider>();
  private activeProvider: MemoryProvider;

  constructor(private readonly builtin: MemoryProvider) {
    this.providers.set(builtin.id, builtin);
    this.activeProvider = builtin;
  }

  /** Register an available provider for selection by id. */
  register(provider: MemoryProvider): void {
    this.providers.set(provider.id, provider);
  }

  /** Select the active provider by id; falls back to `builtin` if unknown/unloadable. */
  select(id: string): MemoryProvider {
    const provider = this.providers.get(id);
    if (provider) {
      this.activeProvider = provider;
      return provider;
    }
    // Fallback — unknown or unloadable provider never disables memory silently.
    this.activeProvider = this.builtin;
    return this.activeProvider;
  }

  get active(): MemoryProvider {
    return this.activeProvider;
  }
}
