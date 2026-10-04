/**
 * ree-tool-emission.ts — reeboot's strict-mode tool-emission policy for ree mode.
 *
 * TanStack's `@tanstack/openai-base` converter blindly treats any schema without
 * a strict-unsupported keyword as "strict-compatible" and coercively rewrites
 * it: every property is moved into `required`, optional props are null-widened,
 * and `strict:true` is emitted. OpenAI-compatible providers (OpenRouter/OpenAI)
 * reject the null-widened / forced-required shape for genuinely-optional params
 * (e.g. `session_search.limit`, `delegate.peer`/`timeout`), returning a 400 that
 * blocks every tool-enabled turn.
 *
 * This module owns the policy that corrects that at reeboot's integration layer:
 * a tool whose ORIGINAL reeboot schema has a property not listed in `required`
 * is emitted `strict:false` with the schema passed through unchanged, while an
 * all-required tool stays `strict:true`. The shared ToolDefinitions are never
 * mutated here — the decision is made from the original schema carried on the
 * tool, so pi mode (pi-ai) is unaffected.
 */

export interface JsonSchemaObject {
  type?: string;
  properties?: Record<string, JsonSchemaObject>;
  required?: string[];
  [key: string]: unknown;
}

/**
 * Returns true when a reeboot JSON-schema object can be emitted in OpenAI
 * `strict:true` mode without the coercive null-widening rewrite: i.e. every
 * declared property is also listed in `required`. If any property is optional
 * (not in `required`), strict mode would force it in / null-widen it, so we
 * must emit the tool `strict:false` instead.
 */
export function isSchemaStrictCompatible(schema: JsonSchemaObject | undefined | null): boolean {
  if (!schema || typeof schema !== 'object') return true;
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const propNames = Object.keys(properties);
  // A schema with no declared properties is trivially strict-compatible.
  if (propNames.length === 0) return true;
  // All declared properties must be required. If any is optional → not strict-compatible.
  return propNames.every((name) => required.has(name));
}

/**
 * Rewrite an emitted OpenAI Chat-Completions `tools` array so that each tool's
 * `strict` flag and `parameters` reflect the ORIGINAL reeboot schema rather than
 * TanStack's coerced shape.
 *
 * @param emittedTools - the `request.tools` array as produced by the base adapter
 * @param originalSchemas - map of tool name → original reeboot `parameters` schema
 *
 * For a tool whose original schema has an optional param, emit `strict:false`
 * and restore the original (uncoerced) parameters. Otherwise keep `strict:true`.
 * Tools with no recorded original schema are left as-is.
 */
export function rewriteToolsForStrictEmission(
  emittedTools: any[],
  originalSchemas: Record<string, JsonSchemaObject>,
): any[] {
  return emittedTools.map((tool) => {
    const fn = tool?.function;
    if (!fn || typeof fn !== 'object') return tool;
    const name = fn.name as string;
    const original = originalSchemas[name];

    if (!original) return tool; // no recorded schema → leave as-is

    if (!isSchemaStrictCompatible(original)) {
      return {
        type: 'function',
        function: {
          ...fn,
          parameters: original,
          strict: false,
        },
      };
    }

    // All-required: keep strict mode.
    return {
      ...tool,
      function: {
        ...fn,
        strict: true,
      },
    };
  });
}
