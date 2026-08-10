# Brief — pi-sdk-084-upgrade

## Why

After the `2.7.0` release was cut and pushed, GitHub surfaced **100+ security alerts**
on the `Security` tab — a Dependabot dependency-vulnerability signal. Root cause: reeboot
pins `@earendil-works/pi-coding-agent` at **exactly `0.75.4`**, which drags in stale
transitive dependencies of the pi runtime (`undici@8.3.0`, `ws` in the `8.0.0–8.20.1`
vulnerable range) that `npm audit` reports as 15 high + 1 critical. Because pi is a
**production dependency** (reeboot embeds the pi agent runtime), these are runtime alerts,
not dev-only noise — inflated to 100+ by GitHub aggregating the whole tree.

`npm audit fix --force` is not an option: it force-jumps pi to `0.84.1` as a "breaking
change," and reeboot's integration with the pi SDK spans the session/auth construction
surface, which changed shape between `0.75.4` and `0.84.x`. The honest fix is a deliberate,
tested SDK migration up to the current pi, not a blind force-upgrade.

## What Changes

After this request completes:

- `@earendil-works/pi-coding-agent` is upgraded from `0.75.4` to `0.84.1` (latest), clearing
  the high/critical Dependabot alerts in the pi runtime's bundled `undici` / `ws`.
- `@earendil-works/pi-ai` and `@earendil-works/pi-agent-core` are added as **pinned direct
  dependencies** (matched to the pi version) so reeboot can build `Model`s itself.
- Reeboot's PiAgentRunner builds the session for both auth modes against the new SDK:
  - `authMode === 'own'` (default, production): reeboot constructs the `Model` from its own
    config and passes it to `createAgentSession({ model })`, owning the provider→model
    matrix — including custom-URL / local / OpenAI-compatible providers with their `baseUrl`.
  - `authMode === 'pi'` (local convenience): reeboot stops building `AuthStorage`/`ModelRegistry`
    and lets `createAgentSession` default its runtime from the user's existing `~/.pi/agent`.
- The latent **`baseUrl` gap** is closed: reeboot's configured `baseUrl` finally reaches the
  pi session in the `'own'` path (today it is declared in config but never plumbed through).
- Reeboot's other pi touchpoints (`PiExtensionAdapter` bridge, event-stream mapping,
  `generateSummary`, `loadProjectContextFiles`, `DefaultPackageManager`, `SettingsManager`,
  `SessionManager`, `DefaultResourceLoader`) are validated against the new SDK and updated
  only where the surface changed.
- Typecheck, lint, and the reeboot test suite are green after the migration.

## Goals

- **Clear the security signal**: no high/critical Dependabot alerts attributable to the pi
  runtime after the bump (verified via `npm audit`, reconciled against the current tree).
- **A deliberate upgrade, not a force-fix**: pi lands on `0.84.1` through a tested migration,
  with RED/GREEN coverage of the changed SDK surface.
- **Preserve both auth modes**: the local "use my existing pi" flow (`'pi'`) and the
  production "inject reeboot's own creds" flow (`'own'`) both keep working.
- **Close the baseUrl gap** so custom-URL/local deployments genuinely work in pi mode.
- **Move to the new model-construction idiom** reeboot committed to in discovery.

## Non-Goals

- **Not fixing reeboot's other direct/transitive alerts out of scope of the pi bump** — but
  reeboot's own directly-vulnerable deps (e.g. its direct `ws`) surfaced in the same audit
  MUST be reconciled or explicitly documented, not silently left.
- **Not** changing the extension/event behavior beyond what the new SDK requires.
- **Not** a general dependency audit / refresh of unrelated packages.
- **Not** introducing new features beyond closing the baseUrl gap and the SDK migration.
- **Not** touching ree-mode (TanStack AI) auth paths — scope is the pi (`PiAgentRunner`) path.

## Impact

- **Operators / users**: custom-URL and local (ollama/lmstudio/custom) deployments start
  working correctly in pi mode once baseUrl is plumbed; security posture improves.
- **Release mechanics**: a future `2.x.y` release will carry the upgraded pi runtime.
- **Owners of this code**: `_getOrCreateSession` and the auth/model construction block in
  `src/agent-runner/pi-runner.ts` are the main rework; the pi-mode mock in the runner tests
  updates too.
