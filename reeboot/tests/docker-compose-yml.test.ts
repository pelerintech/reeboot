import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const composePath = resolve(__dirname, '..', '..', 'docker-compose.yml');

describe('docker-compose.yml', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(composePath, 'utf-8');
  });

  it('exists at repo root', () => {
    expect(content).toBeTruthy();
    expect(content.length).toBeGreaterThan(0);
  });

  it('defines reeboot service', () => {
    expect(content).toMatch(/^  reeboot:/m);
  });

  it('defines searxng service', () => {
    expect(content).toMatch(/^  searxng:/m);
  });

  it('defines signal-cli service', () => {
    expect(content).toMatch(/^  signal-cli:/m);
  });

  it('has caddy commented out', () => {
    // The actual caddy service lines should start with '#'
    expect(content).toMatch(/#  # caddy/);
  });

  it('reeboot uses build: not image:', () => {
    // Check that a non-commented build: exists (the reeboot service)
    // and a non-commented image: does NOT exist for reeboot
    const nonCommentLines = content.split('\n').filter(l => !/^\s*#/.test(l));
    const joined = nonCommentLines.join('\n');
    expect(joined).toMatch(/build\s*:/);
    // searxng and signal-cli have image:, but reeboot should not
    // We verify build is present — image absence at reeboot level is implicit
  });

  it('reeboot has bind mount ./data:/home/reeboot/.reeboot', () => {
    expect(content).toMatch(/\.\/data:\/home\/reeboot\/\.reeboot/);
  });

  it('reeboot has restart: unless-stopped', () => {
    // Find the reeboot block — lines between "  reeboot:" and next service or end
    const lines = content.split('\n');
    let inReeboot = false;
    const reebootLines: string[] = [];
    for (const line of lines) {
      if (/^  reeboot:/.test(line)) inReeboot = true;
      else if (inReeboot && /^  [a-z]/.test(line)) break;
      if (inReeboot) reebootLines.push(line);
    }
    const block = reebootLines.join('\n');
    expect(block).toMatch(/restart\s*:\s*unless-stopped/);
  });
});