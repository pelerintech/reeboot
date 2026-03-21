/**
 * probeSearXNG
 *
 * Probes well-known ports for a running SearXNG instance.
 * Returns the first URL that responds with valid SearXNG JSON (has a "results" key),
 * or null if none are found.
 */

const PROBE_PORTS = [8080, 8888, 4000];
const PROBE_TIMEOUT_MS = 3000;

export async function probeSearXNG(): Promise<string | null> {
  for (const port of PROBE_PORTS) {
    const url = `http://localhost:${port}/search?q=test&format=json`;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const data = await res.json() as any;
      if (data && typeof data === 'object' && 'results' in data) {
        return `http://localhost:${port}`;
      }
    } catch {
      // timeout, connection refused, parse error — try next port
    }
  }
  return null;
}
