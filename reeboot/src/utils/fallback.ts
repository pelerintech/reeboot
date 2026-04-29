// ─── fallback helper ─────────────────────────────────────────────────────────
/**
 * Defensively merge an object section with its fallback defaults.
 * If `section` is null or undefined, returns a shallow clone of `fallback`.
 * Otherwise returns `{ ...fallback, ...section }` so that any missing or null
 * keys in `section` are filled in from `fallback`.
 *
 * Usage in config builders:
 *   const baseAgent = fb(existing?.agent, defaultConfig.agent);
 *   const config = { ...fb(existing, defaultConfig), agent: baseAgent };
 */
export function fb<T extends object>(section: T | null | undefined, fallback: T): T {
  return section ? ({ ...fallback, ...section } as T) : ({ ...fallback } as T);
}
