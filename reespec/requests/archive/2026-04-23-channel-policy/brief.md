# Brief: Channel Policy Layer

## Problem

Reeboot has three channels (WhatsApp, Signal, web) with two more confirmed (Telegram, CLI) and
others planned (Slack, Discord). Every policy concern — owner identity, message filtering,
echo deduplication, message chunking, send guards — is currently re-implemented independently
in each channel adapter.

WhatsApp is the primary development and testing environment. Signal already lags behind:
- Missing `send()` status guard → throws instead of dropping silently when not connected
- Missing received-message and skipped-message logging → harder to debug
- `syncMessage` not filtered for self-destination → agent triggers on messages sent to third
  parties, then replies to those third parties
- No echo deduplication → any proactive agent message (scheduled, broadcast, heartbeat) will
  loop back as a new trigger

The web channel has its own gap: `__system__` broadcasts are silently dropped instead of
being forwarded to all connected clients.

Each new channel added will start from zero on all of these. There is no shared contract
that tells an implementer what they must get right, and no test suite that catches regressions.

## Goals

1. **Define and document a channel contract** — an explicit, human-readable specification of
   what every channel adapter must guarantee, split into two tiers: external messaging channels
   (WhatsApp, Signal, Telegram, Slack, Discord) and local interface channels (Web, CLI).

2. **Enforce the contract with tests** — a shared contract test suite that any channel can be
   run against. Each channel has a thin `<channel>.contract.test.ts` that invokes the shared
   suite. Channels must pass before shipping.

3. **Extract a policy layer** — a `ChannelPolicyLayer` that wraps any external messaging
   channel and handles all policy concerns: owner identity resolution, owner-only gating,
   `__system__` → owner address resolution, and trusted_senders. Channels become pure
   transport + protocol adapters.

4. **Owner identity model** — introduce `owner_id` config per external channel. Absent =
   Mode 1 (self-chat: `fromSelf=true` is owner). Present = Mode 2 (dedicated account:
   sender matches `owner_id`). Both modes must work. Mode 3 (trusted_senders as allowlist)
   is planned but deferred.

5. **Fix existing bugs** — bring Signal up to full contract compliance. Fix web `__system__`
   broadcast. Eliminate Signal's syncMessage loop.

## Non-Goals

- Mode 3 trusted_senders allowlist implementation (deferred — architecture must accommodate it)
- Telegram, Slack, Discord channel implementations (contract and policy layer are the
  foundation; adding those channels is a separate request)
- Multi-owner / multi-user deployments
- Any change to the `trust` / `trusted_senders` capability-level system from channel-trust

## Impact

- Every future channel implementation has a clear contract and a test suite to validate against
- Signal bugs fixed: no more loops, no more third-party replies, consistent logging
- Web broadcast fixed: startup notifications reach the web UI
- Policy concerns live in one place — changing owner_only behaviour touches one class, not N files
- The architecture explicitly accommodates Mode 3 and future channels without requiring
  further structural changes

## Approach

**Channel contract** — `src/channels/CHANNEL_CONTRACT.md`. Two tiers with explicit clauses.
Referenced from `ChannelAdapter` interface via JSDoc.

**Contract test suite** — `tests/channels/contract/runContractTests.ts` (external messaging)
and `tests/channels/contract/runLiteContractTests.ts` (local interface). Each channel has a
`tests/channels/<name>.contract.test.ts` that calls the shared suite with a factory function.

**Policy layer** — `src/channels/policy.ts` exports `ChannelPolicyLayer implements ChannelAdapter`.
It wraps an inner adapter, intercepts `init()` to read `owner_id` / `owner_only`, overrides
`send()` to resolve `__system__`, and wraps the bus publish path to gate inbound messages.

**`fromSelf` on IncomingMessage** — add `fromSelf?: boolean` to `IncomingMessage`. Each
external channel sets this. The policy layer uses it for Mode 1 owner resolution. Web and CLI
leave it absent (not applicable).

**Signal fixes** — self-destination filter on syncMessage, echo deduplication via sent-message
tracking (mirroring WhatsApp's `_sentIds`), `send()` status guard, received/skipped logging.

**Web fix** — `send('__system__', ...)` broadcasts to all registered peers.

## Out of Scope from decisions.md

- Trust level resolution (channel-trust request) remains untouched — `trusted_senders` in
  config continues to mean "elevate to owner capability level", not "allowlist"
- Per-context routing (existing routing rules) unchanged
