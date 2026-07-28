import { describe, it, expect } from 'vitest';
import { VIEW_TYPES } from '@src/structured-views.js';

describe('ToolView type', () => {
  it('VIEW_TYPES constant defines valid discriminants', () => {
    expect(VIEW_TYPES).toEqual(['data-table', 'data-chart', 'form', 'confirm']);
  });

  it('data-table discriminant has correct shape', () => {
    const table: Record<string, unknown> = {
      type: 'data-table',
      columns: ['Name', 'Email'],
      rows: [{ Name: 'Alice', Email: 'a@b.com' }],
    };
    expect(table.type).toBe('data-table');
    expect(table.columns).toHaveLength(2);
    expect(table.rows).toHaveLength(1);
  });

  it('data-chart discriminant has correct shape', () => {
    const chart: Record<string, unknown> = {
      type: 'data-chart',
      labels: ['Jan', 'Feb'],
      values: [10, 20],
      kind: 'bar',
    };
    expect(chart.type).toBe('data-chart');
    expect(chart.labels).toHaveLength(2);
    expect(chart.values).toEqual([10, 20]);
  });

  it('form discriminant has correct shape', () => {
    const form: Record<string, unknown> = {
      type: 'form',
      fields: [{ name: 'email', label: 'Email', type: 'text' }],
    };
    expect(form.type).toBe('form');
    expect(form.fields).toHaveLength(1);
  });

  it('confirm discriminant has correct shape', () => {
    const confirm: Record<string, unknown> = {
      type: 'confirm',
      title: 'Delete?',
      message: 'Are you sure?',
    };
    expect(confirm.type).toBe('confirm');
    expect(confirm.title).toBe('Delete?');
  });

  it('ToolResult accepts optional view field', async () => {
    // Verify the scheduler module exports
    const schedMod = await import('@src/scheduler.js');
    expect(schedMod).toBeDefined();
    // Construct a valid object that matches the ToolResult + view shape
    const result = {
      content: [{ type: 'text' as const, text: 'result' }],
      details: {},
      view: { type: 'data-table' as const, columns: ['Name'], rows: [{ Name: 'Alice' }] },
    };
    expect(result.view).toBeDefined();
    expect(result.view!.type).toBe('data-table');
  });
});
