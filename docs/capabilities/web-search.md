---
title: "Web Search"
description: "Built-in web search with 7 provider options and always-available URL fetching."
---

# Web Search

Reeboot includes a built-in web search extension that registers two agent tools:

- **`fetch_url`** — Always available. Fetches any URL and returns clean readable text (Mozilla Readability extraction with HTML-strip fallback).
- **`web_search`** — Available when `search.provider` is not `"none"`. Returns an array of `{ title, url, snippet }` results.

---

## Providers

| Provider | Free Tier | API Key Env Var | Notes |
|---|---|---|---|
| `duckduckgo` | ✅ Unlimited | None needed | HTML scraping — no account required |
| `brave` | ✅ 2,000/month | `BRAVE_API_KEY` | |
| `tavily` | ✅ 1,000/month | `TAVILY_API_KEY` | Optimised for LLM use |
| `serper` | ✅ 2,500 free | `SERPER_API_KEY` | Google results |
| `exa` | ✅ 1,000/month | `EXA_API_KEY` | Neural search |
| `searxng` | ✅ Self-hosted | None needed | Privacy-preserving, requires Docker |
| `none` | — | — | Disables `web_search`; `fetch_url` still works |

---

## Configuration

```json
{
  "search": {
    "provider": "duckduckgo"
  }
}
```

For API-key providers:

```json
{
  "search": {
    "provider": "brave",
    "apiKey": "your-brave-api-key"
  }
}
```

Or set the environment variable instead of storing the key in config:

```bash
export BRAVE_API_KEY=your-key
export TAVILY_API_KEY=your-key
export SERPER_API_KEY=your-key
export EXA_API_KEY=your-key
```

---

## SearXNG (Self-Hosted)

```json
{
  "search": {
    "provider": "searxng",
    "searxngBaseUrl": "http://localhost:8888"
  }
}
```

Start SearXNG with Docker:

```bash
docker run -d -p 8888:8080 searxng/searxng
```

If SearXNG is unreachable at startup, reeboot logs a warning. The `web_search` tool will fail at call time until the server is reachable.

---

## Disabling Web Search

```json
{
  "search": { "provider": "none" }
}
```

`fetch_url` remains fully available even when `provider` is `"none"`.

---

## Configuration Reference

| Field | Type | Default | Description |
|---|---|---|---|
| `search.provider` | string | `"none"` | Search backend. One of: `"duckduckgo"`, `"brave"`, `"tavily"`, `"serper"`, `"exa"`, `"searxng"`, `"none"`. |
| `search.apiKey` | string | `""` | API key for the chosen provider (stored in config). Prefer env vars for security. |
| `search.searxngBaseUrl` | string | `"http://localhost:8888"` | SearXNG instance URL. Only used when `provider: "searxng"`. |
