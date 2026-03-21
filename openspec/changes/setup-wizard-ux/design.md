## Context

Phase 1's `setup-wizard.ts` is ~300 lines of sequential `inquirer` prompts with no channel linking, no model selection, and broken Ollama support. The entry point (`src/index.ts`) registers `reeboot` (no args) as printing help. Non-technical users are expected to know to run `reeboot setup`, then separately run `reeboot channel login whatsapp`, then `reeboot start` — three separate steps with no guidance between them.

The Phase 2 wizard collapses all of this into a single `reeboot` invocation. The design must be testable end-to-end: all wizard steps use an injectable `prompter` interface so tests can drive the full flow without a real TTY.

TDD mandate: every spec in this change follows red/green discipline — tests are written first (failing), then the minimum implementation to make them pass. No implementation code without a failing test first.

## Goals / Non-Goals

**Goals:**
- `reeboot` with no args: detect config state → wizard if missing, start if present
- Full 4-step wizard with injectable prompt interface (testable without TTY)
- 8 providers with curated model lists; Ollama writes `~/.reeboot/models.json`
- Inline WhatsApp QR with 2-minute timeout, graceful fallback
- Inline Signal with Docker detection (3 cases), phone number prompt, QR, graceful fallback
- Web search sub-step (Step 3b) after channels: DDG default, 4 API-key providers, SearXNG Docker
- Atomic config write: all-or-nothing, config file only written after all questions answered
- Step 4: summary + offer to start agent immediately
- All paths (including timeouts, Docker not found, Ctrl+C mid-QR) tested

**Non-Goals:**
- API key validation during wizard (handled by `reeboot doctor` post-setup)
- Multiple Ollama model entry (single model for first run; user edits `models.json` after)
- Smart "which part do you want to reconfigure?" menu on `reeboot setup` re-run (overwrite confirmation only)
- Signal QR as PNG-to-ASCII (print URL instead; avoids `jimp`/`sharp` dep)

## Decisions

### D1: Injectable prompter interface (testability)

The wizard receives a `Prompter` interface instead of calling `inquirer` directly. Tests pass a fake prompter that resolves with preset answers. Production uses an `InquirerPrompter` wrapper.

```typescript
interface Prompter {
  select(opts: SelectOptions): Promise<string>;
  input(opts: InputOptions): Promise<string>;
  checkbox(opts: CheckboxOptions): Promise<string[]>;
  confirm(opts: ConfirmOptions): Promise<boolean>;
}
```

**Alternative considered:** mocking `inquirer` at the module level. Rejected — module mocking is brittle and leaks between tests. An explicit interface is clean and makes wizard logic unit-testable.

### D2: WhatsApp linking uses existing adapter code path

The wizard calls `WhatsAppAdapter.linkDevice(onQr, onSuccess, onTimeout)` — the same underlying code as `reeboot channel login whatsapp`. The adapter handles Baileys init, QR events, and connection state. Wizard just renders the QR and starts a 2-minute timeout.

**Auth dir handling:** During wizard, Baileys writes to a temp dir (`~/.reeboot/.wiz-wa-auth-<ts>`). On success: moved to permanent location (`~/.reeboot/channels/whatsapp/`). On timeout/skip/Ctrl+C: temp dir deleted on next wizard run.

### D3: Signal QR as URL, not PNG-to-ASCII

`signal-cli-rest-api /v1/qrcodelink` returns a PNG. Converting PNG → ASCII in the terminal requires `jimp` or `sharp` (native bindings). Instead, the wizard prints the QR link URL and instructs the user to open it in a browser, or uses `open` (macOS/Linux) to open it automatically.

**Alternative considered:** `jimp` PNG-to-ASCII. Rejected — native dep, complex, cross-platform issues.

### D4: Docker detection as shared utility

Both Signal and SearXNG need the same 3-case Docker detection. Extracted to `src/utils/docker.ts`:
```typescript
type DockerStatus = 'not-installed' | 'not-running' | 'running';
async function checkDockerStatus(): Promise<DockerStatus>
```
Signal and SearXNG sub-flows both call this. Not duplicated.

### D5: `reeboot` default action — check config file existence

```typescript
program.action(async (opts) => {
  if (!existsSync(getDefaultConfigPath())) {
    await runWizard({ interactive: !opts.noInteractive });
  } else {
    await startAgent();
  }
});
```

Simple and testable. `getDefaultConfigPath()` is already injectable via env var (`REEBOOT_CONFIG_PATH`) for tests.

### D6: Atomic config write (existing pattern, unchanged)

The wizard collects all answers into a `ConfigDraft` object first, then calls `saveConfig(draft)` once at the end. `saveConfig` already does atomic write (same-dir temp file + rename). If the wizard exits early (Ctrl+C or error), no config is written.

### D7: TDD red/green implementation order per spec

For each spec (first-run-entrypoint, wizard-provider-setup, wizard-channel-linking, wizard-web-search-setup, wizard-launch):
1. Write all tests for the spec first — they fail (red)
2. Write minimum implementation to make tests pass (green)
3. Refactor if needed without breaking tests

Test files must be committed before corresponding implementation files in each task.

## Risks / Trade-offs

- **WhatsApp Baileys timing** → Wizard sets 2-minute hard timeout via `Promise.race`; Ctrl+C during QR leaves temp auth dir → cleaned on next wizard run (documented)
- **Signal container pull time** → `docker pull` can take 30–120s on first run → wizard shows spinner with message "Pulling signal container (first time only, ~500MB)..."
- **SearXNG DDG fallback silently** → If SearXNG container fails to start, wizard falls back to DDG and logs a warning. User may not notice. Mitigation: explicit message shown in Step 3b summary
- **Provider model list going stale** → Curated list is small (3 models per provider) and reviewed each release; provider API changes are rare
- **`reeboot` default behaviour change is BREAKING** → Scripts that call `reeboot` expecting help output will get wizard or agent start instead. Mitigation: `reeboot --help` still works; breaking change documented in changelog

## Migration Plan

1. Tests written first (all failing) — committed as `test: wizard-ux specs [red]`
2. Implementation in task order (entrypoint → provider → channels → search → launch)
3. Each task committed as `feat: <task-name> [green]`
4. `reeboot setup` re-run confirmation tested explicitly
5. Existing `setup-wizard.test.ts` expanded, not replaced wholesale — old tests updated to new interface

## Open Questions

- Signal QR URL: use `open` command (macOS/Linux) or just print URL? Decision: print URL + note, avoid `open` for cross-platform safety.
- Wizard re-run (`reeboot setup` when config exists): simple "overwrite?" confirm is fine for now.
