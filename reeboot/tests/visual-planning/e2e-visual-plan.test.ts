import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { buildPlanView } from './helpers.js';

const FIXTURE_DIR = join(__dirname, 'fixtures', 'sample-request');

describe('/visual-plan output format', () => {
  it('produces plan view with diagram, decision, and annotated-code blocks from real reespec files', () => {
    const result = buildPlanView(FIXTURE_DIR);

    // Must include text content for non-WebChat channels
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text.length).toBeGreaterThan(0);

    // Must include structured view with plan type and blocks
    expect(result.view.type).toBe('plan');
    expect(Array.isArray(result.view.blocks)).toBe(true);
    expect(result.view.blocks.length).toBeGreaterThan(0);

    // At least one diagram block with nodes and edges
    const diagrams = result.view.blocks.filter(b => b.type === 'diagram');
    expect(diagrams.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(diagrams[0].nodes)).toBe(true);
    expect(diagrams[0].nodes.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(diagrams[0].edges)).toBe(true);

    // At least one decision block with title, chosen, and rationale
    const decisions = result.view.blocks.filter(b => b.type === 'decision');
    expect(decisions.length).toBeGreaterThanOrEqual(1);
    expect(typeof decisions[0].title).toBe('string');
    expect(decisions[0].title.length).toBeGreaterThan(0);
    expect(typeof decisions[0].chosen).toBe('string');
    expect(decisions[0].chosen.length).toBeGreaterThan(0);
    expect(typeof decisions[0].rationale).toBe('string');
    expect(decisions[0].rationale.length).toBeGreaterThan(0);

    // At least one annotated-code block with file and annotations
    const codeBlocks = result.view.blocks.filter(b => b.type === 'annotated-code');
    expect(codeBlocks.length).toBeGreaterThanOrEqual(1);
    expect(typeof codeBlocks[0].file).toBe('string');
    expect(codeBlocks[0].file.length).toBeGreaterThan(0);
    expect(Array.isArray(codeBlocks[0].annotations)).toBe(true);
    expect(codeBlocks[0].annotations.length).toBeGreaterThanOrEqual(1);

    // Content should reference fixture data
    expect(result.content[0].text).toContain('Architecture');
  });

  it('plan view type is a recognized discriminant in VIEW_TYPES', async () => {
    const { VIEW_TYPES } = await import('@src/structured-views.js');
    // 'plan' is now a first-class view type
    expect(VIEW_TYPES).toContain('plan');
  });
});
