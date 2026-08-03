# Spec — auth-gated-tools

When a conversation authenticates, the agent's tool set expands to unlock gated
tools. ree (multi-user) mode only; pi mode is unchanged.

## S1 — Gated tools are hidden until the chat is authenticated

- **GIVEN** a ree chat at the default auth level (`anonymous`) and a tool registered with
  `minAuthLevel: 'customer'`
- **WHEN** the agent loop assembles the tools for the turn
- **THEN** that gated tool is excluded from the visible tool set; baseline tools (no
  `minAuthLevel`) remain available

## S2 — Raising the chat auth level unlocks gated tools on the next turn

- **GIVEN** the chat's auth level is raised to `customer` mid-conversation (via the
  reeboot-owned mechanism, e.g. `setAuthState`)
- **WHEN** the next turn's tool set is assembled
- **THEN** the `minAuthLevel: 'customer'` tool is now included and callable

## S3 — Lower auth levels cannot see higher-level tools

- **GIVEN** tools requiring `customer` and `admin`, and a chat at `customer`
- **WHEN** the tool set is assembled
- **THEN** the `customer` tool is present but the `admin` tool is not

## S4 — Gating is per-chat and ree-only

- **GIVEN** two ree chats in one process, one authenticated and one anonymous
- **WHEN** both assemble tool sets
- **THEN** each chat's visibility reflects its own auth level (no cross-chat leakage);
  and pi-mode sessions bind tools at creation, unaffected by this gating

## S5 — Auth-state change is a reeboot-owned mechanism

- **GIVEN** a deployment whose authentication flow completes
- **WHEN** the runtime/agent signals auth success (via the extension method and/or a
  first-class `auth_establish` tool)
- **THEN** the chat's auth level is updated through the reeboot API — the mechanism is
  reeboot-owned and not bolted onto a single SDK adapter
