# Design — docker-setup

## Approach

Instead of integrating Docker into the `reeboot` CLI, we create a standalone
deployment path. The repo root becomes the docker-compose context. A user
clones, copies a config template, and runs `docker compose up -d`.

No CLI changes other than removing the Docker wizard branch. No new npm
dependencies. The only new files are `docker-compose.yml` and
`config.example.json`. Changes to existing files are minimal: Dockerfile PATH,
wizard Step 1 removal, and README corrections.

## Architecture

```
repo root/
├── docker-compose.yml       ← NEW: full stack definition
├── config.example.json       ← NEW: documented template
├── container/                ← existing: Dockerfile + entrypoint.sh
├── data/                     ← .gitignore'd: user's persistent state
│   └── config.json           ← user copies from config.example.json
├── .gitignore                ← MODIFIED: add data/
├── README.md                 ← MODIFIED: replace Docker section
├── reeboot/
│   ├── README.md             ← MODIFIED: remove Docker Hub link, update deployment docs
│   ├── src/
│   │   ├── wizard/index.ts   ← MODIFIED: remove Step 1 deployment choice
│   │   └── ...
│   └── container/
│       └── Dockerfile        ← MODIFIED: add PATH
└── ...
```

## docker-compose.yml Design

```yaml
services:
  reeboot:
    build:
      context: .
      dockerfile: container/Dockerfile
    ports:
      - "3000:3000"
    volumes:
      - ./data:/home/reeboot/.reeboot
    environment:
      - REEBOOT_HOST=0.0.0.0
    restart: unless-stopped

  searxng:
    image: searxng/searxng:latest
    ports:
      - "8080:8080"
    volumes:
      - ./data/searxng:/etc/searxng
    restart: unless-stopped

  signal-cli:
    image: bbernhard/signal-cli-rest-api:latest
    ports:
      - "8081:8080"
    volumes:
      - ./data/signal-cli:/home/.local/share/signal-cli
    restart: unless-stopped

  # caddy:
  #   image: caddy:latest
  #   ports:
  #     - "80:80"
  #     - "443:443"
  #   volumes:
  #     - ./Caddyfile:/etc/caddy/Caddyfile
  #     - caddy_data:/data
  #   restart: unless-stopped
```

### Service port mapping rationale

| Service | Internal port | Host port | Reason |
|---|---|---|---|
| reeboot | 3000 | 3000 | WebChat + API |
| searxng | 8080 | 8080 | Standard SearXNG port |
| signal-cli | 8080 (internal) | 8081 | Conflicts with searxng on 8080; 8081 is the traditional REST API port |

### Key design decisions

**Build context at repo root** — The `build:` directive uses `context: .` with
`dockerfile: container/Dockerfile`. This gives the Docker build access to the
full source tree (src/, extensions/, skills/, templates/, webchat/) without
duplicating files. The user runs `docker compose` from repo root.

**Bind mount at `./data`** — Not a named volume. The user creates
`config.json` by copying the template into `./data/`, then edits it.
`./data/` appears next to `docker-compose.yml` — no hidden Docker volume
paths. Subdirectories (`searxng/`, `signal-cli/`) hold service-specific
persistent data. Compatible with Coolify and similar orchestrators.

**`config.json` default paths must align** — The `config.example.json` uses
`searxngBaseUrl: "http://searxng:8080"` (Docker DNS name) and
`signal.apiPort: 8080` (Docker DNS name `signal-cli`). These differ from
native defaults (`localhost:8888` and `localhost:8080`). The template
documents this clearly.

**No `.env` file** — All config lives in `config.json`. The only environment
variable set in docker-compose is `REEBOOT_HOST=0.0.0.0` (bind to all
interfaces inside the container). Entrypoint env vars (`REEBOOT_PROVIDER`,
etc.) are not used in this path because config.json already exists.

**Caddy is commented out** — The compose file ships with Caddy fully defined
but commented. A user with a domain uncomments the block, creates a simple
`Caddyfile`, and gets automatic TLS. The `Caddyfile` is documented in the
comment block.

## config.example.json Design

A single JSON file with every key from `ConfigSchema`, populated with
defaults. Every key has an adjacent `// comment` explaining its purpose.
The file is syntactically valid JSON with `//` comments — the user copies
it and removes comments before starting (or we ship valid JSON with a
separate comments doc).

**Decision**: Ship valid JSON with inline comments using `"$comment"` keys as
a non-standard but widespread convention. `JSON.parse` ignores keys it doesn't
know. The reeboot config loader (Zod) ignores extra keys. This means the
user can literally `cp config.example.json ./data/config.json` and the agent
starts (with defaults — no provider configured, so it will error with a
clear message).

Alternative considered: JSONC or JSON5. Rejected — `config.ts` uses `JSON.parse`
which doesn't support comments. Teaching the loader to strip comments adds
complexity for a one-time setup concern.

The template surfaces all top-level sections: `agent`, `channels`, `search`,
`memory`, `knowledge`, `budget`, `resilience`, `logging`, `heartbeat`,
`skills`, `mcp`, `permissions`, `security`, `contexts`, `sandbox`, `server`,
`extensions`, `routing`, `session`, `credentialProxy`.

## Dockerfile Change

Add one line after `WORKDIR`:

```dockerfile
ENV PATH="/home/reeboot/node_modules/.bin:$PATH"
```

This makes `reeboot` (and `npx reeboot`) callable directly inside the container
without prefixing `node node_modules/.bin/reeboot`. The `$PATH` includes
`node_modules/.bin` so the npm bin symlinks are available.

## Wizard Change

Remove Step 1 (deployment method) from `src/wizard/index.ts`. The wizard
currently shows:

```
How do you want to run Reeboot?
  ▶ Native (daemon)
    Docker (full stack) — coming soon
```

This entire step is deleted. The wizard starts directly with provider setup.
The `deploymentChoice` variable and the `if (deploymentChoice === 'docker')`
fallback are removed.

Also update `reeboot/README.md` line 25 which says:
"1. **Deployment** — native (default) or Docker (coming soon)"
→ "1. **Provider** — ..."

## README Changes

### `/README.md` (root)

Replace the current "Docker" section (the `docker run` block referencing
`reeboot/reeboot:latest`) with a section describing the docker-compose path:

```markdown
## Docker (full stack)

git clone <repo>
cd reeboot
cp config.example.json ./data/config.json
# edit config.json
docker compose up -d

Visit http://<host>:3000. Full stack includes reeboot, SearXNG, and Signal CLI.
```

### `/reeboot/README.md`

- Remove or correct the Docker Hub link on line 183
- Update line 25: "1. **Deployment** — native (default) or Docker (coming soon)"
  → "1. **Provider** — ..."
- Add a brief Docker deployment section (similar to root README) or link to it

## .gitignore

Add `data/` to the root `.gitignore` under the "Runtime data" section so users
don't accidentally commit their config, DB, or credentials.

## Risks

| Risk | Mitigation |
|---|---|
| `config.example.json` drifts from ConfigSchema | The template is validated by a test that parses it with ConfigSchema (ignoring `$comment` keys) |
| Docker build context is repo root — slow on `docker compose build` | `.dockerignore` excludes `node_modules/`, `.git/`, `data/`, and build artifacts |
| SearXNG and signal-cli images may change their volume paths | Pinned to `:latest` tags. If upstream changes paths, the compose file needs manual update — no worse than current state |
| User tries `docker compose` from wrong directory | Documented clearly: run from repo root |
