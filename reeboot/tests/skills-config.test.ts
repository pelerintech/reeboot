/**
 * Skills config schema tests — remote catalog address + path.
 *
 * Task 3 (bundle-lean-catalog): `skills.catalog_url` is the operator-configurable
 * remote catalog address (default '' = none configured) and
 * `remote_catalog_path` overrides the default remote catalog root
 * (default '' = ~/.reeboot/skills-remote).
 */
import { describe, it, expect } from 'vitest';
import { ConfigSchema } from '../src/config.js';

describe('skills config — catalog_url + remote_catalog_path', () => {
  it('defaults catalog_url and remote_catalog_path to empty string', () => {
    const config = ConfigSchema.parse({});
    expect((config.skills as any).catalog_url).toBe('');
    expect((config.skills as any).remote_catalog_path).toBe('');
  });

  it('accepts catalog_url and remote_catalog_path when set', () => {
    const config = ConfigSchema.parse({
      skills: {
        catalog_url: 'https://raw.githubusercontent.com/pelerintech/reeboot-catalog/main/index.json',
        remote_catalog_path: '/tmp/remote-root',
      },
    });
    expect((config.skills as any).catalog_url).toBe(
      'https://raw.githubusercontent.com/pelerintech/reeboot-catalog/main/index.json'
    );
    expect((config.skills as any).remote_catalog_path).toBe('/tmp/remote-root');
  });

  it('preserves existing skills fields', () => {
    const config = ConfigSchema.parse({
      skills: { permanent: ['github'], catalog_path: '/tmp/uploads' },
    });
    expect((config.skills as any).permanent).toEqual(['github']);
    expect((config.skills as any).catalog_path).toBe('/tmp/uploads');
    expect((config.skills as any).catalog_url).toBe('');
  });
});
