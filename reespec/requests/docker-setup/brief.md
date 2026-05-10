# Brief — docker-setup

## Problem

Reeboot has a Dockerfile and entrypoint but no way for a regular user to run the
full stack in Docker without manually writing docker-compose files and knowing which
services are needed. There is also a doc bug: the README links to a Docker Hub image
(`https://hub.docker.com/r/reeboot/reeboot`) that doesn't exist.

## Vision

One command sets up and starts the entire reeboot stack in Docker:

```
reeboot docker setup
```

Or offered as a deployment choice at the end of `reeboot init`:

```
How do you want to run reeboot?
  ▶ Native (systemd / launchd daemon)
    Docker (full stack via docker-compose)
```

## What the Docker Stack Includes

```
┌─────────────────────────────────────────┐
│         docker-compose.yml              │
│                                         │
│  reeboot      ← the agent              │
│  searxng      ← web search             │
│  signal-cli   ← Signal channel         │
│  (webchat is bundled inside reeboot)    │
└─────────────────────────────────────────┘
```

All services wired together with shared volumes for config, credentials,
and conversation history persisting across restarts.

## Key Details

- **No published image** — reeboot image must be built locally from
  `$(npm root -g)/reeboot/container/` as the build context
- **Detect Docker** — check if Docker and Docker Compose are installed,
  give clear install instructions if not
- **Generate docker-compose.yml** — written to `~/.reeboot/docker-compose.yml`
- **Start stack** — `docker compose build && docker compose up -d`
- **Fix README** — remove or correct the Docker Hub link

## Open Questions

- Should searxng and signal-cli be opt-in (only if those channels/features are enabled in Step 7)?
- How does `reeboot stop` / `reeboot start` interact with docker-compose after setup?

## Integration Point

`reeboot init` Step 1 already asks "Native or Docker?". The Docker path in
`setup-wizard-improvements` shows "coming soon" until this request ships.
When this ships, it replaces that placeholder with the full Docker wizard path.

## Dependencies

- `setup-wizard-improvements` should ship first — `reeboot init` deployment
  choice (native vs Docker) is the natural integration point for this request.
