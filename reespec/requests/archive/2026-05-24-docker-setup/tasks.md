# Tasks — docker-setup

### 1. Create config.example.json template

- [x] **RED** — Write `tests/docker-config-template.test.ts`: import `ConfigSchema` from `reeboot/src/config.js`, read `config.example.json` from repo root with `JSON.parse`, assert parsing succeeds (valid JSON). Pass the parsed object to `ConfigSchema.parse()` — assert it does not throw. Assert `channels.signal.apiPort` is `8080` and `search.searxngBaseUrl` is `"http://searxng:8080"`. Run → test fails (file doesn't exist).
- [x] **ACTION** — Create `config.example.json` at repo root with all ConfigSchema sections, populated with defaults. Use Docker DNS names (`searxng:8080`, signal-cli internal port `8080`). Add `"$comment"` keys for inline documentation that `JSON.parse` ignores and Zod strips.
- [x] **GREEN** — Run `npx vitest run tests/docker-config-template.test.ts` → test passes. Verify: `JSON.parse` of the file succeeds, `ConfigSchema.parse()` accepts it, Docker-specific defaults are set.

### 2. Create docker-compose.yml

- [x] **RED** — Write `tests/docker-compose-yml.test.ts`: assert `docker-compose.yml` exists at repo root. Parse it as YAML (or basic string checks). Assert it defines services: `reeboot`, `searxng`, `signal-cli`. Assert caddy block exists but is commented (lines starting with `#`). Assert `reeboot` service uses `build:` (not `image:`). Assert `reeboot` has `volumes:` with `./data:/home/reeboot/.reeboot`. Run → test fails (file doesn't exist).
- [x] **ACTION** — Create `docker-compose.yml` at repo root defining: reeboot (build from `container/Dockerfile`, port 3000, volume `./data:/home/reeboot/.reeboot`, `REEBOOT_HOST=0.0.0.0`, `restart: unless-stopped`), searxng (image `searxng/searxng:latest`, port 8080, volume `./data/searxng:/etc/searxng`), signal-cli (image `bbernhard/signal-cli-rest-api:latest`, port 8081:8080, volume `./data/signal-cli:/home/.local/share/signal-cli`), caddy (commented out, image `caddy:latest`, ports 80/443, volume `./Caddyfile:/etc/caddy/Caddyfile`).
- [x] **GREEN** — Run `npx vitest run tests/docker-compose-yml.test.ts` → test passes. Verify: file exists, all four service blocks present, caddy is commented, reeboot uses `build:`, bind mount is `./data`.

### 3. Update Dockerfile PATH

- [x] **RED** — Read `reeboot/container/Dockerfile`. Assert the string `ENV PATH="/home/reeboot/node_modules/.bin:$PATH"` is NOT present (grep returns no result). Assertion fails — line is absent.
- [x] **ACTION** — Add `ENV PATH="/home/reeboot/node_modules/.bin:$PATH"` after the `WORKDIR` line in `reeboot/container/Dockerfile`.
- [x] **GREEN** — Read `reeboot/container/Dockerfile`. Assert `ENV PATH="/home/reeboot/node_modules/.bin:$PATH"` IS present. Assert it appears after `WORKDIR /home/reeboot`.

### 4. Add data/ to .gitignore and create .dockerignore

- [x] **RED** — Assert `data/` is NOT in `.gitignore` (grep returns no match). Assert `.dockerignore` does NOT exist at repo root (file not found). Both assertions fail.
- [x] **ACTION** — Add `data/` to the "Runtime data" section of root `.gitignore`. Create `.dockerignore` at repo root excluding: `node_modules/`, `.git/`, `data/`, `dist/`, `*.tgz`.
- [x] **GREEN** — Assert `data/` IS in `.gitignore`. Assert `.dockerignore` EXISTS and contains all five exclusion patterns.

### 5. Remove Docker deployment path from wizard

- [x] **RED** — Read `reeboot/src/wizard/index.ts`. Assert `deploymentChoice` variable does NOT exist (grep returns no match). Assertion fails — variable is present.
- [x] **ACTION** — Remove Step 1 (deployment method) from `reeboot/src/wizard/index.ts`. Delete the `deploymentChoice` variable, the `prompter.select({ message: 'How do you want to run Reeboot?' })` block, the `if (deploymentChoice === 'docker')` fallback, and the `'coming soon'` message. The wizard now starts with Step 2 (provider setup).
- [x] **GREEN** — Read `reeboot/src/wizard/index.ts`. Assert `deploymentChoice` does NOT exist. Assert no string containing `'How do you want to run Reeboot?'` exists. Run existing wizard tests: `npx vitest run tests/wizard/` → all tests pass (update any that reference deployment step).

### 6. Update reeboot/README.md deployment steps

- [x] **RED** — Read `reeboot/README.md`. Assert line containing `"1. **Deployment** — native (default) or Docker (coming soon)"` exists. Assertion fails — will be replaced.
- [x] **ACTION** — Change the deployment step line in `reeboot/README.md` from `"1. **Deployment** — native (default) or Docker (coming soon)"` to `"1. **Provider** — local-first: Ollama, llama.cpp, LM Studio, Custom endpoint, or cloud..."`. Re-number the subsequent steps (2→1, 3→2, 3b→3). Add a new section `## Docker` at the end of the README with the `git clone → cp config → docker compose up -d` flow and a link to the root README Docker section.
- [x] **GREEN** — Read `reeboot/README.md`. Assert line containing "1. **Provider**" exists. Assert no line containing "Docker (coming soon)" exists. Assert a `## Docker` section exists.

### 7. Fix README Docker references

- [x] **RED** — Read root `README.md`. Assert `reeboot/reeboot:latest` exists (grep match). Read `reeboot/README.md`. Assert `hub.docker.com/r/reeboot/reeboot` exists. Both assertions fail — links are present, they need removal.
- [x] **ACTION** — Replace the Docker section in root `README.md` (the `docker run -d -v ~/.reeboot... reeboot/reeboot:latest` block) with the docker-compose deployment flow: `git clone → cp config.example.json ./data/config.json → edit → docker compose up -d`. Remove the 🐳 Docker Hub link from `reeboot/README.md` Links section. Preserve npm, full docs, and changelog links.
- [x] **GREEN** — Read both READMEs. Assert root README does NOT contain `reeboot/reeboot:latest` nor `hub.docker.com/r/reeboot`. Assert root README contains `docker compose up -d`. Assert reeboot README Links section does NOT contain `hub.docker.com`.