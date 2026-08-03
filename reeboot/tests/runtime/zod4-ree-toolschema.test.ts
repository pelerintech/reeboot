import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { chat, toolDefinition, maxIterations } from '@tanstack/ai';
import { openaiCompatibleText } from '@tanstack/ai-openai/compatible';

/**
 * Guard for the accepted zod-4 side effect (ci-zod4-fix): `@tanstack/ai` core
 * declares no zod dep, so it inherits root zod and its tool/schema layer
 * (`tool-definition` / `schema-converter`) now runs on zod 4.
 *
 * `@tanstack/ai`'s `schema-converter` requires a zod schema that implements the
 * Standard Schema spec with a JSON-Schema converter (`~standard.jsonSchema`,
 * present in zod v4.2+). This test drives a real `chat()` call with a zod-defined
 * server tool through the openai-compatible adapter and asserts the tool's schema
 * is serialized for the model as a proper JSON schema under the installed zod.
 * Under zod 3 this emits a raw/unstructured object, so a revert to zod 3 fails here.
 */
describe('ree tool-schema layer under zod 4', () => {
  it('serializes a zod-defined server tool as valid JSON schema', async () => {
    const captured: any[] = [];
    const mockFetch = vi.fn(async (_url: string, init: any) => {
      try {
        captured.push(JSON.parse(init.body));
      } catch {
        /* ignore */
      }
      const enc = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const sse = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;
          controller.enqueue(enc.encode(sse({
            id: 'c', object: 'chat.completion.chunk', created: 1, model: 'test',
            choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
          })));
          controller.enqueue(enc.encode(sse({
            id: 'c', object: 'chat.completion.chunk', created: 1, model: 'test',
            choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: null }],
          })));
          controller.enqueue(enc.encode(sse({
            id: 'c', object: 'chat.completion.chunk', created: 1, model: 'test',
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          })));
          controller.enqueue(enc.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    });

    const adapter = openaiCompatibleText('test-model', {
      baseURL: 'http://localhost:1234/v1',
      apiKey: 'test',
      fetch: mockFetch,
    } as any);

    const tool = toolDefinition({
      name: 'get_weather',
      description: 'Get the weather for a city',
      inputSchema: z.object({
        city: z.string(),
        units: z.enum(['c', 'f']).default('c'),
      }),
    }).server(async (args: { city: string }) => JSON.stringify({ ok: true, city: args.city }));

    // Consume the stream — driving the real agent-loop equivalent.
    for await (const _chunk of chat({
      adapter,
      messages: [{ role: 'user' as const, content: 'what is the weather in paris?' }],
      tools: [tool],
      maxIterations,
    })) {
      /* drain */
    }

    const body = captured.find((b) => b && Array.isArray(b.tools));
    expect(body, 'a request carrying tools should have been sent').toBeDefined();

    const serialized = body.tools;
    const toolEntry = serialized.find(
      (t: any) => t?.function?.name === 'get_weather' || t?.name === 'get_weather',
    );
    expect(toolEntry, 'the get_weather tool should appear in the request tools').toBeDefined();

    // The zod schema must have been converted to a real JSON schema (not a raw zod object).
    const params = toolEntry.function?.parameters ?? toolEntry.inputSchema ?? toolEntry.parameters;
    expect(params).toBeTypeOf('object');
    expect(params.type).toBe('object');
    expect(params.properties?.city).toBeDefined();
    expect(params.properties?.units?.enum).toEqual(['c', 'f']);
  });
});
