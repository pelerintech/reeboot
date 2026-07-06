# Brief — support-agent-product

## Problem

The `support-runtime`, `support-chat-routing`, `support-production-loop`, and `support-db-abstraction` requests together deliver the **infrastructure** to host hundreds of customer support chats: a lightweight multi-chat runtime, dynamic routing, a production-grade agent loop, and a DB abstraction. None of them build the actual **support agent** — the conversation logic, the support-specific tools, and the channel integrations that make a customer support agent useful.

Right now, the support runtime can host a chat and run a generic agent loop, but that agent has no support tools (look up an order, escalate a ticket, fetch a knowledge-base article), no support-specific system prompt or guardrails, and no wired-up customer-facing channel. It is an empty shell.

## Vision

A customer support agent product layer on top of the support runtime: support-specific tools, a support-tuned system prompt with guardrails, and the channel integrations (WhatsApp/web/etc.) configured for customer-facing traffic. The agent has a defined mission scope, knows what it can and cannot do, and can hand off to a human when it hits its limits.

## Goals

- A set of support-specific tools (`lookup_order`, `escalate_to_human`, `fetch_kb_article`, etc.) registered through `SupportExtensionAdapter` — same `ExtensionAPI` as the coding tools, proving the tool-registration path works for non-coding domains.
- A support-tuned system prompt: mission scope, tone, refusal of out-of-scope requests, no leaking of internal config/tools/credentials (building on the existing `end-user` trust wrapping in `pi-runner.ts`).
- Human handoff: a tool or escalation path that flags a chat for human takeover (writes a row, notifies an owner channel).
- Channel configuration for customer-facing traffic (which channels are support-enabled, trusted-sender policy, send-guard rules).
- Conversation guardrails: max turns per chat, mission-scope enforcement, graceful refusal when the customer asks for something outside scope.

## Non-Goals

- Not building the support runtime or agent loop (see `support-runtime` + `support-production-loop`).
- Not building dynamic routing (see `support-chat-routing`).
- Not building the DB layer (see `support-db-abstraction`).
- Not building a human-agent console/dashboard (separate product work).
- Not training or fine-tuning models — uses configured provider models.

## What should be done first

1. **Define the support mission scope** — what this specific deployment's agent can and cannot do (order status? refunds? technical troubleshooting? account access?). This is a product decision, not an engineering one, and it determines the tool set and the system prompt. Resolve it with stakeholders before building tools.
2. **Build 2–3 support tools end-to-end** — pick the highest-value tools from the mission scope (likely `lookup_order` + `escalate_to_human`), register them through `SupportExtensionAdapter`, and prove they flow through the agent loop (tool_call → execute → tool_result → LLM). This validates the tool path for a non-coding domain.
3. **Write the support system prompt + guardrails** — mission scope, tone, refusal behaviour, end-user trust wrapping. Verify injection-guard / trust-enforcer degrade correctly in support mode (they were built for coding tools; confirm they no-op cleanly when those tools are absent).
4. **Wire one customer channel** — configure one real channel (likely WhatsApp, since `whatsapp.ts` exists) for support traffic, with trusted-sender policy and send-guard. Prove a real customer message flows: channel → orchestrator → support runner → channel reply.

## What to account for

- **End-user trust at scale.** Every customer message is untrusted. The existing `wrapUntrustedMessage` + injection-scanner must apply in support mode, not just pi-runner mode. Trust-enforcer's coding-tool whitelist is irrelevant for support — confirm it no-ops (or is configured with the support tool whitelist instead).
- **Human handoff state.** When a chat is escalated, the runtime must mark it so subsequent customer messages queue (not auto-respond) until a human picks it up. This is new orchestrator state — coordinate with `support-chat-routing`.
- **Mission-scope enforcement.** The agent must refuse out-of-scope requests gracefully. This is partly prompt, partly tool-availability (no `refund_order` tool = the agent literally cannot do it), partly a guardrail extension if the model tries to improvise.
- **Conversation continuity.** Support chats are multi-turn over hours/days. The bounded history (`maxHistoryPerChat`) must be large enough for a real conversation, or the runtime must persist/restore history from the DB on chat resume — coordinate with `support-db-abstraction`.
- **PII / data handling.** Customer support involves PII (order numbers, names). The system prompt, logs, and DB writes must be audited for what they store. The observability extension logs session events — confirm it does not log raw message PII.

## Scope

- New: `src/extensions/support-tools/` — support-specific tool extensions.
- New: support system prompt template + guardrails.
- Modified: channel config for support traffic (existing `whatsapp.ts` / `web.ts`).
- New: human-handoff state + notification path.
- Tests: support-tool registration + execution, system-prompt injection, end-to-end channel flow, guardrail refusal.

## Impact

- The support runtime gains a real, mission-scoped agent — not an empty loop.
- Customer-facing channels serve a useful, bounded support agent.
- The `ExtensionAPI` abstraction is proven across a second *domain* (support tools, not just coding tools) — the same tool-registration path serves both.
- Human handoff gives the deployment a safe failure mode when the agent hits its limits.
