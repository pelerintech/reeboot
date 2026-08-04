/**
 * Runtime registry of external-source tools.
 *
 * The effective external-source tool set is the union of tools declared in
 * config (`security.injection_guard.external_source_tools`) and tools declared
 * at runtime by extensions — most notably provider-declared capability tools
 * that surface backend memory content (capability-registry-trust S6). Both
 * injection-guard (treat-as-data policy notice) and the pi/ree runners (output
 * scanning) consult the effective set, so provider-served content is handled
 * identically to any other external tool output — the "a tool is a tool" trust
 * boundary held across the trust machinery.
 */

const declared: string[] = [];

/** Declare a tool as an external source at runtime. Idempotent. */
export function declareExternalSourceTool(name: string): void {
  if (!declared.includes(name)) declared.push(name);
}

/**
 * The effective external-source tool set: config-declared ∪ runtime-declared.
 * Deduplicated, in config order then runtime-declaration order.
 */
export function effectiveExternalSourceTools(configTools: string[]): string[] {
  return [...new Set([...configTools, ...declared])];
}

/** Reset runtime declarations (test seam). */
export function resetExternalSourceTools(): void {
  declared.length = 0;
}
