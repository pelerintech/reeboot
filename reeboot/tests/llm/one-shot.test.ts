import { describe, it, expect, vi } from 'vitest';

describe('createLlmCall', () => {
  it('S1: issues one non-streaming POST and returns the assistant text', async () => {
    // Arrange
    const mockResponse = {
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'test-model',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'Hello from LLM',
            refusal: null,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 2,
        completion_tokens: 4,
        total_tokens: 6,
      },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });

    const config = {
      agent: {
        model: {
          authMode: 'own' as const,
          provider: 'custom',
          id: 'test-model',
          apiKey: 'test-key',
          baseUrl: 'http://localhost:1234/v1',
          api: 'openai-completions',
          providers: [
            {
              provider: 'custom',
              id: 'test-model',
              apiKey: 'test-key',
              baseUrl: 'http://localhost:1234/v1',
              api: 'openai-completions' as const,
              default: true,
            },
          ],
        },
      },
    };

    // Act
    const { createLlmCall } = await import('@src/llm/one-shot.js');
    const llmCall = createLlmCall(config, mockFetch as any);
    const result = await llmCall('hello');

    // Assert
    expect(result).toBe('Hello from LLM');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const callArgs = mockFetch.mock.calls[0];
    const url = callArgs[0];
    const options = callArgs[1];

    expect(url).toContain('/chat/completions');
    expect(options.method).toBe('POST');

    const body = JSON.parse(options.body);
    expect(body.messages[0].content).toBe('hello');
    expect(body.stream).toBe(false);
  });
});
