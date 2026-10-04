import { describe, it, expect } from 'vitest';

// The reeboot-owned strict-emission policy helper from the ree integration layer.
// It rewrites emitted OpenAI Chat-Completions tools so that a tool whose original
// reeboot schema has a genuinely-optional param is emitted strict:false (schema
// passed through), while an all-required tool stays strict:true.
import {
  rewriteToolsForStrictEmission,
  isSchemaStrictCompatible,
} from '../../src/runtime/ree-tool-emission.js';

describe('ree tool-emission strict policy (strict-emission)', () => {
  it('isSchemaStrictCompatible: a schema with an optional (non-required) prop is NOT strict-compatible', () => {
    const schema = {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' }, // optional (not in required)
      },
      required: ['query'],
    };
    expect(isSchemaStrictCompatible(schema)).toBe(false);
  });

  it('isSchemaStrictCompatible: an all-required schema IS strict-compatible', () => {
    const schema = {
      type: 'object',
      properties: { key: { type: 'string' }, value: { type: 'string' } },
      required: ['key', 'value'],
    };
    expect(isSchemaStrictCompatible(schema)).toBe(true);
  });

  it('rewrites an optional-param tool to strict:false preserving the optional param', () => {
    // The tool after TanStack's base conversion (limit coerced into required).
    const emitted = [
      {
        type: 'function',
        function: {
          name: 'session_search',
          parameters: {
            type: 'object',
            properties: { query: { type: 'string' }, limit: { type: ['number', 'null'] } },
            required: ['query', 'limit'],
            additionalProperties: false,
          },
          strict: true,
        },
      },
    ];
    // Original reeboot schema: limit is optional.
    const original = {
      'session_search': {
        type: 'object',
        properties: { query: { type: 'string' }, limit: { type: 'number' } },
        required: ['query'],
      },
    };
    const result = rewriteToolsForStrictEmission(emitted as any, original as any);

    const tool = result[0];
    expect(tool.function.strict).toBe(false);
    // Optional prop stays optional (not in required, not null-widened).
    expect(tool.function.parameters.required).toEqual(['query']);
    expect(tool.function.parameters.properties.limit.type).toBe('number');
  });

  it('keeps an all-required tool strict:true', () => {
    const emitted = [
      {
        type: 'function',
        function: {
          name: 'set_field',
          parameters: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' } }, required: ['key', 'value'], additionalProperties: false },
          strict: true,
        },
      },
    ];
    const original = {
      'set_field': {
        type: 'object',
        properties: { key: { type: 'string' }, value: { type: 'string' } },
        required: ['key', 'value'],
      },
    };
    const result = rewriteToolsForStrictEmission(emitted as any, original as any);
    expect(result[0].function.strict).toBe(true);
  });

  it('leaves a tool with no recorded original schema untouched', () => {
    const emitted = [
      { type: 'function', function: { name: 'mystery', parameters: { type: 'object', properties: {}, required: [] }, strict: true } },
    ];
    const result = rewriteToolsForStrictEmission(emitted as any, {} as any);
    expect(result[0].function.strict).toBe(true);
  });
});
