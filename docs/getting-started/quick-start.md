---
title: "Quick Start"
description: "Go from zero to a running reeboot agent in five steps."
---

# Quick Start

Five steps. No prior knowledge required.

## Step 1 — Install

```bash
npm install -g reeboot
```

Requires Node.js ≥ 22. Check with `node --version`.

## Step 2 — Run the wizard

```bash
reeboot
```

The setup wizard launches automatically on first run. Choose your LLM provider, enter your API key, and give your agent a name. The wizard writes `~/.reeboot/config.json` when you confirm.

## Step 3 — Open WebChat

The agent starts at the end of the wizard (or run `reeboot start` manually). Open:

```
http://localhost:3000
```

You'll see the WebChat interface. Say hello.

## Step 4 — Send your first message

Type anything. Your agent responds using the LLM provider you configured. Try:

```
What can you do?
```

## Step 5 — (Optional) Connect WhatsApp or Signal

To talk to your agent from your phone:

```bash
reeboot channel login whatsapp
```

Scan the QR code with WhatsApp → Settings → Linked Devices → Link a Device. Your agent is now available in your WhatsApp DMs.

---

## What Next?

- [Setup Wizard](./setup-wizard.md) — understand every wizard prompt in detail
- [Channels](../channels/webchat.md) — configure WhatsApp, Signal, and WebChat
- [Configuration Reference](../configuration/reference.md) — every config field explained
- [Personal Memory](../capabilities/memory.md) — teach your agent to remember things
