import { describe, it, expect, vi } from 'vitest';

// Capture registered tool schemas via a mock ExtensionAPI.registerTool.
function captureRegistry() {
  const tools: Record<string, any> = {};
  const api = {
    context: { config: {} },
    registerTool: (tool: any) => { tools[tool.name] = tool; },
    on: vi.fn(),
    registerCommand: vi.fn(),
    registerFlag: vi.fn(),
  };
  return { api, tools };
}

describe('strict-mode fix leaves shared tool schemas unchanged (preserve-schemas)', () => {
  it('session_search schema keeps its optional `limit` param optional', async () => {
    const { api, tools } = captureRegistry();
    const { default: sessionSearchFactory } = await import('../../src/extensions/ree-session-search.js');
    await (sessionSearchFactory as any)(api as any, {});

    const tool = tools['session_search'];
    expect(tool).toBeDefined();
    const schema = tool.parameters;
    const props = Object.keys(schema.properties);
    const required = schema.required ?? [];
    expect(props).toContain('limit');
    // `limit` must be optional — not coerced into required.
    expect(required).not.toContain('limit');
  });

  it('delegate schema keeps its optional `peer` and `timeout` params optional', async () => {
    const { api, tools } = captureRegistry();
    const { delegateExtension } = await import('../../src/extensions/delegate.js');
    (delegateExtension as any)(api as any, {});

    const tool = tools['delegate'];
    expect(tool).toBeDefined();
    const schema = tool.parameters;
    const props = Object.keys(schema.properties);
    const required = schema.required ?? [];
    expect(props).toContain('peer');
    expect(props).toContain('timeout');
    expect(required).not.toContain('peer');
    expect(required).not.toContain('timeout');
  });

  it('delegate schema still requires `task`', async () => {
    const { api, tools } = captureRegistry();
    const { delegateExtension } = await import('../../src/extensions/delegate.js');
    (delegateExtension as any)(api as any, {});
    const schema = tools['delegate'].parameters;
    expect(schema.required).toContain('task');
  });
});
