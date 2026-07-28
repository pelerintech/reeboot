import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { buildRecapView } from './helpers.js';

const FIXTURE_DIR = join(__dirname, 'fixtures', 'sample-request');

describe('/visual-recap output format', () => {
  it('recap output includes plan view with annotated-code and file-tree blocks from real tasks.md', () => {
    const result = buildRecapView(FIXTURE_DIR);

    // Must include text summary
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('Completed');
    expect(result.content[0].text).toContain('tasks');

    // Must include structured view with plan type
    expect(result.view.type).toBe('plan');
    expect(Array.isArray(result.view.blocks)).toBe(true);
    expect(result.view.blocks.length).toBeGreaterThan(0);

    // At least one annotated-code block
    const codeBlocks = result.view.blocks.filter(b => b.type === 'annotated-code');
    expect(codeBlocks.length).toBeGreaterThanOrEqual(1);
    expect(typeof codeBlocks[0].file).toBe('string');
    expect(codeBlocks[0].file.length).toBeGreaterThan(0);
    expect(Array.isArray(codeBlocks[0].annotations)).toBe(true);
    expect(codeBlocks[0].annotations.length).toBeGreaterThanOrEqual(1);

    // At least one file-tree block
    const fileTrees = result.view.blocks.filter(b => b.type === 'file-tree');
    expect(fileTrees.length).toBeGreaterThanOrEqual(1);
    expect(typeof fileTrees[0].paths).toBe('object');
    expect(Array.isArray(fileTrees[0].paths)).toBe(true);
    expect(fileTrees[0].paths.length).toBeGreaterThanOrEqual(1);
    expect(typeof fileTrees[0].paths[0].path).toBe('string');

    // Content should reference fixture data — includes completion count and file stats
    expect(result.content[0].text).toContain('Completed');
    expect(result.content[0].text).toMatch(/\d+\/\d+ tasks/);

    // Must have before/after file-tree blocks for diff representation
    const beforeTrees = result.view.blocks.filter(b => b.type === 'file-tree' && b.title === 'Before');
    const afterTrees = result.view.blocks.filter(b => b.type === 'file-tree' && b.title === 'After');
    expect(beforeTrees.length).toBeGreaterThanOrEqual(1);
    expect(afterTrees.length).toBeGreaterThanOrEqual(1);
  });
});
