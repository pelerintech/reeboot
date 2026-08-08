/**
 * Tool Registry Seam
 *
 * Retains the full `ToolDefinition` (name → execute) at registration time so the
 * MCP server can invoke tools headless. The SDK adapters forward `registerTool`
 * to the SDK for the agent loop, but do not retain the executable; this registry
 * is the shared, SDK-agnostic back-reference used by the MCP pass-through surface.
 *
 * All adapters (pi, ree, future) write into the same singleton so the MCP surface
 * sees the same toolset as the agent loop.
 */
import type { ToolDefinition } from './extension-api.js';

export class ToolRegistry {
  private readonly map = new Map<string, ToolDefinition>();

  /** Store a tool definition under its name (later registrations win). */
  register(tool: ToolDefinition): void {
    if (tool?.name) this.map.set(tool.name, tool);
  }

  /** Retrieve a stored tool definition by name. */
  get(name: string): ToolDefinition | undefined {
    return this.map.get(name);
  }

  /** All stored tool definitions. */
  list(): ToolDefinition[] {
    return Array.from(this.map.values());
  }

  /** True if a tool with the given name is registered. */
  has(name: string): boolean {
    return this.map.has(name);
  }

  /** Remove all entries (used by tests and teardown). */
  clear(): void {
    this.map.clear();
  }
}

/** Module-level singleton shared by the adapters and the MCP server. */
export const toolRegistry = new ToolRegistry();
