# Decisions

Architectural and strategic decisions across all requests.
One decision per entry. One paragraph. Reference the request for details.

## Entry format

### <Decision title> — YYYY-MM-DD (Request: <request-name>)

What was decided and why. What was considered and rejected.
See request artifacts for full context.

---

## What belongs here
- Library or technology choices with rationale
- Architectural patterns adopted
- Approaches explicitly rejected and why
- Deviations from the original plan with explanation
- Decisions that constrain future work

## What does NOT belong here
- Activity entries ("added X", "removed Y", "refactored Z")
- Implementation details available in request artifacts
- Decisions too small to affect future planning

---

<!-- decisions below this line -->

### External packages managed via pi's DefaultPackageManager, not custom npm — 2026-03-21 (Request: package-install-fix)

Reeboot's original `packages.ts` reimplemented package management (npm install to `~/.reeboot/packages/`, tracking in `config.json`). This was broken: pi's `DefaultPackageManager` reads package lists from `agentDir/settings.json`, not `config.json`. Packages were installed but never discovered by the loader. The fix delegates to pi's `DefaultPackageManager` directly — it handles installation, settings.json tracking, and discovery on reload. User-scope npm packages are installed globally (`npm install -g`) consistent with how pi itself works. A one-time migration moves legacy `config.json` packages to `settings.json` on startup.

### authMode splits auth from identity in pi session — 2026-03-21 (Request: agent-isolation)

Reeboot's pi-runner was accidentally delegating model selection, API key resolution, and persona to `~/.pi/agent/` because pi's `DefaultResourceLoader` uses `agentDir` for both identity (AGENTS.md, extensions) and auth (auth.json, settings.json). The fix splits these: `agentDir` is always `~/.reeboot/agent/` for persona/extensions; auth/model is driven by `authMode: "pi" | "own"` in config.json. `authMode: "pi"` delegates to pi's own files; `authMode: "own"` injects credentials as runtime overrides via pi's `AuthStorage` API. Considered a single shared agentDir with pi (Option B) — rejected because user's personal pi extensions, settings, and persona bleed into reeboot.

### Pi is a bundled dependency, not an assumed host installation — 2026-03-21 (Request: agent-isolation)

Pi (`@mariozechner/pi-coding-agent`) is listed in reeboot's `package.json` dependencies and ships inside reeboot's `node_modules`. No separate pi installation is required on the host or in Docker. The user's personal pi installation (if present) is only relevant for `authMode: "pi"` auth delegation — the binary, runtime, and code are always reeboot's bundled copy.

### Docker headless config via env vars, existing config wins — 2026-03-21 (Request: agent-isolation)

For headless Docker deployments, `REEBOOT_*` env vars are translated to `--no-interactive` flags by `entrypoint.sh` only when no `config.json` exists. If a config.json is already present (volume mount from host setup), it is used as-is and env vars are ignored. `REEBOOT_AGENTS_MD` is an exception — it writes directly to `~/.reeboot/agent/AGENTS.md` before start, enabling persona injection without a wizard. A future platform can implement richer config bundle injection (URL fetch, base64 decode) as an entrypoint wrapper outside reeboot core.
