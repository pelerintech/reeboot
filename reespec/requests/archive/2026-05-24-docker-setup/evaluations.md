## Evaluation — 2026-05-24 12:00

### config-template
verdict:  ✅ SATISFIED
reason:   `config.example.json` exists at repo root, is valid JSON (confirmed via `JSON.parse`), all 14 required top-level sections (`agent`, `channels`, `search`, `memory`, `knowledge`, `budget`, `resilience`, `logging`, `heartbeat`, `skills`, `mcp`, `permissions`, `security`, `contexts`) are present, `search.searxngBaseUrl` is `"http://searxng:8080"`, and `channels.signal.apiPort` is `8080`

### docker-compose
verdict:  ⚠️ PARTIAL
reason:   `docker-compose.yml` exists at repo root with all 4 services (reeboot, searxng, signal-cli, caddy commented out), correct bind mount `./data:/home/reeboot/.reeboot`, and correct port mappings — but the `build.dockerfile` directive says `container/Dockerfile` which resolves to `./container/Dockerfile` relative to the repo root; no such file exists — the actual Dockerfile is at `reeboot/container/Dockerfile`, so `docker compose build` would fail
focus:    `docker-compose.yml` line 28 — `dockerfile: container/Dockerfile` should be `dockerfile: reeboot/container/Dockerfile`

### dockerfile-path
verdict:  ✅ SATISFIED
reason:   `reeboot/container/Dockerfile` contains `ENV PATH="/home/reeboot/node_modules/.bin:$PATH"` directly after the WORKDIR directive on line 16, making both `npx reeboot` and direct `reeboot` CLI calls available inside the container

### gitignore-dockerignore
verdict:  ✅ SATISFIED
reason:   `.gitignore` lists `data/` under its "Runtime data" section; `.dockerignore` exists at repo root and excludes all five required patterns: `node_modules/`, `.git/`, `data/`, `dist/`, and `*.tgz`

### readme-fixes
verdict:  ✅ SATISFIED
reason:   Root `README.md` contains no `reeboot/reeboot:latest` or `hub.docker.com/r/reeboot/reeboot` references and describes the `git clone → cp config → docker compose up -d` flow; `reeboot/README.md` Links section has no Docker Hub link (npm, docs, changelog preserved) and its wizard steps start from "1. Provider" with no Docker deployment option

### wizard-docker-removal
verdict:  ✅ SATISFIED
reason:   `reeboot/src/wizard/index.ts` has no `deploymentChoice` variable, no `select({ message: 'How do you want to run Reeboot?' })` call, no `'coming soon'` fallback, and the first step invoked is `runProviderStep`; `reeboot/README.md` wizard steps numbering starts from "1. Provider" with no deployment mention

## Triage

✅ Safe to skip:   config-template, dockerfile-path, gitignore-dockerignore, readme-fixes, wizard-docker-removal
⚠️  Worth a look:  docker-compose — `dockerfile: container/Dockerfile` resolves to a non-existent path; actual Dockerfile is at `reeboot/container/Dockerfile`, so `docker compose build` and `docker compose up` will fail

---