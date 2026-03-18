## Why

Phase 1 is feature-complete. The final step is to make `reeboot` available to the world: prepare the npm package for publication, validate the end-to-end `npx reeboot` zero-config experience, write the README that explains installation and the extension system ladder, build the Docker image, and run a full pre-publish checklist.

## What Changes

- Verify and finalize `package.json`: `bin`, `exports` (including `reeboot/channels` for adapter authors), `files`, `engines`, `keywords`, version, license
- Write `README.md`: installation instructions, first-run experience, configuration reference, extension ladder (Skills → Pi Extensions → Channel Adapters), `reeboot doctor`, community packages, and screenshots/GIFs
- Add `container/Dockerfile` and `container/entrypoint.sh` for the Docker image
- Add CI workflow (GitHub Actions): lint, test, build on Node 22, publish to npm on version tag
- Run full end-to-end test of `npx reeboot` on a clean machine (or clean Docker container)
- Fix any issues discovered during pre-publish testing
- Publish to npm as `reeboot` package
- Build and push Docker image to Docker Hub as `reeboot/reeboot`

## Capabilities

### New Capabilities

- `docker-image`: `reeboot/reeboot` Docker image that runs the agent with `~/.reeboot` mounted

### Modified Capabilities

- `cli-entrypoint`: package.json `bin`, `exports`, and `files` finalized for publish; version bumped to `1.0.0`

## Impact

- npm package `reeboot` published publicly
- Docker image `reeboot/reeboot` published to Docker Hub
- GitHub Actions CI/CD pipeline added
- No code changes to core logic — this is packaging, docs, and validation only (unless bugs are found during pre-publish testing)
