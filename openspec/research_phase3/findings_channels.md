# Findings: Multi-Channel Architecture

**Research Date:** 2026-03-20
**Research Question:** How do open-source and commercial AI agent systems architect multi-channel support (Slack, Discord, WhatsApp, Telegram, email, SMS, etc.)? What adapter/plugin patterns work well?

---

## Key Findings

1. **The Channel Adapter pattern is universal** — every mature framework (Botpress, OpenClaw, LettaBot, Rasa, AG2) converges on a "channel adapter" interface that translates platform-specific payloads into a canonical internal message format.

2. **Inbound normalization + outbound rendering** — adapters have two clear responsibilities: normalize incoming events to a shared `Message` type, and render outgoing responses back into platform-native formats (Slack Blocks, Telegram keyboards, WhatsApp templates).

3. **Capabilities matrix / declarative feature flags** — frameworks declare what each channel *can* do (reactions, threading, editing, polls) at the metadata level. Core logic branches on these flags rather than on channel identity.

4. **One agent, one conversation** — the leading architecture (OpenClaw/LettaBot) routes all channels into a single agent with shared memory/context. Users can start on WhatsApp and continue on Slack with full continuity.

5. **Separate adapter process from core** — adapters run as lightweight, hot-pluggable modules; the core agent/gateway never changes when a new channel is added.

6. **Plugin/integration registries** — Botpress Hub, OpenClaw's plugin registry, and AG2's `commsagent-*` extras all show that user-installable channel plugins are the preferred distribution model.

7. **Configuration-driven activation** — channels are enabled via config file or environment variables; no code changes to the core are required. Pattern: `channels.telegram.enabled: true` + token.

---

## Common Architectural Patterns

### Pattern 1: Channel Adapter Interface (Universal)

Every framework defines a typed interface each channel must implement:

```typescript
// LettaBot's ChannelAdapter interface (src/channels/types.ts)
interface ChannelAdapter {
  start(): Promise<void>
  stop(): Promise<void>
  sendMessage(conversationId: string, message: OutboundMessage): Promise<void>
  sendTypingIndicator(conversationId: string): Promise<void>
  editMessage?(messageId: string, newText: string): Promise<void>
  supportsEditing(): boolean
  onMessage: (handler: (msg: InboundMessage) => Promise<void>) => void
  onCommand: (handler: (cmd: Command) => Promise<void>) => void
}
```

```typescript
// OpenClaw's ChannelPlugin contract (types.plugin.ts)
// Parameterized generics: ResolvedAccount, Probe, Audit
// ~25 optional adapter slots grouped in 5 tiers:
// 1. Identity & Metadata: id, meta, capabilities, configSchema
// 2. Account & Configuration: config, setup, setupWizard, reload
// 3. Security & Policy: security, elevated, commands, allowlist, pairing
// 4. Inbound: message handler, normalization to MsgContext
// 5. Outbound: rendering, chunking, formatting
```

```typescript
// Botpress Integration Definition (integrations.definition.ts)
new IntegrationDefinition({
  name: "my-channel",
  version: "0.0.1",
  configuration: { schema: z.object({ token: z.string() }) },
  channels: {
    main: {
      conversation: { tags: { id: { title: "Conversation ID" } } },
      messages: {
        text: { schema: z.object({ text: z.string() }) },
        // image, card, carousel, etc.
      },
    },
  },
  user: { tags: { id: { title: "User ID" } } },
})
```

### Pattern 2: Declarative Capabilities Matrix

Rather than probing adapters at runtime, frameworks declare capabilities upfront:

```typescript
// OpenClaw ChannelCapabilities (types.core.ts)
interface ChannelCapabilities {
  chatTypes: Array<"dm" | "group" | "channel" | "thread">
  polls: boolean
  reactions: boolean       // used for ACK indicators
  edit: boolean
  unsend: boolean
  reply: boolean
  blockStreaming: boolean  // typing indicator respects this
}
```

LettaBot's capability table:
| Channel | Adapter Class | Connection Type | Edit Support |
|---------|--------------|-----------------|--------------|
| Telegram | TelegramAdapter | Long-polling HTTP | Yes |
| Slack | SlackAdapter | Socket Mode WebSocket | Yes |
| WhatsApp | WhatsAppAdapter | Baileys WebSocket | No |
| Signal | SignalAdapter | HTTP to local daemon | No |

### Pattern 3: Unified Message Envelope

All channels converge to a single internal type before reaching the agent:

```typescript
// Generic MsgContext (OpenClaw) — platform-specific payloads normalize into this
interface MsgContext {
  channelId: string
  senderId: string
  conversationId: string   // mapped to persistent session key
  text?: string
  attachments?: Attachment[]
  replyTo?: string
  threadId?: string
  raw: unknown              // original platform payload preserved
}
```

### Pattern 4: Inbound Pipeline with Guard Layers

After normalization, messages pass through sequential processing stages:

1. **Debounce Policy** — merge rapid edits within configurable window
2. **Allowlist Matching** — per-channel access control (DM, group)
3. **Mention Gating** — require explicit bot mention in group chats
4. **Command Gating** — restrict slash commands to authorized users
5. **Session Resolution** — map conversation identity to persistent session key

### Pattern 5: Outbound Rendering with Channel Hints

A single AI response adapts to platform-specific rich formats:

```yaml
# OpenClaw channel_hints pattern
response:
  text: "Pick a date for your appointment."
  channel_hints:
    slack:
      blocks:
        - type: section
          accessory:
            type: datepicker
    telegram:
      reply_markup:
        inline_keyboard:
          - [{text: "Today", callback_data: "today"}]
```

### Pattern 6: Plugin Registry with Hot-Loading

```typescript
// OpenClaw src/plugins/registry.ts
// Supports plugins of types:
// - tools, hooks, channels, providers, gateway handlers, HTTP routes, CLI commands, services
// Exposed via stable SDK: src/plugin-sdk/index.ts
```

Botpress uses an `adk add` CLI command pattern:
```bash
adk add slack@latest
adk add my-workspace/custom-integration@1.0.0
adk add webchat --alias custom-webchat
```

### Pattern 7: Configuration-Driven Channel Activation

```yaml
# openclaw.yaml (3-step pattern)
channels:
  telegram:
    enabled: true
    token: ${TELEGRAM_BOT_TOKEN}
  discord:
    enabled: true
    token: ${DISCORD_BOT_TOKEN}
  whatsapp:
    enabled: true
    # Baileys-based, no token — uses QR code pairing
```

Each channel runs in its own lightweight thread; adding channels does not degrade performance.

---

## Examples from Real Projects

### OpenClaw (TypeScript, 430K lines, ~117K GitHub stars, late 2025)

**Architecture:**
- 6-stage pipeline: Channel Adapter → Gateway Server → Lane Queue → Agent Runner → Agentic Loop → Response Path
- `src/channels/` — dock-and-plugin pattern: lightweight "dock" configs declare capabilities, heavy plugins register full adapters
- Built-in: Telegram (grammY), Discord (discord.js), Slack (Bolt), Signal (signal-cli), WhatsApp (Baileys), iMessage
- Extension packages in `extensions/` for iMessage, Signal, WhatsApp, Telegram, Matrix, Teams, Zalo, voice-call
- Plugin SDK at `src/plugin-sdk/index.ts` — stable public surface for third-party channel authors
- **50+ supported platforms** via channel adapters and community plugins

**Key design decisions:**
- Serial execution by default (Lane Queue prevents race conditions)
- Loopback-only WebSocket (`ws://127.0.0.1:18789`) — secure by default
- JSONL transcripts for full audit/replay of all agent actions
- Contract test infrastructure (`contracts/inbound-testkit.ts`) lets channel authors validate their normalization without booting the full gateway

**Quote (from OpenClaw docs):**
> "Every channel follows the same three-step pattern: Create credentials on the external platform (API key, bot token, app ID, etc.). Add credentials to OpenClaw via environment variables or the openclaw.yaml configuration file. Start or restart OpenClaw — the adapter picks up the new configuration automatically."

### LettaBot / letta-ai (TypeScript, open source, Jan 2026)

**Architecture:**
- `ChannelAdapter` interface with lifecycle methods (`start()`, `stop()`), messaging methods, event handlers
- Supports: Telegram, Slack, WhatsApp (Baileys), Signal
- **One agent, one conversation** — all channels share memory and context
- Outbound-only connections with no exposed ports required
- Independent access control per channel

**Source:** `src/channels/types.ts`, `src/channels/telegram.ts`, `src/channels/slack.ts`, `src/channels/whatsapp.ts`, `src/channels/signal.ts`

### Botpress (SaaS + self-hosted, commercial)

**Architecture:**
- Integrations are the core extensibility unit — each messaging channel is an integration
- Integration SDK defines channels declaratively: name, message types, tags, conversation schema
- Webhook-based: external platform → `webhook.botpress.cloud/$webhookId` → Botpress → integration → bot → integration → platform
- Each channel is identified by `integration:channel` (e.g., `webchat.channel`, `slack.channel`)
- Channel wildcards: `channel: "*"` handles all channels; `channel: "webchat.channel"` for specific
- Hub marketplace (`adk search`, `adk add`, `adk remove`) for installable integrations
- Integration Access Keys — scoped tokens limiting API surface per integration

**Quote (Botpress docs):**
> "Without an integration, your bot can't receive or send messages — every message must go through an Integration."
> "Channels specifies supported messaging channels. This example uses a single webhook channel, but you can define multiple. For example, GitHub allows conversing with your bot on issues and pull requests."

### AG2 / AutoGen (Python, Microsoft-lineage)

**Architecture:**
- Channel integrations as `tools` attached to agents — not adapters, but callable functions
- `DiscordSendTool`, `DiscordRetrieveTool`, `SlackSendTool`, `SlackRetrieveTool`, `TelegramSendTool`, `TelegramRetrieveTool`
- Install-per-channel extras: `ag2[commsagent-discord]`, `ag2[commsagent-slack]`, `ag2[commsagent-telegram]`
- Dependency injection protects auth credentials from LLM
- Status: experimental namespace, not yet production-confirmed

**Code pattern:**
```python
from autogen.tools.experimental import DiscordSendTool, DiscordRetrieveTool

# Agent gets tools registered; separate executor agent runs them
# Platform-specific agents with platform-tailored system messages recommended
```

**Quote:**
> "It may be most typical that you create an agent for each platform and attach their respective send and/or retrieve tools. This would allow you to tailor your system message for your agent to the messaging style used for the platform."

### LangChain / LangSmith

- No native multi-channel framework
- LangSmith Fleet has a Slack integration for agent-to-user communication in Slack
- Community adapters for Telegram, Discord exist but are not first-class
- Pattern: agents communicate *via* tools that call messaging APIs, not via a dedicated channel abstraction

---

## What Works / What Doesn't

### ✅ What Works Well

1. **Typed channel interface** — forces consistency, enables static type checking at build time (TypeScript generics in OpenClaw catch shape mismatches at compile time)

2. **Capability declaration over capability probing** — declaring `edit: boolean` once drives all downstream logic; no scattered `if (channel === 'slack')` checks

3. **Inbound normalization before business logic** — pure functions of `MsgContext + Config` = testable in isolation without booting real messaging platforms

4. **Contract test kits** — OpenClaw's `inbound-testkit.ts` lets channel authors verify normalization without the full gateway; critical for external contributor quality

5. **Config-driven activation** — adding a channel requires zero code changes to core (just config + credentials)

6. **Plugin registries with versioning** — Botpress Hub's `adk add slack@latest` and OpenClaw's ClawHub marketplace make discovery and installation trivial

7. **Channel-specific metadata preservation** — passing `raw` platform payload through the normalized message allows channel-specific features without polluting the interface

8. **Separate extension directory per channel** — OpenClaw's `extensions/<channel>/src/` isolation means each channel is independently deployable and testable

9. **One agent, unified context** — LettaBot's approach of routing all channels to one agent with shared memory eliminates "which channel did they tell me X on?" problems

### ❌ What Doesn't Work Well

1. **Tool-based channel integration (AG2 style)** — treating messaging as agent tools makes multi-channel orchestration ad hoc; no shared conversation context, no automatic session continuity

2. **Hardcoding platform checks in business logic** — `if (channel === 'whatsapp') { ... }` creates coupling; should be driven by capabilities matrix

3. **Monolithic adapter code** — mixing inbound normalization, outbound rendering, webhook management, and auth token refresh in one class is hard to test

4. **Rich format loss** — platforms differ wildly in supported message types; a naive "lowest common denominator" approach (text only) wastes platform capabilities; best-in-class systems use `channel_hints` for progressive enhancement

5. **No sandboxing for third-party channel plugins** — security risk when community channels can access the full gateway; OpenClaw's 9-layer permission system partially mitigates this

6. **Requiring code changes to add new channels** — frameworks that lack a plugin system force users to fork the repo

---

## Recommendations for a Self-Hosted Agent (reeboot)

### Core interface to define now

```typescript
// Define once — all channels implement this
interface ChannelAdapter {
  readonly id: string
  readonly meta: { name: string; icon: string; version: string }
  readonly capabilities: ChannelCapabilities

  // Lifecycle
  start(config: ChannelConfig): Promise<void>
  stop(): Promise<void>
  healthCheck(): Promise<ChannelProbe>

  // Inbound
  onMessage(handler: MessageHandler): void

  // Outbound
  sendMessage(ctx: SendContext): Promise<SendResult>
  sendTyping?(conversationId: string): Promise<void>
  editMessage?(messageId: string, text: string): Promise<void>
  deleteMessage?(messageId: string): Promise<void>
}

interface ChannelCapabilities {
  chatTypes: Array<'dm' | 'group' | 'channel' | 'thread'>
  edit: boolean
  delete: boolean
  reactions: boolean
  threading: boolean
  richMessages: boolean  // buttons, cards, etc.
  fileUpload: boolean
}
```

### File/directory structure

```
src/channels/
  types.ts              # ChannelAdapter interface, ChannelCapabilities, MsgContext
  registry.ts           # ChannelRegistry — register, lookup, lifecycle management
  pipeline.ts           # Inbound pipeline: debounce → allowlist → mention-gate → session
  discord/index.ts      # Built-in Discord adapter
  whatsapp/index.ts     # Built-in WhatsApp/Baileys adapter
  webchat/index.ts      # Built-in WebChat adapter

extensions/             # User-installable channel packages (npm/local)
  telegram/
  slack/
  email/
  sms-twilio/

contracts/
  inbound-testkit.ts    # Test helpers for validating adapter normalization
```

### Plugin distribution options (ranked)

1. **npm packages** (`@reeboot/channel-telegram`) — versioned, discoverable, standard tooling ⭐
2. **Local directory** (`~/.reeboot/channels/my-channel/`) — easy for users, no publish needed
3. **Workspace plugins** (`./channels/` in project) — for per-project custom channels
4. **Git URL** (`reeboot add github:user/reeboot-telegram`) — good for community channels pre-npm-publish

### Configuration pattern to follow

```yaml
# reeboot.yaml
channels:
  discord:
    enabled: true
    token: ${DISCORD_BOT_TOKEN}
  whatsapp:
    enabled: true
    # Baileys QR pairing — no token needed
  webchat:
    enabled: true
    port: 3001
  telegram:                  # user-installed extension
    enabled: true
    package: "@reeboot/channel-telegram"
    version: "^1.0.0"
    token: ${TELEGRAM_BOT_TOKEN}
```

### The 3 things worth stealing directly

1. **OpenClaw's contract test kit** — `createInboundContextCapture()` that lets channel authors validate normalization produces valid `MsgContext` without booting the full system
2. **LettaBot's one-agent-one-conversation principle** — all channels share session/memory; don't create separate agents per channel
3. **Botpress's `channel: "*"` wildcard + `channel: "discord.channel"` specific** — conversation handlers declare which channels they handle; clean separation of multi-channel vs single-channel skills

---

## Sources

- **OpenClaw Channels Overview**: https://openclawdoc.com/docs/channels/overview/
- **OpenClaw Multi-Channel Architecture (Zread deep dive)**: https://zread.ai/openclaw/openclaw/11-multi-channel-abstraction-architecture
- **LettaBot Multi-Channel Architecture (DeepWiki)**: https://deepwiki.com/letta-ai/lettabot/3.4-multi-channel-architecture
- **OpenClaw/ClawdBot Architecture Summary (LinkedIn)**: https://www.linkedin.com/pulse/quick-summary-clawdbot-openclaws-architecture-elaheh-ahmadi-clrgc
- **Botpress Integration for Messaging Channels**: https://botpress.com/docs/integrations/sdk/integration/messaging
- **Botpress Integration Getting Started**: https://botpress.com/docs/integrations/sdk/integration/getting-started
- **Botpress Runtime API Concepts**: https://botpress.com/docs/llms-full.txt
- **AG2 (AutoGen) Discord, Slack, Telegram messaging tools**: https://docs.ag2.ai/0.8.2/docs/use-cases/notebooks/notebooks/tools_commsplatforms/
- **LangChain Slack Integration (LangSmith Fleet)**: https://docs.langchain.com/langsmith/fleet/slack-app
- **OpenClaw from LangChain — three paradigm shifts (Medium)**: https://medium.com/@suwei007/from-langchain-to-openclaw-three-paradigm-shifts-in-ai-application-development-200defef3591
- **AI Agents Multi-Channel Strategy Enterprise (Indigo.ai)**: https://indigo.ai/en/blog/ai-agents-enterprise/
- **Multi-Channel Abstraction Architecture (SearXNG result)**: OpenClaw documentation, "Multi-Channel Architecture" section
- **SearXNG Search — AI agent multi-channel adapter pattern architecture**: localhost:7777, March 2026
- **SearXNG Search — botpress channel adapter plugin architecture**: localhost:7777, March 2026
- **SearXNG Search — langchain agent slack discord telegram channel integration**: localhost:7777, March 2026
- **SearXNG Search — open source AI assistant multi-channel plugin system self-hosted 2024**: localhost:7777, March 2026
