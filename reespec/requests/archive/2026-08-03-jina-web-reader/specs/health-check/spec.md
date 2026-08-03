# Spec — Jina health check

## Capability

`checkJinaHealth(baseUrl)` probes the sidekick and reports whether it is reachable, so
tools are only registered when the sidekick is actually up (mirroring
`checkSearXNGHealth`).

## Scenarios

### GIVEN a reachable Jina Reader container at `baseUrl`
WHEN `checkJinaHealth(baseUrl)` is called
THEN it returns `true`

### GIVEN an unreachable `baseUrl` (connection refused / DNS / non-2xx)
WHEN `checkJinaHealth(baseUrl)` is called
THEN it returns `false`

### GIVEN a slow/hanging `baseUrl`
WHEN `checkJinaHealth(baseUrl)` is called
THEN it returns `false` within a bounded timeout (does not hang indefinitely)

### GIVEN an empty `baseUrl`
WHEN the extension loads with `jina_base_url === ''`
THEN no health check HTTP call is made
AND no Jina tools are registered
