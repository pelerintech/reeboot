# Spec — test-policy

Reeboot's unit suite must verify **behavior and implementation through public interfaces**, stay **environment-agnostic**, and **never skip**.

## GIVEN/WHEN/THEN

### Behavioral over existence
- GIVEN a runnable test that asserts only that a code symbol, file, or folder exists or is named/placed a certain way (e.g. `fs.existsSync`, `expect(path).toMatch(/src\/x/)`, "file is named Y in folder Z") and that assertion yields no behavioral signal
- WHEN the suite is reviewed during this request
- THEN that assertion/test is removed (or replaced by a behavioral equivalent).

### Mocked boundaries, no external dependence
- GIVEN a test whose subject depends on an adjacent/external service (MCP server, WhatsApp/baileys, knowledge watcher/embedder, web search backend, scheduler clock, DB/logger home path)
- WHEN the test runs in isolation
- THEN that dependency is injected or faked at the system boundary; the test passes without any live external service, real child process, or real home write.

### No sockets, no shelling, no real timing, no skips
- GIVEN the suite runs in a restricted sandbox and in CI
- WHEN it executes
- THEN no test binds a real network socket, writes to the real `~/.reeboot`, writes a hardcoded `/tmp` literal, shells out to `npm`/`docker`/network tooling, or waits on real wall-clock intervals; and there are zero `it.skip`/`test.skip`/`describe.skip`/gated-exclusion directives producing a green-via-skip result.

### Public interfaces only
- GIVEN a test for any reeboot behavior
- WHEN the internal implementation is refactored but the public interface is unchanged
- THEN the test still passes (the test targets public interfaces, not internal function internals).
