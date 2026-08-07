/**
 * computeActiveSkillPaths helper tests.
 *
 * The paths handed to the SDK (pi's `additionalSkillPaths`) must be only
 * enabled user skills + internal skills — never the whole catalog dir, and
 * never disabled user skills.
 */
import { describe, it, expect } from 'vitest';
import { computeActiveSkillPaths } from '../src/skills/paths.js';

const CATALOG: Record<string, string> = {
  // enabled user skills
  'github': '/c/github',
  'gmail': '/c/gmail',
  'notion': '/c/notion',
  // disabled user skills (still in the full catalog)
  'slack': '/c/slack',
  'docker': '/c/docker',
  // internal skills
  'web-research': '/c/internal/web-research',
  'send-message': '/c/internal/send-message',
};

describe('computeActiveSkillPaths', () => {
  it('includes internal + enabled user skills and excludes disabled user skills', () => {
    const enabled = ['github', 'gmail'];
    const internal = ['web-research', 'send-message'];
    const paths = computeActiveSkillPaths(enabled, internal, CATALOG);
    expect(paths).toContain('/c/github');
    expect(paths).toContain('/c/gmail');
    expect(paths).toContain('/c/internal/web-research');
    expect(paths).toContain('/c/internal/send-message');
    expect(paths).not.toContain('/c/slack');
    expect(paths).not.toContain('/c/docker');
  });

  it('never returns the whole catalog passthrough', () => {
    const paths = computeActiveSkillPaths([], [], CATALOG);
    // Must not be the full catalog dir or every skill dir.
    expect(paths).toHaveLength(0);
  });

  it('dedupes a skill listed in both enabled and internal', () => {
    const paths = computeActiveSkillPaths(['web-research'], ['web-research'], CATALOG);
    expect(paths.filter((p) => p === '/c/internal/web-research')).toHaveLength(1);
  });
});
