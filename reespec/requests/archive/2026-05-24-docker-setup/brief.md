# Brief — docker-setup

## Problem

Reeboot has a Dockerfile and entrypoint but no way to run the full stack in
Docker on a bare VPS. Users must manually write docker-compose files and know
which services are needed. There is also a doc bug: the README links to a Docker
Hub image (`https://hub.docker.com/r/reeboot/reeboot`) that doesn't exist.

## Vision

A separate, CLI-independent deployment path for bare machines with nothing but
Docker installed. Clone the repo, copy a config template, tweak it, and
`docker compose up -d` — the full stack is running.

```
git clone <repo>
cd reeboot
cp config.example.json ./data/config.json
# edit config.json with provider/model/key
docker compose up -d
```

No `reeboot` CLI required on the host. No npm. No wizard. Config is a flat JSON
file the user edits by hand. The `reeboot` binary is available inside the
container via `npx` (PATH includes `node_modules/.bin`), so advanced users can
`docker compose exec reeboot npx reeboot init` if they prefer the interactive
wizard.

## What the Docker Stack Includes

```
                         [caddy]       ← commented out by default (opt-in for HTTPS)
                            │
                         reeboot       ← build: ./container  →  0.0.0.0:3000
                            │
               ┌────────────┴────────────┐
            searxng                  signal-cli
            (8080)                   (8081)
```

All four services are defined in the compose file. Caddy is commented out by
default — uncomment when you have a domain and want automatic TLS. The other
three (reeboot, searxng, signal-cli) are always included. Users can comment
out searxng or signal-cli if they don't need those features.

Volume: bind mount `./data:/home/reeboot/.reeboot` — config, DB, memories,
knowledge corpus, and sessions persist across container restarts and image
rebuilds. The user drops `config.json` into `./data/` before starting.

## Key Decisions (from discovery)

- **No published image** — reeboot is built inside Docker via the `build:`
  directive. The Dockerfile already has `npm ci` + `npm run build`.
- **No `reeboot docker setup` command** — the entire Docker deployment path
  is CLI-independent. Lifecycle is just `docker compose up|down|logs`.
- **Config via `config.example.json` template** — shipped in the repo root.
  User copies to `./data/config.json`, edits, and starts. No wizard on VPS.
- **Bind mount, not named volume** — `./data` lives next to the compose file.
  Transparent, easy to inspect, compatible with orchestrators like Coolify.
- **`ENV PATH` includes `node_modules/.bin`** — so `npx reeboot <cmd>` works
  inside the container for users who want the interactive wizard or CLI tools.
- **Remove Docker path from `reeboot init` wizard** — the wizard Step 1
  ("Native or Docker?") and its "coming soon" fallback are removed. Docker is
  documented as a separate deployment path, not a wizard branch.

## Goals

- User clones the repo, copies a config template, edits it, and runs
  `docker compose up -d` — full stack is running.
- `config.example.json` documents every supported config key with defaults
  and comments.
- All services (reeboot, searxng, signal-cli) are on by default. Caddy is
  commented out by default for opt-in HTTPS.
- `./data/` persists all state across restarts and image rebuilds.
- `docker compose exec reeboot npx reeboot <cmd>` works for interactive tools.
- README Docker Hub link is fixed (removed or corrected).
- `reeboot init` wizard no longer offers a Docker deployment choice.

## Non-Goals

- Not creating a `reeboot docker setup` CLI command.
- Not integrating Docker into the interactive setup wizard.
- Not publishing a Docker Hub image.
- Not adding a bash-configuration wizard (maintenance fork of TypeScript wizard rejected).
- Not adding a `.env` file for configuration (all config lives in `config.json` under `./data/`).

## Impact

- Reeboot can be deployed on any VPS with Docker and a cloned repo — no
  Node.js, npm, or `reeboot` CLI needed on the host.
- The `config.example.json` template doubles as living documentation of all
  configuration options.
- Orchestrators like Coolify that clone a git repo and run `docker compose`
  work out of the box (bind mount + build directive).
