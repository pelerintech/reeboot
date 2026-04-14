# Brief: Channel Trust

## Problem

Reeboot has no concept of who is sending a message. Every inbound message — whether from the owner managing their agent or from an untrusted end-user interacting via a deployed channel — is treated identically. The agent responds with full access to all configured tools and no awareness of the sender's trust level.

This makes multi-party deployments unsafe. A concrete example: an owner deploys reeboot as a customer support agent on their website. The agent should help customers collect contact details and check calendar availability — but a customer asking "list your tools" or "show me your credentials" should be refused, not complied with. The owner interacting via their personal WhatsApp, however, should retain full access.

A second failure mode: an owner deploys reeboot as a client work assistant (code reviews, proposals, research). Client A's documents, code, and generated artifacts must not be accessible when the agent is working in the context of client B. There is currently no mechanism to enforce this boundary.

## Goal

Introduce channel-level and sender-level trust tagging so the agent knows the trust level of every message it receives. Pair this with a deployment tool whitelist so each deployment declares exactly which tools are available — and to whom. Owner-trust contexts retain full access; end-user-trust contexts are restricted to the declared whitelist.

The implementation must be generic. The customer support and client work assistant scenarios discussed during discovery are examples that grounded the design — not the only valid deployments. The trust resolution and whitelist mechanism should apply to any reeboot deployment where different principals interact with the same agent instance, regardless of use case.

## Approach

**Trust resolution** — a config-driven, two-level model:

1. **Channel-level default**: each configured channel declares a default trust level (`owner` or `end-user`). A personal WhatsApp defaults to `owner`; a website API channel defaults to `end-user`.
2. **Sender-level override**: within a channel, specific sender identifiers (phone numbers, user IDs) can be elevated to `owner` trust, overriding the channel default.

Resolution order: sender-level wins over channel-level. If no sender override exists, the channel default applies.

**Deployment tool whitelist** — each deployment (context) declares the set of tools available for `end-user` sessions. Owner sessions always have access to all configured tools. Unwhitelisted tools are not registered for end-user sessions — they do not exist to enumerate or call.

**Trust context injection** — when a session starts, the resolved trust level is attached as session metadata. Extensions and the runner can read it. The trust infrastructure introduced in the permission-tiers request (`TrustLevel`, `PermissionPolicy`) is reused here.

## Scope

- `src/trust.ts` — extend with `MessageTrust` type and trust resolution logic (channel → sender lookup) (~40 LOC added)
- `src/channels/` — attach resolved trust level to inbound messages in each channel adapter (~20 LOC across adapters)
- `src/agent-runner/pi-runner.ts` — pass trust context into session, filter tool registration based on whitelist for end-user sessions (~50 LOC)
- `src/config.ts` — new `channels[].trust`, `channels[].trusted_senders[]`, and `contexts[].tools.whitelist` config schema (~40 LOC)
- Tests covering: trust resolution, sender override, whitelist enforcement (~150 LOC)

## Out of Scope

- Injection defense and scope enforcement (deferred to injection-defense request)
- Tool result trust tagging (deferred to injection-defense request)
- Approval gates for autonomous actions (separate roadmap idea)
- Cross-context data isolation at the filesystem level (future work)

## Config Shape

```json
{
  "channels": [
    {
      "type": "whatsapp",
      "name": "personal",
      "trust": "owner"
    },
    {
      "type": "web",
      "name": "support-site",
      "trust": "end-user"
    },
    {
      "type": "whatsapp",
      "name": "business",
      "trust": "end-user",
      "trusted_senders": ["+15551234567"]
    }
  ],
  "contexts": [
    {
      "name": "support",
      "tools": {
        "whitelist": ["send_message", "check_calendar_availability", "web_capture"]
      }
    }
  ]
}
```

## Key Decisions Made in Discovery

- **Channel-level default + sender-level override**: two-level config resolution keeps the common case simple (declare the channel trust once) while supporting the edge case of a trusted sender on an otherwise untrusted channel.
- **Whitelist over blacklist**: end-user sessions get only the tools declared in the deployment whitelist. Unlisted tools are not registered — they cannot be enumerated or called, not just blocked at execution.
- **Owner sessions unrestricted**: trust resolution only restricts end-user sessions. Owner-trust messages always have access to all configured tools.
- **Reuses permission-tiers infrastructure**: `TrustLevel` and `PermissionPolicy` from the permission-tiers request are extended here rather than duplicated. This request depends on permission-tiers shipping first.
- **Injection defense excluded**: this request establishes *who is speaking* and *what tools exist*. It does not defend against adversarial prompts trying to break out of scope — that is the injection-defense request.
