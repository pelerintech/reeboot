## 1. Signal Channel Adapter

- [x] 1.1 Write failing tests: adapter reports error if Docker not running, connects to running container, message emitted on bus, own messages ignored, message sent via REST, long message chunked, login detects existing container (TDD red)
- [x] 1.2 Implement `src/channels/signal.ts` — `SignalAdapter implements ChannelAdapter`; REST polling via signal-cli-rest-api; configurable poll interval; send chunking
- [x] 1.3 Implement `reeboot channels login signal` CLI action — Docker check, image pull, container start, registration/linking guidance
- [x] 1.4 Verify Signal adapter tests pass (TDD green — use signal-cli REST API mock)

## 2. Scheduler

- [x] 2.1 Write failing tests: enabled task registered on startup, disabled task not registered, task prompt dispatched to orchestrator, agent creates task, invalid cron error, agent lists tasks, agent cancels task, last_run updated after execution (TDD red)
- [x] 2.2 Install `node-cron` dependency
- [x] 2.3 Implement `src/scheduler.ts` — `Scheduler` class; load tasks on startup; register cron jobs; fire via orchestrator; update last_run
- [x] 2.4 Fully implement `extensions/scheduler-tool.ts` — replace stubs with real SQLite-backed tools using `getDb()` and `cron.validate()`; wire to Scheduler for job registration/cancellation
- [x] 2.5 Wire Scheduler into `reeboot start` flow (after orchestrator is initialised)
- [x] 2.6 Verify scheduler tests pass (TDD green)

## 3. Credential Proxy

- [x] 3.1 Write failing tests: proxy forwards request with real key, only binds loopback, disabled config skips start, correct provider URL used (TDD red)
- [x] 3.2 Implement `src/credential-proxy.ts` — Fastify instance on `127.0.0.1:3001`; `X-Reeboot-Provider` header routing; provider URL map; key injection
- [x] 3.3 Wire proxy start/stop into `reeboot start` (only when `config.credentialProxy.enabled = true`)
- [x] 3.4 Verify credential proxy tests pass (TDD green)

## 4. Package System

- [x] 4.1 Write failing tests: npm package installed to ~/.reeboot/packages/, identifier added to config, reload reminder printed, uninstall removes package, uninstall unknown reports error, packages list shows installed (TDD red)
- [x] 4.2 Implement `src/packages.ts` — `installPackage(spec)`, `uninstallPackage(name)`, `listPackages()` functions; npm install/uninstall subprocess; config read/write
- [x] 4.3 Wire into CLI commands: `reeboot install`, `reeboot uninstall`, `reeboot packages list`
- [x] 4.4 Verify package system tests pass (TDD green)

## 5. Doctor

- [x] 5.1 Write failing tests: all checks pass exits 0, one failure exits 1, config check valid, config check invalid, extension load check, valid API key passes, invalid API key fails, signal Docker version check, disk space check (TDD red)
- [x] 5.2 Implement `src/doctor.ts` — `runDoctor()` with all check functions; structured ✓/✗/⚠ output
- [x] 5.3 Wire `reeboot doctor` CLI command to `runDoctor()`
- [x] 5.4 Verify doctor tests pass (TDD green)

## 6. Daemon Mode

- [x] 6.1 Write failing tests: macOS plist file generated with correct content, Linux systemd unit generated, stop halts service, logs to ~/.reeboot/logs/ (TDD red — use platform mocks)
- [x] 6.2 Implement `src/daemon.ts` — `startDaemon()`, `stopDaemon()`, platform detection, plist/unit file generation, launchctl/systemctl subprocess calls, log directory setup
- [x] 6.3 Wire `reeboot start --daemon` and `reeboot stop` CLI commands
- [x] 6.4 Verify daemon tests pass (TDD green)

## 7. Task REST API

- [x] 7.1 Write failing tests: GET /api/tasks returns array, POST creates task, invalid cron 400, DELETE removes task, DELETE unknown 404 (TDD red)
- [x] 7.2 Implement `GET /api/tasks`, `POST /api/tasks`, `DELETE /api/tasks/:id` routes
- [x] 7.3 Verify task API tests pass (TDD green)

## 8. Error Handling Polish

- [x] 8.1 Write failing tests: rate-limit notifies user and retries, turn timeout aborts and notifies (TDD red)
- [x] 8.2 Implement rate-limit backoff in orchestrator (max 3 retries, exponential backoff)
- [x] 8.3 Implement turn timeout in orchestrator (configurable, default 5 min)
- [x] 8.4 Add disk-full pre-check before each agent turn start
- [x] 8.5 Verify error handling tests pass (TDD green)

## 9. Integration & Architecture Update

- [x] 9.1 Run full test suite — all tests pass, all stubs from previous changes replaced
- [x] 9.2 End-to-end smoke test: Signal message received, scheduler task fires, doctor passes on healthy system
- [x] 9.3 Update `architecture-decisions.md` — document Signal REST polling approach, credential proxy opt-in default, package install mechanism (npm --prefix), daemon mode platform detection, cron validation via node-cron validate(), turn timeout configuration, rate-limit retry strategy
