import { describe, it, expect } from 'vitest';
import { extractContentText } from '@src/structured-views.js';

describe('extractContentText — content fallback extraction', () => {
  it('extracts a plain string content (render_* tool shape)', () => {
    const result = {
      content: 'Chart: 2 data points\nLabels: Jan, Feb',
      view: { type: 'data-chart', labels: ['Jan', 'Feb'], values: [10, 20], kind: 'bar' },
    };
    expect(extractContentText(result)).toBe('Chart: 2 data points\nLabels: Jan, Feb');
  });

  it('extracts text from array-of-blocks content (pi SDK normalised shape)', () => {
    const result = {
      content: [
        { type: 'text', text: 'Plan with 1 block' },
        { type: 'text', text: 'Types: diagram' },
      ],
      view: { type: 'plan', blocks: [{ type: 'diagram' }] },
    };
    expect(extractContentText(result)).toBe('Plan with 1 block\nTypes: diagram');
  });

  it('extracts from a bare string result', () => {
    expect(extractContentText('Please provide: name (text)')).toBe('Please provide: name (text)');
  });

  it('extracts from a bare array of text blocks', () => {
    const result = [{ type: 'text', text: 'Cancel order #123?' }];
    expect(extractContentText(result)).toBe('Cancel order #123?');
  });

  it('ignores non-text blocks in an array', () => {
    const result = {
      content: [
        { type: 'image', imageData: 'base64...' },
        { type: 'text', text: 'only this text' },
      ],
    };
    expect(extractContentText(result)).toBe('only this text');
  });

  it('returns null for empty string content', () => {
    expect(extractContentText({ content: '' })).toBeNull();
  });

  it('returns null for an array with no text blocks', () => {
    expect(extractContentText({ content: [{ type: 'image', imageData: 'x' }] })).toBeNull();
  });

  it('returns null for null/undefined result', () => {
    expect(extractContentText(null)).toBeNull();
    expect(extractContentText(undefined)).toBeNull();
  });

  it('returns null for a result with no content field', () => {
    expect(extractContentText({ view: { type: 'plan' } })).toBeNull();
  });
});
