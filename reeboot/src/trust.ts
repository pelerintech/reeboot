/**
 * Trust Primitives
 *
 * Shared types and defaults for the permission tier system.
 * Designed to be extended by the channel-trust request (R2a).
 */

// ─── TrustLevel ───────────────────────────────────────────────────────────────

export const TrustLevel = {
  Builtin: 'builtin',  // bundled extensions — full permissions, no restrictions
  Mcp:     'mcp',      // MCP servers — configurable, default deny
  Skill:   'skill',    // skills — prompt-level only (R2b)
} as const;

export type TrustLevel = typeof TrustLevel[keyof typeof TrustLevel];

// ─── McpPermissions ───────────────────────────────────────────────────────────

// Capabilities that can be explicitly granted to MCP servers.
// Credentials, subprocess, and conversation-read are never grantable.
export interface McpPermissions {
  network:    boolean;  // outbound network calls — default false
  filesystem: boolean;  // read-only filesystem access — default false
                        // write access is never grantable via config
}

export const MCP_DEFAULTS: McpPermissions = {
  network:    false,
  filesystem: false,
};

// ─── MessageTrust ─────────────────────────────────────────────────────────────

export type MessageTrust = 'owner' | 'end-user';

/**
 * Resolve the trust level for an incoming message.
 *
 * Resolution order:
 *   1. Sender-level override (trusted_senders) → 'owner'
 *   2. Channel-level default (trust field)
 *   3. Unknown channel or missing trust field → 'owner' (safe default)
 */
export function resolveMessageTrust(
  channelType: string,
  peerId: string,
  config: { channels: Record<string, any> },
): MessageTrust {
  const ch = config.channels?.[channelType];
  if (!ch) return 'owner';

  const trustedSenders: string[] = ch.trusted_senders ?? [];
  if (trustedSenders.includes(peerId)) return 'owner';

  return (ch.trust as MessageTrust) ?? 'owner';
}
