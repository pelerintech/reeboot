---
title: "Installation"
description: "How to install reeboot via npm or Docker, and what happens on first run."
---

# Installation

## Requirements

- **Node.js ≥ 22** — [nodejs.org](https://nodejs.org)
- **npm ≥ 10** (bundled with Node.js 22)
- A terminal (macOS, Linux, or WSL on Windows)

## Install via npm

```bash
npm install -g reeboot
```

This installs the `reeboot` command globally. Verify it worked:

```bash
reeboot --version
```

## First Run

```bash
reeboot
```

On first run, reeboot detects that no config exists and launches the **setup wizard** automatically. The wizard walks you through your LLM provider, agent name, channels, and web search backend. At the end it offers to start the agent immediately.

On every subsequent run, `reeboot` starts the agent directly — no flags needed.

→ See [Setup Wizard](./setup-wizard.md) for a step-by-step walkthrough.

## Install via Docker

If you prefer to run reeboot as a container:

```bash
docker run -d \
  -v ~/.reeboot:/home/reeboot/.reeboot \
  -p 3000:3000 \
  --name reeboot \
  reeboot/reeboot:latest
```

Mount `~/.reeboot` from your host so that config, credentials, and conversation history persist across container restarts.

The WebChat UI is available at `http://localhost:3000`.

→ See [Docker Deployment](../deployment/docker.md) for the full Docker and Docker Compose reference.

## What Gets Created

On first run, reeboot creates:

```
~/.reeboot/
  config.json          ← your configuration
  db/
    reeboot.db         ← SQLite database (sessions, tasks, memory index)
  agent/
    AGENTS.md          ← agent persona / system prompt
    MEMORY.md          ← persistent memory (facts about you)
    USER.md            ← persistent memory (your preferences)
  logs/                ← structured log files
  channels/
    whatsapp/auth/     ← WhatsApp credentials (if linked)
    signal/            ← Signal data (if linked)
```

## Uninstall

```bash
npm uninstall -g reeboot
rm -rf ~/.reeboot   # removes all data, config, and credentials
```
