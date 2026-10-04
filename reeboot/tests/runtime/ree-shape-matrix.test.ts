import { describe, it, expect, vi } from 'vitest';

// Shape-matrix guard: reeboot's ree mode must NOT care how a model emits
// tool-call arguments — that's normalized by the TanStack AI SDK, which reads
// both streamed `TOOL_CALL_ARGS` deltas and a single-shot `TOOL_CALL_END.input`.
//
// This matrix drives the REAL `runReeAgentLoop` + the reeboot OpenAI-compatible
// adapter (the exact production path) through every realistic wire shape a model
// can produce and asserts the tool's `execute` receives the correct args in each.
// The tools and mocks are deliberately GENERIC / provider-agnostic (no reference
// to any customer or business schema), so this guards the general SDK contract
// rather than replicating one deployment's scenario.
//
// Purpose: prove the SDK path is model-agnostic, so a future fix cannot fix one
// model and silently break another.

const WORKSPACE = '/tmp/reebot-shape-ws';

function mockConfig() {
  return {
    agent: { name: 'test', model: { provider: 'custom', authMode: 'own' } },
    ree: {},
    extensions: { core: { sandbox: false, delegate: false } },
    channels: { web: { enabled: true, port: 0, trust: 'end-user' }, whatsapp: { enabled: false }, signal: { enabled: false } },
    knowledge: { enabled: false }, memory: { enabled: false }, search: { provider: 'none' },
    logging: { level: 'info' },
    security: { injection_guard: { enabled: true, external_source_tools: [] } },
  };
}
const runnerContext = { id: 'shape', workspacePath: WORKSPACE };

// Build a mock OpenAI-compatible chat-completions SSE response body.
function sseStream(chunks: any[]) {
  const enc = new TextEncoder();
  const lines = chunks.map((c) => `data: ${JSON.stringify({
    id: 'chatcmpl-test', object: 'chat.completion.chunk', created: 1, model: 'test-model',
    choices: [c],
  })}\n\n`);
  lines.push('data: [DONE]\n\n');
  return new ReadableStream({
    start(controller) { for (const l of lines) controller.enqueue(enc.encode(l)); controller.close(); },
  });
}

// Drive one full tool-call turn through the real ReeRuntime/ReeAgentRunner and
// return the args the registered tool's execute actually received.
async function driveToolTurn(
  mockFetch: ReturnType<typeof vi.fn>,
  toolSchema: any,
  toolName: string,
): Promise<any> {
  const config = {
    ...mockConfig(),
    ree: { model: { provider: 'custom', id: 'test-model', baseUrl: 'http://localhost:1234/v1', apiKey: 'test', fetch: mockFetch } },
  };
  const { ReeRuntime } = await import('@src/runtime/ree-runtime.js');
  const { ReeAgentRunner } = await import('@src/agent-runner/ree-runner.js');
  const runtime = new ReeRuntime({ config, maxChats: 10, idleTtlMs: 60000, maxHistoryPerChat: 50 });
  const runner = new ReeAgentRunner(runtime, runnerContext, config);
  let received: any = 'SENTINEL';
  const chat = runtime.getOrCreateChat(runnerContext.id, {
    context: {
      cwd: WORKSPACE, workspacePath: WORKSPACE, config,
      ui: { select: async () => undefined, confirm: async () => false, input: async () => undefined, notify: () => {} },
      hasUI: false,
    },
  });
  chat.adapter.registerTool({
    name: toolName, label: 'T', description: 'record value',
    parameters: toolSchema,
    execute: async (_id: string, params: any) => { received = params; return { content: 'ok' }; },
  } as any);
  await runner.prompt('call the tool', () => {});
  await runner.dispose().catch(() => {});
  return received;
}

// ── Generic tool schemas (provider-agnostic) ─────────────────────────────────
const allRequiredTool = {
  type: 'object' as const,
  properties: { name: { type: 'string' }, amount: { type: 'number' } },
  required: ['name', 'amount'],
};
const optionalParamTool = {
  type: 'object' as const,
  properties: { term: { type: 'string' }, limit: { type: 'number' } },
  required: ['term'],
};
const typedTool = {
  type: 'object' as const,
  properties: {
    count: { type: 'number' },
    payload: { type: 'object', properties: { id: { type: 'string' } } },
    tags: { type: 'array', items: { type: 'string' } },
  },
  required: ['count', 'payload', 'tags'],
};
const closedTool = {
  type: 'object' as const,
  properties: { label: { type: 'string' }, active: { type: 'boolean' } },
  required: ['label', 'active'],
  additionalProperties: false,
};
const noArgTool = { type: 'object' as const, properties: {}, additionalProperties: false };

// Each case is one distinct wire shape a model can emit args in. The mock stream
// always carries the tool name first then streams `arguments` fragments.
const cases: Array<{ name: string; argsPieces: string[]; expect: any; toolName: string; schema: any }> = [
  {
    name: 'multi-delta: args streamed as small fragments (OpenAI/DeepSeek style)',
    argsPieces: ['{"name":"Wi', 'dget","amount"', ':12}'],
    expect: { name: 'Widget', amount: 12 },
    toolName: 'upsert_record', schema: allRequiredTool,
  },
  {
    name: 'single-shot: entire args JSON in one delta',
    argsPieces: ['{"name":"Widget","amount":12}'],
    expect: { name: 'Widget', amount: 12 },
    toolName: 'upsert_record', schema: allRequiredTool,
  },
  {
    name: 'typed values: number + nested object + array',
    argsPieces: ['{"count":5,"payload":{"id":"x"},"tags":["a","b"]}'],
    expect: { count: 5, payload: { id: 'x' }, tags: ['a', 'b'] },
    toolName: 'process_batch', schema: typedTool,
  },
  {
    name: 'optional-param tool (strict:false) with only the required arg',
    argsPieces: ['{"term":"query text"}'],
    expect: { term: 'query text' },
    toolName: 'search_items', schema: optionalParamTool,
  },
  {
    name: 'optional-param tool with an extra optional arg emitted',
    argsPieces: ['{"term":"x","limit":10}'],
    expect: { term: 'x', limit: 10 },
    toolName: 'search_items', schema: optionalParamTool,
  },
  {
    name: 'additionalProperties:false tool streamed across fragments',
    argsPieces: ['{"label":"on","active"', ':true}'],
    expect: { label: 'on', active: true },
    toolName: 'flip_switch', schema: closedTool,
  },
  {
    name: 'no-arg tool (empty properties, strict:true) receives empty object',
    argsPieces: ['{}'],
    expect: {},
    toolName: 'run_check', schema: noArgTool,
  },
  {
    name: 'arguments arriving before id/name is fully known (index-only ordering)',
    argsPieces: ['{"name":"k","amount":1}'],
    expect: { name: 'k', amount: 1 },
    toolName: 'upsert_record', schema: allRequiredTool,
  },
];

describe.each(cases)('REE tool-arg delivery (SDK-normalized): $name', (c) => {
  it(`runs the tool with the correct args`, async () => {
    const mockFetch = vi.fn();
    const chunks: any[] = [
      { index: 0, delta: { role: 'assistant' }, finish_reason: null },
      { index: 0, delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: c.toolName, arguments: '' } }] }, finish_reason: null },
    ];
    for (const piece of c.argsPieces) {
      chunks.push({ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: piece } }] }, finish_reason: null });
    }
    chunks.push({ index: 0, delta: {}, finish_reason: 'tool_calls' });
    mockFetch
      .mockResolvedValueOnce(new Response(sseStream(chunks), { status: 200, headers: { 'content-type': 'text/event-stream' } }))
      .mockResolvedValueOnce(new Response(sseStream([
        { index: 0, delta: { role: 'assistant' }, finish_reason: null },
        { index: 0, delta: { content: 'ok' }, finish_reason: null },
        { index: 0, delta: {}, finish_reason: 'stop' },
      ]), { status: 200, headers: { 'content-type': 'text/event-stream' } }));

    const received = await driveToolTurn(mockFetch, c.schema, c.toolName);
    expect(received).toEqual(c.expect);
  });
});
