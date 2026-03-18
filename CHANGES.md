# Reeboot — Change Execution Order

Apply these changes **in order**. Each change builds on the previous one.
When ready to implement a change, run `/opsx:apply` and tell the agent which change to work on.

---

## 1. `repo-foundation` ← start here
**Week 1 — Project skeleton**
TypeScript/ESM repo, CLI entry point, config system (`~/.reeboot/config.json`),
SQLite/Drizzle schema, Fastify HTTP server skeleton (`/api/health`, `/api/status`),
interactive setup wizard.

**Milestone:** `npx reeboot --help` works. `reeboot setup` writes config and scaffolds `~/.reeboot/`.

---

## 2. `agent-runner-and-webchat`
**Week 2 — Intelligence layer + first UI**
`AgentRunner` interface, `PiAgentRunner` (wraps pi SDK), extension loader with
bundled pi extensions, WebSocket chat endpoint (`/ws/chat/:contextId`),
built-in WebChat UI at `GET /`, context system.

**Depends on:** `repo-foundation`
**Milestone:** Open browser → type message → get streaming AI response.

---

## 3. `whatsapp-routing-hot-reload`
**Week 3 — WhatsApp + orchestration**
`ChannelAdapter` interface (exported as `reeboot/channels`), `ChannelRegistry`,
Baileys v7 WhatsApp adapter, `Orchestrator` with routing rules, in-chat commands
(`/new`, `/context`, `/compact`, `/status`), session inactivity timeout,
`reeboot reload` and `reeboot restart` fully implemented.

**Depends on:** `agent-runner-and-webchat`
**Milestone:** WhatsApp message → agent → reply.

---

## 4. `signal-scheduler-packages`
**Week 4 — Signal, scheduler, ops**
Signal adapter (signal-cli-rest-api Docker sidecar), node-cron scheduler with
agent-callable tools, credential proxy, `reeboot install/uninstall/packages list`,
full `reeboot doctor`, daemon mode (launchd/systemd), error handling polish
(rate-limit backoff, turn timeout).

**Depends on:** `whatsapp-routing-hot-reload`
**Milestone:** Phase 1 feature-complete.

---

## 5. `npm-publish-and-docs`
**Week 5 — Ship it**
`package.json` finalized for npm publish, `README.md`, Dockerfile (multi-stage,
non-root), GitHub Actions CI/CD pipeline, end-to-end pre-publish validation,
npm publish + Docker Hub push.

**Depends on:** `signal-scheduler-packages`
**Milestone:** `npx reeboot` works from npmjs.com. Published. ✓

---

## Implementation Rules (apply to every change)

- **TDD**: Write failing tests first (red), then implement (green). Every task group follows this pattern.
- **Architecture log**: The last task in every change is to update `architecture-decisions.md` with decisions made during implementation. Do this — the next change depends on it.
- **One change at a time**: Don't start change N+1 until all tasks in change N are checked off and `architecture-decisions.md` is updated.
