import { describe, it, expect } from 'vitest';
import { extractViewFromToolResult } from '@src/structured-views.js';

describe('View propagation — tool result to RunnerEvent', () => {
  it('extractViewFromToolResult extracts view from wrapped result', () => {
    const result = {
      content: [{ type: 'text', text: 'done' }],
      view: { type: 'data-table' as const, columns: ['Name'], rows: [{ Name: 'Alice' }] },
    };
    const { content, view } = extractViewFromToolResult(result);
    expect(content).toEqual(result.content);
    expect(view).toEqual(result.view);
  });

  it('extractViewFromToolResult returns undefined view when absent', () => {
    const result = {
      content: [{ type: 'text', text: 'done' }],
    };
    const { content, view } = extractViewFromToolResult(result);
    expect(content).toEqual(result.content);
    expect(view).toBeUndefined();
  });

  it('extractViewFromToolResult handles string content', () => {
    const result = {
      content: 'plain text result',
    };
    const { content, view } = extractViewFromToolResult(result);
    expect(content).toBe('plain text result');
    expect(view).toBeUndefined();
  });
});
