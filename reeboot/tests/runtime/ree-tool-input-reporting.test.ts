import { describe, it, expect, vi } from 'vitest';

// Guardian for the truthful tool-arg reporting fix: the tool_call_end RunnerEvent
// must carry the real `input` the tool received (so the orchestrator journal /
// WS UI show the actual args, not {}). The tool executes with real args; here we
// assert the RunnerEvent that crosses to the journal/UI carries them.

const WORKSPACE = '/tmp/reebot-report-ws';
const runnerContext = { id: 'report', workspacePath: WORKSPACE };
const config = () => ({
  agent: { name: 'test', model: { provider: 'custom', authMode: 'own' } },
  ree: {},
  extensions: { core: { sandbox: false, delegate: false } },
  channels: { web: { enabled: true, port: 0, trust: 'end-user' }, whatsapp: { enabled: false }, signal: { enabled: false } },
  knowledge: { enabled: false }, memory: { enabled: false }, search: { provider: 'none' },
  logging: { level: 'error' },
  security: { injection_guard: { enabled: true, external_source_tools: [] } },
});

function sse(chunks: any[]) {
  const enc = new TextEncoder();
  const lines = chunks.map((c) => `data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', created: 1, model: 'm', choices: [{ index: 0, delta: c, finish_reason: null }] })}\n\n`);
  lines.push('data: [DONE]\n\n');
  return new ReadableStream({ start(ctrl) { for (const l of lines) ctrl.enqueue(enc.encode(l)); ctrl.close(); } });
}

describe('ree tool_call_end carries the real tool input', () => {
  it('reports the streamed args in the tool_call_end RunnerEvent (not {})', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response(sse([
        { role: 'assistant' },
        { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'set_field', arguments: '' } }] },
        { tool_calls: [{ index: 0, function: { arguments: '{"key":"company' } }] },
        { tool_calls: [{ index: 0, function: { arguments: 'Name","value":"Alpha SRL"}' } }] },
        { },
      ].map((d, i) => ({ ...d, finish_reason: i === 4 ? 'tool_calls' : null }))), { status: 200, headers: { 'content-type': 'text/event-stream' } }))
      .mockResolvedValueOnce(new Response(sse([
        { role: 'assistant' }, { content: 'ok' }, { },
      ].map((d, i) => ({ ...d, finish_reason: i === 2 ? 'stop' : null }))), { status: 200, headers: { 'content-type': 'text/event-stream' } }));

    const cfg = { ...config(), ree: { model: { provider: 'custom', id: 'm', baseUrl: 'http://localhost:1234/v1', apiKey: 't', fetch: mockFetch } } };
    const { ReeRuntime } = await import('@src/runtime/ree-runtime.js');
    const { ReeAgentRunner } = await import('@src/agent-runner/ree-runner.js');
    const runtime = new ReeRuntime({ config: cfg, maxChats: 10, idleTtlMs: 60000, maxHistoryPerChat: 50 });
    const runner = new ReeAgentRunner(runtime, runnerContext, cfg);
    const chat = runtime.getOrCreateChat(runnerContext.id, { context: { cwd: WORKSPACE, workspacePath: WORKSPACE, config: cfg, ui: { select: async () => undefined, confirm: async () => false, input: async () => undefined, notify: () => {} }, hasUI: false } });
    chat.adapter.registerTool({ name: 'set_field', label: 'T', description: 'd', parameters: { type: 'object' as const, properties: { key: { type: 'string' }, value: { type: 'string' } }, required: ['key', 'value'] }, execute: async () => ({ content: 'ok' }) } as any);

    const runnerEvents: any[] = [];
    await runner.prompt('call', (e) => runnerEvents.push(e));
    const end = runnerEvents.find((e) => e.type === 'tool_call_end');
    console.log('=== tool_call_end:', JSON.stringify({ input: end?.input, tool_input: end?.tool_input, tool_output: end?.tool_output, result: end?.result }));
    expect(end?.input).toEqual({ key: 'companyName', value: 'Alpha SRL' });
    expect(end?.tool_input).toEqual({ key: 'companyName', value: 'Alpha SRL' });
    expect(end?.tool_output).toBe('ok');
  });
});
