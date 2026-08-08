/**
 * Task 1 — Registry seam retains full ToolDefinitions for headless invocation.
 *
 * The MCP pass-through needs to retrieve the raw ToolDefinition (name → execute)
 * at tools/call time. The SDK adapter currently forwards registerTool to the SDK
 * but does not retain the executable. This seam captures it so the MCP server can
 * invoke execute() headless.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { toolRegistry } from '@src/extensions/tool-registry.js';
import { PiExtensionAdapter } from '@src/extensions/pi-adapter.js';
import type { ToolDefinition } from '@src/extensions/extension-api.js';

// A self-contained tool (like knowledge_search / session_search) that only needs
// params, not live agent context.
const substrateTool: ToolDefinition = {
  name: 'substrate_tool',
  label: 'Substrate Tool',
  description: 'A read-only substrate tool',
  parameters: { type: 'object', properties: { q: { type: 'string' } } },
  execute: async (_id: string, params: any) => ({
    content: [{ type: 'text' as const, text: `result:${params.q}` }],
    details: {},
  }),
};

// A tool whose execute uses the provided (headless) ExtensionContext.
const ctxAwareTool: ToolDefinition = {
  name: 'ctx_tool',
  label: 'Ctx Tool',
  description: 'Uses the extension context',
  parameters: { type: 'object', properties: {} },
  execute: async (_id: string, _params: any, _signal: unknown, _onUpdate: unknown, ctx: any) => ({
    content: [{ type: 'text' as const, text: `hasUI:${ctx.hasUI}` }],
    details: {},
  }),
};

function makeMockPi() {
  const registered: Record<string, any> = {};
  return {
    registerTool: (t: any) => { registered[t.name] = t; },
    on: () => () => {},
  };
}

describe('tool registry seam', () => {
  beforeEach(() => toolRegistry.clear());
  afterEach(() => toolRegistry.clear());

  it('retains name → execute at registration', () => {
    toolRegistry.register(substrateTool);
    toolRegistry.register(ctxAwareTool);

    expect(toolRegistry.get('substrate_tool')?.execute).toBeTypeOf('function');
    expect(toolRegistry.get('ctx_tool')?.execute).toBeTypeOf('function');
    expect(toolRegistry.list().map((t) => t.name)).toEqual(
      expect.arrayContaining(['substrate_tool', 'ctx_tool']),
    );
  });

  it('a retained execute can be invoked headless with params', async () => {
    toolRegistry.register(substrateTool);
    const def = toolRegistry.get('substrate_tool')!;
    const out = await def.execute('call-1', { q: 'hello' });
    const text = (out.content as any[])[0].text;
    expect(text).toBe('result:hello');
  });

  it('a retained execute receives a provided headless ExtensionContext', async () => {
    toolRegistry.register(ctxAwareTool);
    const def = toolRegistry.get('ctx_tool')!;
    const out = await def.execute('call-1', {}, undefined, undefined, { hasUI: false });
    const text = (out.content as any[])[0].text;
    expect(text).toBe('hasUI:false');
  });

  it('the Pi adapter records registered tools into the seam', () => {
    const adapter = new PiExtensionAdapter(makeMockPi() as any, {} as any);
    adapter.registerTool(substrateTool);
    expect(toolRegistry.get('substrate_tool')?.execute).toBeTypeOf('function');
  });
});
