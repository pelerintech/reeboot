import { describe, it, expect } from 'vitest';

describe('Visual planning skill', () => {
  it('visual-planning.md references render_plan tool instead of raw JSON output', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(
      new URL('../../skills/internal/visual-planning.md', import.meta.url),
      'utf-8'
    );
    // The skill should instruct LLM to call render_plan tool
    // (currently references raw JSON output which is the old approach)
    expect(source).toContain('render_plan');
  });
});
