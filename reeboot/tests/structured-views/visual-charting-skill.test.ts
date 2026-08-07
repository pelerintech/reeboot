import { describe, it, expect } from 'vitest';

describe('Visual charting skill', () => {
  it('visual-charting.md exists with prompt guidelines for render_chart, render_form, render_confirm', async () => {
    const fs = await import('fs');
    // Check the file exists and has guidelines
    const source = fs.readFileSync(
      new URL('../../skills/internal/visual-charting.md', import.meta.url),
      'utf-8'
    );
    expect(source).toContain('render_chart');
    expect(source).toContain('render_form');
    expect(source).toContain('render_confirm');
  });
});
