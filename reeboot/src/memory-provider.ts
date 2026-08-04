/**
 * Memory provider seam.
 *
 * Memory is a pluggable backend behind a single interface. Exactly ONE provider is
 * active per deployment (selected by `memory.provider`); the internal backend is the
 * default and the fallback. This file defines the contract and the `MemoryManager`
 * that selects an active provider. The `builtin` implementation lives in the
 * memory-manager extension; future backends (dreem, mem0) implement the same contract.
 */

import { getLogger } from './observability/logger.js';

export type MemoryTarget = 'memory' | 'user';

// ─── The reshaped, action-shaped contract ───────────────────────────────────
// Memory is a pluggable backend. Exactly ONE provider is active per deployment
// (selected by `memory.provider`). This contract is semantic and capability-
// shaped rather than file-shaped: every operation is scoped, recall is
// query-based, refs are opaque, and grounding is provider-owned.

/**
 * First-class singular scope axis threading through every operation.
 * `self` = the agent's own notes; `human` = the owner profile;
 * `both` = composite (recall merges + ranks across both).
 */
export const MEMORY_SCOPES = ['self', 'human', 'both'] as const;
export type MemoryScope = (typeof MEMORY_SCOPES)[number];

/**
 * Opaque, backend-specific handle. The manager never inspects the shape.
 * The provider owns the translation (file substring, concept path, memory id).
 */
export interface MemoryRef {
  readonly id: string;
}

/** A recalled memory result. */
export interface MemoryHit {
  ref: MemoryRef;
  scope: MemoryScope;
  content: string;
  /** Optional relevance score, set by backends that rank. */
  score?: number;
}

/**
 * A provider-declared optional capability, surfaced through the uniform
 * capability registry as a namespaced tool.
 */
export interface CapabilityDef {
  /** Namespaced: `memory::<providerId>::<name>` */
  readonly name: string;
  readonly description: string;
  /** Tool schema (TypeBox TSchema or plain JSON schema). */
  readonly parameters: unknown;
  /** Stable identifier for a standard, manager-recognised declaration (e.g. `selfConsolidating`). */
  readonly key?: string;
  /** Minimum auth level required for this tool to be visible (permission-tier gate). */
  readonly minAuthLevel?: 'anonymous' | 'customer' | 'admin';
  /** Provider-owned handler invoked when the declared tool is called. */
  execute?(params: unknown): Promise<unknown> | unknown;
}

export interface MemoryProvider {
  readonly id: string;

  // core — every provider honors these
  store(scope: MemoryScope, content: string): Promise<MemoryRef>;
  update(scope: MemoryScope, ref: MemoryRef, content: string): Promise<void>;
  forget(scope: MemoryScope, ref: MemoryRef): Promise<void>;
  recall(scope: MemoryScope, query: string, limit?: number): Promise<MemoryHit[]>;
  clear(scope: MemoryScope): Promise<void>;
  grounding(opts?: { scope?: MemoryScope; maxChars?: number }): Promise<string>;

  // optional capability surface — uniform registry
  listCapabilities(): CapabilityDef[];
}

/**
 * Standard, manager-recognised capability keys. `selfConsolidating` gates
 * reeboot's own consolidation job: true → the backend's own loop owns it;
 * false/absent → reeboot runs its job through the provider contract.
 */
export const STANDARD_CAPABILITIES = {
  selfConsolidating: 'selfConsolidating',
  hotMemory: 'hotMemory',
} as const;

/**
 * Test whether a provider declares an optional capability matching `key`.
 */
export function hasCapability(provider: MemoryProvider, key: string): boolean {
  return provider.listCapabilities().some((c) => c.key === key);
}

/**
 * Namespace a capability name for filterability, logging, and audit attribution.
 * @example namespaceCapability('dreem', 'graph') → 'memory::dreem::graph'
 */
export function namespaceCapability(providerId: string, name: string): string {
  return `memory::${providerId}::${name}`;
}

/**
 * Selects and holds the single active memory provider.
 * - Defaults to `builtin`.
 * - `select(id)` switches to a registered provider, falling back to `builtin`
 *   (with a logged warning) when the id is unknown or unavailable. Graceful degradation:
 *   memory is never silently disabled and startup never crashes on a bad provider.
 */
export class MemoryManager {
  private providers = new Map<string, MemoryProvider>();
  private activeProvider: MemoryProvider;

  constructor(
    private readonly builtin: MemoryProvider,
    /** Injectable logger for the graceful-degradation fallback; defaults to the global logger. */
    private readonly warn: (msg: string) => void = (msg) => getLogger().warn(msg)
  ) {
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
    this.warn(
      `[memory] provider '${id}' is not available (not registered or failed to load); ` +
        `falling back to 'builtin'`
    );
    this.activeProvider = this.builtin;
    return this.activeProvider;
  }

  get active(): MemoryProvider {
    return this.activeProvider;
  }

  // ── Core dispatch — routes exclusively via the provider contract (S5) ──
  // The manager passes ONLY opaque refs + scope tokens to the active provider;
  // it never transforms results, never inspects ref internals, never assumes
  // backend addressing.

  store(scope: MemoryScope, content: string): Promise<MemoryRef> {
    return this.activeProvider.store(scope, content);
  }
  update(scope: MemoryScope, ref: MemoryRef, content: string): Promise<void> {
    return this.activeProvider.update(scope, ref, content);
  }
  forget(scope: MemoryScope, ref: MemoryRef): Promise<void> {
    return this.activeProvider.forget(scope, ref);
  }
  recall(scope: MemoryScope, query: string, limit?: number): Promise<MemoryHit[]> {
    return this.activeProvider.recall(scope, query, limit);
  }
  clear(scope: MemoryScope): Promise<void> {
    return this.activeProvider.clear(scope);
  }
  grounding(opts?: { scope?: MemoryScope; maxChars?: number }): Promise<string> {
    return this.activeProvider.grounding(opts);
  }

  /** The active provider's declared capabilities (uniform registry). */
  listCapabilities(): CapabilityDef[] {
    return this.activeProvider.listCapabilities();
  }
}
