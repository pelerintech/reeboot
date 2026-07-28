import { describe, it, expect } from 'vitest';
import { VIEW_TYPES } from '@src/structured-views.js';

describe('Loader includes view tools', () => {
  it('VIEW_TYPES includes all five view types', () => {
    expect(VIEW_TYPES).toContain('data-table');
    expect(VIEW_TYPES).toContain('data-chart');
    expect(VIEW_TYPES).toContain('form');
    expect(VIEW_TYPES).toContain('confirm');
    expect(VIEW_TYPES).toContain('plan');
  });

  it('getBundledFactories includes all four render view extensions', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(
      new URL('../../src/extensions/loader.ts', import.meta.url),
      'utf-8'
    );

    expect(source).toContain("render-chart");
    expect(source).toContain("render-plan");
    expect(source).toContain("render-confirm");
    expect(source).toContain("render-form");
    expect(source).toContain("render_views");
  });
});
