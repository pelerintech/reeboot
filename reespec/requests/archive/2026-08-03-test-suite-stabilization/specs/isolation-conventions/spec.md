# Spec — isolation-conventions

All tests run fully isolated from the real environment: no real home writes, no literal `/tmp`, deterministic time.

## GIVEN/WHEN/THEN

### Temp dirs via os.tmpdir
- GIVEN a test needs a scratch directory
- WHEN it creates one
- THEN it is created with `mkdtempSync(join(tmpdir(), ...))` (or `os.tmpdir()`), and no test contains a hardcoded `'/'tmp'/<name>` literal path. In the sandbox, `tmpdir()` resolves to a writable location, so the test runs.

### Home/log/DB isolation
- GIVEN a test touches config, the logger, the knowledge DB, or the scheduler
- WHEN it runs
- THEN it passes an injected `reebotDir`/temp home and, where applicable, an injected `dbPath` (consistent with `openDatabase(dbPath?)`); no test writes to the real `~/.reeboot`. If the global logger/DB singleton currently hardcodes the real home regardless of an injected `reebotDir`, an explicit injection path is added so tests can redirect it — with no change to default production behavior.

### Deterministic time
- GIVEN a test that observes timing-sensitive behavior (budget spend windows, scheduler polls, settings live-update, session-scope windows)
- WHEN it runs
- THEN it uses injected fake timers/clock (`vi.useFakeTimers` / an injected now) rather than real wall-clock waits, completing in well under the vitest default timeout.
