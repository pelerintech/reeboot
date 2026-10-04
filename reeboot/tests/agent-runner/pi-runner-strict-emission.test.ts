import { describe, it, expect } from 'vitest';
import { convertResponsesTools } from '@earendil-works/pi-ai/api/openai-responses-shared';

// Reeboot's shared tool schemas, in pi's Tool shape (no constrainedSampling).
const sessionSearchTool = {
  name: 'session_search',
  description: 'search',
  parameters: {
    type: 'object' as const,
    properties: { query: { type: 'string' }, limit: { type: 'number' } },
    required: ['query'],
  },
};

const delegateTool = {
  name: 'delegate',
  description: 'delegate',
  parameters: {
    type: 'object' as const,
    properties: {
      task: { type: 'string' },
      peer: { type: 'string' },
      timeout: { type: 'number' },
    },
    required: ['task'],
  },
};

describe('pi mode strict emission not regressed (pi-strict-emission)', () => {
  it('session_search is emitted strict:false with the optional limit preserved', () => {
    const out = convertResponsesTools([sessionSearchTool as any]) as any[];
    const tool = out[0];
    expect(tool.strict).toBe(false);
    // Optional `limit` stays optional (not coerced into required, not null-widened).
    expect(tool.parameters.required).toEqual(['query']);
    expect(tool.parameters.properties.limit.type).toBe('number');
  });

  it('delegate is emitted strict:false with optional peer/timeout preserved', () => {
    const out = convertResponsesTools([delegateTool as any]) as any[];
    const tool = out[0];
    expect(tool.strict).toBe(false);
    expect(tool.parameters.required).toEqual(['task']);
    expect(tool.parameters.properties.peer.type).toBe('string');
    expect(tool.parameters.properties.timeout.type).toBe('number');
  });
});
