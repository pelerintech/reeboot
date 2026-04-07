# Design: web-search-fix

## Fix 1: pass reeboot config to web-search extension

Pi's `ExtensionAPI` has no `getConfig()` method — it's not in the public interface.
The web-search extension must receive the reeboot config another way.

The existing pattern (already used by `skill-manager`) is to pass config as a second
argument from the extension factory:

```typescript
// src/extensions/loader.ts — current (broken)
if (webSearchEnabled) {
  factories.push(async (pi) => {
    const mod = await import(...'web-search.ts'...)
    if (mod?.default) await (mod.default as any)(pi)  // ← config not passed
  })
}

// target (fixed)
if (webSearchEnabled) {
  factories.push(async (pi) => {
    const mod = await import(...'web-search.ts'...)
    if (mod?.default) await (mod.default as any)(pi, config)  // ← pass config
  })
}
```

In `extensions/web-search.ts`, update the default export signature:

```typescript
// current (broken)
export default async function webSearchExtension(pi: ExtensionAPI): Promise<void> {
  const config = (pi.getConfig() as any);  // ← undefined

// target (fixed)
export default async function webSearchExtension(pi: ExtensionAPI, reebotConfig?: any): Promise<void> {
  const config = reebotConfig;             // ← actual reeboot config
```

The `reebotConfig` parameter is typed as `any` (or `Config`) to avoid circular
dependency between extensions/ and src/. Optional so the extension still loads
gracefully if called without config (returns early with only fetch_url registered).

## Fix 2: detect existing SearXNG by probing known ports

Instead of parsing docker ps (brittle, docker dependency), probe the well-known
ports that SearXNG commonly runs on. If one responds with valid JSON, pre-fill
the URL. Always ask the user to confirm or edit — they may use a different port,
hostname, or HTTPS reverse proxy.

```
probeSearXNG():
  Ports to try in order: [8080, 8888, 4000]
  For each port:
    GET http://localhost:<port>/search?q=test&format=json  (3s timeout)
    If response is valid JSON with a "results" key → return "http://localhost:<port>"
  If none respond → return null
```

Wizard SearXNG subflow updated:

```
runSearXNGSubflow():
  1. Check docker running (existing)
  2. NEW: probeSearXNG()
     → found (e.g. "http://localhost:8080"):
        show input prompt pre-filled with found URL:
          "SearXNG URL (confirm or edit):" → "http://localhost:8080"
        user can confirm or change to e.g. "http://localhost:7777"
     → not found:
        show input prompt pre-filled with "http://localhost:8080" (hint):
          "SearXNG URL:" → "http://localhost:8080"
        user types their URL
  3. Existing start-new-container option becomes separate prompt:
     After URL is entered, ask: "Start a new reeboot-searxng container,
     or use this URL directly?"
     → "Use URL directly" → return with that URL
     → "Start new container on port 8888" → existing docker run flow,
        then return with http://localhost:8888
```

This approach:
- No docker dependency for detection
- Works for any SearXNG deployment (bare metal, different docker setup, remote)
- User always owns the final URL
- Pre-fill reduces friction for common cases

## Also fix: config.ts default URL inconsistency

`config.ts` defaults `searxngBaseUrl` to `http://localhost:4000` but reeboot's own
container starts on `8888`. Fix default to `http://localhost:8888` to match reeboot's
own container. The probe still tries `[8080, 8888, 4000]` to find any existing
SearXNG, but the hint shown to the user and the config default both use `8888`.

## Risks

- probeSearXNG may get false positives if port 8080 is used by something else
  → health check requires valid JSON with "results" key, not just HTTP 200
- User's SearXNG may have JSON format disabled → probe returns no match → user
  enters URL manually (acceptable degradation)
