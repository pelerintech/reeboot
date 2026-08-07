/**
 * EnabledSkillsStore tests (SDK-agnostic).
 *
 * Covers persistence across restarts, live reads between instances, and the
 * config.skills.permanent default when no state file exists yet.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { EnabledSkillsStore } from '../src/skills/enabled-store.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'reeboot-skills-store-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function statePath() {
  return join(dir, 'skills-state.json');
}

describe('EnabledSkillsStore', () => {
  it('defaults to empty when no config and no state file', () => {
    const store = new EnabledSkillsStore(statePath(), {});
    expect(store.getEnabled()).toEqual([]);
  });

  it('defaults from config.skills.permanent until a state file exists', () => {
    const store = new EnabledSkillsStore(statePath(), { skills: { permanent: ['github', 'gmail'] } });
    expect(store.getEnabled().sort()).toEqual(['gmail', 'github'].sort());
  });

  it('setEnabled persists and reconstructing restores the same set', () => {
    let store = new EnabledSkillsStore(statePath(), {});
    store.setEnabled('github', true);
    store.setEnabled('gmail', false);
    // Reconstruct a fresh instance from the same file
    store = new EnabledSkillsStore(statePath(), {});
    expect(store.getEnabled()).toEqual(['github']);
  });

  it('a store instance sees a change written by another instance (live read)', () => {
    const a = new EnabledSkillsStore(statePath(), {});
    const b = new EnabledSkillsStore(statePath(), {});
    a.setEnabled('docker', true);
    // b observes a's change without being told about it
    expect(b.getEnabled()).toEqual(['docker']);
  });

  it('persists to ~/.reeboot-style skills-state.json on disk', () => {
    const store = new EnabledSkillsStore(statePath(), {});
    store.setEnabled('sqlite', true);
    expect(existsSync(statePath())).toBe(true);
    const raw = JSON.parse(readFileSync(statePath(), 'utf-8'));
    expect(raw.enabled).toEqual(['sqlite']);
  });
});
