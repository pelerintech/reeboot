## 1. Package.json Finalisation

- [ ] 1.1 Write failing tests: npm pack includes only expected files, engines field present, exports shape correct, bin entry correct (TDD red)
- [ ] 1.2 Finalize `package.json`: version 1.0.0, license, engines, files whitelist, exports with reeboot/channels, keywords
- [ ] 1.3 Verify package.json tests pass (TDD green)
- [ ] 1.4 Run `npm pack --dry-run` and confirm only expected files appear in tarball

## 2. README

- [ ] 2.1 Write `README.md` with all required sections: tagline, quick-start (3 commands), capabilities table, architecture overview, configuration reference, extension ladder (skills → pi extensions → channel adapters), WhatsApp setup (QR), Signal setup (Docker), CLI reference, Docker usage, building community packages
- [ ] 2.2 Add screenshots or text-based diagrams for the WebChat UI and terminal QR code

## 3. Docker Image

- [ ] 3.1 Write failing test: container starts and health endpoint returns 200 within 10 seconds, process runs as non-root uid 1000 (TDD red — use docker-compose for test environment)
- [ ] 3.2 Write `container/Dockerfile` — multi-stage build (builder + runtime), node:22-slim, non-root user (uid 1000), EXPOSE 3000, ENTRYPOINT
- [ ] 3.3 Write `container/entrypoint.sh` — minimal wrapper that starts `node dist/index.js start`
- [ ] 3.4 Verify Docker image test passes: `docker build && docker run` health check
- [ ] 3.5 Verify container runs as non-root

## 4. CI/CD Pipeline

- [ ] 4.1 Write `.github/workflows/ci.yml` — `test` job: checkout, setup Node 22, `npm ci`, `npm test`; `publish` job: depends on test, runs on `v*` tags, `npm publish --access public`
- [ ] 4.2 Add Docker build+push step to `publish` job: build `reeboot/reeboot:latest` and `reeboot/reeboot:<version>`, push to Docker Hub using GitHub secrets
- [ ] 4.3 Add `NPM_TOKEN` and `DOCKERHUB_TOKEN` secret instructions to README

## 5. Pre-Publish End-to-End Validation

- [ ] 5.1 Build package: `npm run build` — no TypeScript errors, `dist/` populated
- [ ] 5.2 Smoke test in clean Docker container (node:22): `npm install -g ./reeboot-1.0.0.tgz && reeboot --help` — works
- [ ] 5.3 Smoke test wizard: run `reeboot setup --provider anthropic --api-key $TEST_KEY --model claude-haiku-3 --channels web --no-interactive` — config written, directories created
- [ ] 5.4 Smoke test agent: `reeboot start` → curl health → open WebChat → send "hello" → verify response
- [ ] 5.5 Fix any issues found during validation

## 6. Publish

- [ ] 6.1 Check npm package name availability: `npm view reeboot` — if taken, fall back to `@reeboot/agent` and update README + bin accordingly
- [ ] 6.2 `npm publish --access public` (or `npm publish --dry-run` first to confirm tarball)
- [ ] 6.3 Verify: `npx reeboot --help` works from npmjs.com
- [ ] 6.4 `docker build -t reeboot/reeboot:1.0.0 -t reeboot/reeboot:latest . && docker push reeboot/reeboot:1.0.0 && docker push reeboot/reeboot:latest`
- [ ] 6.5 Verify Docker image on Docker Hub

## 7. Architecture Update

- [ ] 7.1 Update `architecture-decisions.md` — document final package.json exports shape, npm name resolution (reeboot vs @reeboot/agent), Docker multi-stage build approach, CI/CD publish flow, and any bugs or deviations from original plan discovered during pre-publish testing
