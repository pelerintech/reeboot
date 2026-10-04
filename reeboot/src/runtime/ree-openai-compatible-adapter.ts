/**
 * ree-openai-compatible-adapter.ts — a reeboot-owned OpenAI-compatible text
 * adapter for ree mode.
 *
 * Reeboot extends TanStack's `OpenAICompatibleChatAdapter` so it can correct the
 * strict-mode tool emission at its integration layer. TanStack's base adapter
 * coercively rewrites any schema with optional params into `strict:true`
 * (null-widened, all-props-required), which OpenAI-compatible providers reject.
 * This adapter overrides `mapOptionsToRequest` to apply reeboot's strict policy
 * (see `ree-tool-emission.ts`), keeping the shared tool schemas SDK-agnostic and
 * leaving pi mode unaffected.
 */

import OpenAI from 'openai';
import type { ChatCompletionCreateParamsStreaming } from 'openai/resources/chat/completions';
import type { TextOptions } from '@tanstack/ai';
import { OpenAICompatibleChatAdapter } from '@tanstack/ai-openai/compatible';
import {
  rewriteToolsForStrictEmission,
  type JsonSchemaObject,
} from './ree-tool-emission.js';

/**
 * Collect each tool's original reeboot schema (carried on the tool's
 * `metadata.reebotSchema`, set by `toTanStackTool`) keyed by tool name. If a
 * tool carries no recorded schema (e.g. a non-reeboot tool), it is omitted, so
 * the strict policy leaves it untouched.
 */
export function collectReebootSchemas(tools: any[] | undefined): Record<string, JsonSchemaObject> {
  const out: Record<string, JsonSchemaObject> = {};
  for (const tool of tools ?? []) {
    const name = tool?.name as string | undefined;
    const schema = tool?.metadata?.reebotSchema;
    if (name && schema && typeof schema === 'object') {
      out[name] = schema as JsonSchemaObject;
    }
  }
  return out;
}

export class ReebootOpenAICompatibleAdapter extends OpenAICompatibleChatAdapter<string> {
  protected override mapOptionsToRequest(options: TextOptions): ChatCompletionCreateParamsStreaming {
    // Run the base conversion first (moves messages, system prompts, and tools).
    const request = super.mapOptionsToRequest(options) as any;

    if (Array.isArray(request.tools)) {
      const originalSchemas = collectReebootSchemas(options.tools);
      request.tools = rewriteToolsForStrictEmission(request.tools, originalSchemas);
    }

    return request;
  }
}

/**
 * Build a reeboot-owned OpenAI-compatible chat adapter for the given model,
 * baseURL, and apiKey. Replaces reeboot's raw `openaiCompatibleText(...)` call
 * for the custom / ollama / lmstudio provider branch so strict-mode tool
 * emission is corrected.
 */
export function createReebootOpenAICompatibleText(
  model: string,
  config: { baseURL: string; apiKey: string } & Record<string, unknown>,
): ReebootOpenAICompatibleAdapter {
  const { baseURL, apiKey, ...clientOptions } = config as any;
  const client = new OpenAI({ baseURL, apiKey, ...clientOptions });
  return new ReebootOpenAICompatibleAdapter(client, model, 'reeboot-openai-compatible');
}
