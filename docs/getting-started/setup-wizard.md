---
title: "Setup Wizard"
description: "A step-by-step walkthrough of the reeboot first-run setup wizard."
---

# Setup Wizard

The setup wizard runs automatically on first launch (`reeboot`) and can be re-run at any time with:

```bash
reeboot setup
```

Config is written **only at the final confirmation step** — exiting early leaves your existing config untouched.

---

## Step 1 — Auth Mode & Provider

Reeboot first checks whether you have [pi](https://github.com/mariozechner/pi) installed and authenticated.

**If pi is detected**, you are offered two choices:
- **Use pi's credentials** (`authMode: "pi"`) — reeboot delegates provider, model, and API key to your existing pi installation. Nothing extra to configure.
- **Enter separate credentials** (`authMode: "own"`) — reeboot uses its own API key, independent of pi.

**If pi is not detected**, you proceed directly to entering your own credentials.

### Supported Providers

| Provider | Notes |
|---|---|
| **Anthropic** | Claude models — recommended for most use cases |
| **OpenAI** | GPT-4o and o3 series |
| **Google** | Gemini 2.0 and 2.5 series |
| **Groq** | Fast inference, Llama models |
| **Mistral** | Mistral Large and Small |
| **xAI** | Grok models |
| **OpenRouter** | Access to many providers via one API key |
| **Ollama** | Fully local models — no API key required |

After selecting a provider, the wizard presents a curated model list. You can also type any model ID directly.

For **Ollama**, you are asked for the base URL (default: `http://localhost:11434`) instead of an API key.

---

## Step 2 — Agent Name

Give your agent a name. This appears in the WebChat UI and in system prompts.

Default: `Reeboot`

---

## Step 3 — Channels

Select which channels to link during setup (all are optional — you can add them later):

- **WhatsApp** — shows a QR code in the terminal to scan with the WhatsApp app
- **Signal** — requires the Signal CLI Docker container to be running

Both channels can be linked later with:

```bash
reeboot channel login whatsapp
reeboot channel login signal
```

---

## Step 4 — Web Search

Choose a search backend for the `web_search` tool:

| Choice | API Key Required |
|---|---|
| DuckDuckGo | No |
| Brave | Yes (`BRAVE_API_KEY`) |
| Tavily | Yes (`TAVILY_API_KEY`) |
| Serper | Yes (`SERPER_API_KEY`) |
| Exa | Yes (`EXA_API_KEY`) |
| SearXNG | No (self-hosted) |
| None | — |

The `fetch_url` tool is always available regardless of this choice.

---

## Step 5 — Confirm & Launch

The wizard shows a summary of your choices and asks whether to start the agent immediately. If you confirm, it:

1. Writes `~/.reeboot/config.json`
2. Scaffolds `~/.reeboot/agent/` with persona and memory templates
3. Optionally starts the agent server

---

## Non-Interactive Mode

For headless or CI setups, skip the wizard with flags:

```bash
reeboot setup --no-interactive \
  --provider anthropic \
  --api-key sk-ant-... \
  --model claude-sonnet-4-5 \
  --name "My Agent" \
  --channels web,whatsapp
```

Or set environment variables that the wizard reads:

| Variable | Purpose |
|---|---|
| `REEBOOT_API_KEY` | LLM provider API key |
| `REEBOOT_PROVIDER` | Provider name |
| `REEBOOT_MODEL` | Model ID |
| `REEBOOT_PORT` | HTTP port (default: 3000) |
| `REEBOOT_AUTH_MODE` | `"pi"` or `"own"` |
