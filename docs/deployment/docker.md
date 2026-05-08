---
title: "Docker Deployment"
description: "Run reeboot as a Docker container with persistent data via volume mount."
---

# Docker Deployment

Reeboot is available as a Docker image. Mount `~/.reeboot` from your host to persist config, credentials, and conversation history across container restarts.

---

## Quick Start

```bash
docker run -d \
  -v ~/.reeboot:/home/reeboot/.reeboot \
  -p 3000:3000 \
  --name reeboot \
  reeboot/reeboot:latest
```

WebChat is available at `http://localhost:3000`.

---

## Health Check

```bash
curl http://localhost:3000/api/health
# {"status":"ok","uptime":42,"version":"1.3.4"}
```

---

## Docker Compose

```yaml
services:
  reeboot:
    image: reeboot/reeboot:latest
    ports:
      - "3000:3000"
    volumes:
      - ~/.reeboot:/home/reeboot/.reeboot
    restart: unless-stopped
    environment:
      - REEBOOT_HOST=0.0.0.0
```

Set `REEBOOT_HOST=0.0.0.0` to bind the server to all interfaces (needed for Docker port mapping). Default is `127.0.0.1` (localhost only).

---

## Signal with Docker Compose

To run both reeboot and the Signal CLI container together:

```yaml
services:
  reeboot:
    image: reeboot/reeboot:latest
    ports:
      - "3000:3000"
    volumes:
      - ~/.reeboot:/home/reeboot/.reeboot
    restart: unless-stopped
    depends_on:
      - signal

  signal:
    image: bbernhard/signal-cli-rest-api:latest
    ports:
      - "8080:8080"
    volumes:
      - ~/.reeboot/channels/signal:/home/user/.local/share/signal-cli
    environment:
      - MODE=json-rpc
    restart: unless-stopped
```

Configure reeboot to connect to Signal at `apiPort: 8080` in `~/.reeboot/config.json`.

---

## First-Run Setup in Docker

If `~/.reeboot/config.json` does not exist in the mounted volume, the container exits with an error — the wizard cannot run non-interactively in this mode.

**Option 1 — Run setup on the host first:**

```bash
npm install -g reeboot
reeboot setup --no-interactive --provider anthropic --api-key sk-ant-... --model claude-sonnet-4-5
# Then start the container
docker run ...
```

**Option 2 — Use environment variables:**

```bash
docker run -d \
  -v ~/.reeboot:/home/reeboot/.reeboot \
  -p 3000:3000 \
  -e REEBOOT_AUTH_MODE=own \
  -e REEBOOT_PROVIDER=anthropic \
  -e REEBOOT_API_KEY=sk-ant-... \
  -e REEBOOT_MODEL=claude-sonnet-4-5 \
  reeboot/reeboot:latest
```

Environment variables are applied at startup when no config file exists.

---

## Environment Variables

| Variable | Description |
|---|---|
| `REEBOOT_API_KEY` | LLM provider API key |
| `REEBOOT_PROVIDER` | Provider name |
| `REEBOOT_MODEL` | Model ID |
| `REEBOOT_PORT` | HTTP port (default: 3000) |
| `REEBOOT_HOST` | Bind host (default: `127.0.0.1`; use `0.0.0.0` in Docker) |
| `REEBOOT_AUTH_MODE` | `"own"` or `"pi"` |
| `REEBOOT_CONFIG_PATH` | Override config file path |
