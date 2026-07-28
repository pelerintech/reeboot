# Tasks — delegate tool + A2A protocol

---

### 1. Create delegate tool extension (SDK-agnostic)

- [x] **RED** — Test `reeboot/tests/delegate/delegate-tool.test.ts` exists (2 tests, both pass).
- [x] **ACTION** — `reeboot/src/extensions/delegate.ts` exists with correct implementation.
- [x] **GREEN** — 2/2 tests pass.

### 2. Wire delegate extension into loader

- [x] **RED** — Test `reeboot/tests/delegate/loader-wiring.test.ts` exists (2 tests, both pass).
- [x] **ACTION** — `delegate.ts` is imported and registered in `loader.ts`.
- [x] **GREEN** — 2/2 tests pass.

### 3. Implement sub-agent session creation (pi mode)

- [x] **RED** — Test `reeboot/tests/delegate/pi-subagent.test.ts` exists (6 tests, all pass).
- [x] **ACTION** — `delegate.ts` uses `AgentRunner` interface via `runnerFactory`; `PiAgentRunner` implements `AgentRunner`.
- [x] **GREEN** — 6/6 tests pass.

### 4. Implement sub-agent session creation (ree mode)

- [x] **RED** — Test `reeboot/tests/delegate/ree-subagent.test.ts` exists (2 tests, both pass). Delegate tool is SDK-agnostic — same `AgentRunner` interface works for both pi and ree.
- [x] **ACTION** — `ReeAgentRunner` implements `AgentRunner` interface; the delegate tool works with any `AgentRunner` via `runnerFactory`.
- [x] **GREEN** — 2/2 tests pass.

### 5. Add sub-agent timeout

- [x] **RED** — Test `reeboot/tests/delegate/timeout.test.ts` exists (2 tests, both pass).
- [x] **ACTION** — Timeout logic via `Promise.race` + `AbortController` in `delegate.ts`.
- [x] **GREEN** — 2/2 tests pass.

### 6. Add A2A server endpoints to Hono

- [x] **RED** — Test `reeboot/tests/delegate/a2a-endpoints.test.ts` exists (5 tests, all pass).
- [x] **ACTION** — `GET /a2a/capabilities` and `POST /a2a/invoke` implemented in `server.ts` with API key auth.
- [x] **GREEN** — 5/5 tests pass.

### 7. Add A2A peer configuration and client

- [x] **RED** — Test `reeboot/tests/delegate/a2a-client.test.ts` exists (5 tests, all pass).
- [x] **ACTION** — `a2a` config schema in `config.ts`, `a2a-client.ts` module exists. Delegate tool routes `peer` tasks to A2A client.
- [x] **GREEN** — 5/5 tests pass.

### 8. Add A2A security (API key auth)

- [x] **RED** — Test `reeboot/tests/delegate/a2a-security.test.ts` exists (6 tests, all pass).
- [x] **ACTION** — Server endpoints check `Authorization` header; client sends API key when configured.
- [x] **GREEN** — 6/6 tests pass.
