/**
 * Channel Registry
 *
 * Self-registering adapter registry. Built-in adapters call registerChannel()
 * at module import time. Custom adapters are loaded via dynamic import from
 * config.channels.<type>.adapter paths.
 */

import type { ChannelAdapter, ChannelConfig, MessageBus } from './interface.js';
import { ChannelPolicyLayer } from './policy.js';

/** Channel types that must be wrapped in ChannelPolicyLayer (Tier 1: external messaging). */
const TIER1_CHANNEL_TYPES = new Set(['whatsapp', 'signal', 'telegram', 'slack', 'discord']);

type AdapterFactory = () => ChannelAdapter;

// ─── ChannelRegistry ─────────────────────────────────────────────────────────

export class ChannelRegistry {
  private _factories = new Map<string, AdapterFactory>();

  register(type: string, factory: AdapterFactory): void {
    this._factories.set(type, factory);
  }

  get(type: string): AdapterFactory | undefined {
    return this._factories.get(type);
  }

  /**
   * Initialise channels from config.
   * - All known channel types are instantiated and added to the returned map
   *   (so they always appear in GET /api/channels).
   * - Only enabled channels are started (init + start called).
   * - Custom adapter paths are loaded via dynamic import.
   * - Load/start errors are caught per-adapter; other channels continue.
   * Returns a map of ALL adapters (started or not).
   */
  async initChannels(
    config: { channels: Record<string, ChannelConfig> },
    bus: MessageBus
  ): Promise<Map<string, ChannelAdapter>> {
    const all = new Map<string, ChannelAdapter>();

    for (const [type, channelCfg] of Object.entries(config.channels)) {
      try {
        let factory = this._factories.get(type);

        // Try loading a custom adapter from config path
        if (!factory && channelCfg.adapter) {
          try {
            const mod = await import(channelCfg.adapter);
            if (typeof mod.default === 'function') {
              factory = mod.default as AdapterFactory;
              this._factories.set(type, factory);
            } else {
              throw new Error(`Custom adapter at ${channelCfg.adapter} has no default export factory`);
            }
          } catch (err) {
            console.error(`[ChannelRegistry] Failed to load custom adapter for "${type}": ${err}`);
            continue;
          }
        }

        if (!factory) {
          console.warn(`[ChannelRegistry] No adapter registered for channel type "${type}" — skipping`);
          continue;
        }

        let adapter: ChannelAdapter = factory();

        // Tier 1 channels get wrapped in ChannelPolicyLayer before init/start.
        if (TIER1_CHANNEL_TYPES.has(type)) {
          adapter = new ChannelPolicyLayer(adapter);
        }

        if (channelCfg.enabled) {
          await adapter.init(channelCfg, bus);
          await adapter.start();
        }

        all.set(type, adapter);
      } catch (err) {
        console.error(`[ChannelRegistry] Failed to initialise channel "${type}": ${err}`);
      }
    }

    return all;
  }
}

// ─── Global singleton registry ────────────────────────────────────────────────

export const globalRegistry = new ChannelRegistry();

export function registerChannel(type: string, factory: AdapterFactory): void {
  globalRegistry.register(type, factory);
}
