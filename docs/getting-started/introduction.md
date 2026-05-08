---
title: "Introduction"
description: "What reeboot is, who it's for, and what makes it different from other AI assistants."
---

# Introduction

Reeboot is a personal AI agent that runs on your own machine and talks to you through the channels you already use — WhatsApp, Signal, or a browser-based chat. It has persistent memory, can search your documents, schedule tasks, and act proactively without being prompted.

## Who It's For

Reeboot is for people who want an AI assistant that is:

- **Private** — your conversations, your documents, and your memory stay on your machine
- **Always available** — connected to WhatsApp or Signal, not locked inside a browser tab
- **Yours to extend** — add tools, connect services, write skills in plain Markdown

It works equally well as a simple chat assistant and as a capable autonomous agent that can run scheduled jobs, monitor things, and take action on your behalf.

## What Makes It Different

| | Reeboot | Typical AI chat |
|---|---|---|
| Runs locally | ✅ Single Node.js process | ❌ Cloud-only |
| Talks on WhatsApp / Signal | ✅ Native integration | ❌ Web app only |
| Remembers you across sessions | ✅ Persistent memory files | ❌ Stateless |
| Searches your documents | ✅ Local vector embeddings | ❌ No document access |
| Schedules its own tasks | ✅ Cron-based scheduler | ❌ No proactive actions |
| Fully configurable | ✅ JSON config, TypeScript extensions | ❌ No customisation |
| Your choice of LLM | ✅ 8 providers including Ollama | ❌ Single provider |

## How It Works

Reeboot is a single process. All your channels (WhatsApp, Signal, WebChat) connect to one orchestrator, which routes each message to the AI agent and returns the response to the right place.

```
  WhatsApp ──┐
  Signal   ──┼──► Orchestrator ──► AgentRunner (pi) ──► LLM
  WebChat  ──┘         │
                       └──► Scheduler (background tasks)
```

State is stored in a single SQLite database at `~/.reeboot/db/reeboot.db`. Memory lives in two Markdown files at `~/.reeboot/agent/`. Everything else is in `~/.reeboot/config.json`.

## Next Steps

- [Installation](./installation.md) — install reeboot and run it for the first time
- [Quick Start](./quick-start.md) — be talking to your agent in five steps
- [Setup Wizard](./setup-wizard.md) — a detailed walkthrough of the first-run wizard
