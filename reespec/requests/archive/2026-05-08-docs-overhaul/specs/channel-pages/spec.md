# Spec — Channel Pages

## Capability: signal.md is accurate

GIVEN `docs/channels/signal.md`
WHEN a user follows the setup instructions
THEN the config example uses `apiPort: 8080` (number), NOT `apiUrl: "http://..."`

WHEN the config example is compared to `reeboot/src/config.ts` SignalChannelSchema
THEN all fields match: `enabled`, `phoneNumber`, `apiPort`, `pollInterval`,
  `owner_id`, `owner_only`, `trust`, `trusted_senders`

## Capability: trust-and-access.md exists

GIVEN `docs/channels/trust-and-access.md`
WHEN a user reads it
THEN it explains:
  - `trust: "owner" | "end-user"` per channel — what each value means for
    tool permissions and prompt injection guard behaviour
  - `owner_only: boolean` — when true, only the owner's messages are processed
  - `owner_id` — how to specify the owner's phone number / JID
  - `trusted_senders` array — additional senders who bypass owner_only
  - Which channels support which trust fields (all three: web, whatsapp, signal)
  - Practical examples: self-chat mode vs. dedicated account mode

## Capability: whatsapp.md is accurate

GIVEN `docs/channels/whatsapp.md`
WHEN a user reads it
THEN the setup steps reflect the actual implementation:
  - Mode 1 (self-chat): `owner_id` empty, agent runs on your own WhatsApp account
  - Mode 2 (dedicated account): `owner_id` set to owner's number, agent runs on
    a separate account
  - `owner_only` default is true — documented explicitly
  - Credentials persisted in `~/.reeboot/channels/whatsapp/auth/`
