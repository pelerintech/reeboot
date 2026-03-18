## Context

All Phase 1 features are implemented and tested. This change is about packaging, documentation, and publishing. The goal is a polished, publishable npm package that delivers on the `npx reeboot` promise.

## Goals / Non-Goals

**Goals:**
- `package.json` fields correct for npm publication (bin, exports, files, engines, peerDeps)
- README that a new user can follow to get from zero to chatting with their agent
- Dockerfile that wraps the npm package and exposes port 3000
- GitHub Actions workflow: test + build on push, publish to npm on `v*` tags
- End-to-end validation: `npx reeboot` on clean install works correctly
- Docker image published

**Non-Goals:**
- Phase 2 web UI
- Marketing website
- Additional npm packages (reeboot-skills-*, reeboot-*-tools)

## Decisions

### package.json files field: explicit whitelist
Use `"files": ["dist/", "extensions/", "skills/", "templates/", "container/"]` to include only built output and bundled assets. Exclude `src/`, test files, `.pi/`, `openspec/`.

### exports: explicit named exports
```json
{
  "exports": {
    ".": "./dist/index.js",
    "./channels": "./dist/channels/interface.js"
  }
}
```
The `./channels` export lets external channel adapter authors import types without importing the full package.

### README structure
1. **One-liner tagline**: "Your personal AI agent. One command to install. Runs locally. Talk to it from anywhere."
2. **Quick start** (3 commands: `npx reeboot`, scan QR, done)
3. **What it can do** (capabilities table from plan)
4. **Architecture overview** (single-process, channels diagram)
5. **Configuration** (config.json reference, env vars)
6. **Extension system** (the ladder: skills → pi extensions → channel adapters)
7. **Channel setup** (WhatsApp QR, Signal Docker guide)
8. **CLI reference** (all commands)
9. **Docker** (docker run example)
10. **Building community packages** (package.json pi manifest)

### Dockerfile: multi-stage build, non-root
```dockerfile
FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
RUN useradd -m -u 1000 reeboot
USER reeboot
WORKDIR /home/reeboot
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/extensions ./extensions
COPY --from=builder /app/skills ./skills
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/package.json ./
RUN npm install --omit=dev
EXPOSE 3000
ENTRYPOINT ["node", "dist/index.js", "start"]
```

Volume mount: `-v ~/.reeboot:/home/reeboot/.reeboot`

### GitHub Actions: test then publish
Two jobs: `test` (runs on every push: `npm ci`, `npm test`), `publish` (runs only on `v*` tags, depends on `test`: `npm publish --access public`, `docker build && docker push`).

### Pre-publish checklist
Run in a Docker container (clean node:22 environment) to validate `npx reeboot` works without any pre-installed global packages or existing configs.

## Risks / Trade-offs

- **npm package name squatting**: The name `reeboot` may already be taken on npm. → Check before publishing; have fallback name `@reeboot/agent` ready.
- **Docker image size**: node:22-slim + npm deps can be 300-500MB. → Use `--omit=dev` and multi-stage build. Acceptable for a personal agent.
- **README maintenance**: README can drift from implementation. → The architecture-decisions.md is the canonical technical reference; README links to it for depth.
