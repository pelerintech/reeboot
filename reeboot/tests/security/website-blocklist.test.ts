import { describe, it, expect } from 'vitest';
import { isDomainBlocked } from '@src/security/website-blocklist.js';

describe('website blocklist', () => {
  it('blocks exact domain match', () => {
    expect(isDomainBlocked('evil.com', { enabled: true, domains: ['evil.com'] })).toBe(true);
  });

  it('blocks wildcard domain match (single subdomain)', () => {
    expect(isDomainBlocked('sub.example.com', { enabled: true, domains: ['*.example.com'] })).toBe(true);
  });

  it('blocks deep nested wildcard domain', () => {
    expect(isDomainBlocked('deep.nested.sub.company.com', { enabled: true, domains: ['*.company.com'] })).toBe(true);
  });

  it('allows non-matching domains', () => {
    expect(isDomainBlocked('safe-site.com', { enabled: true, domains: ['evil.com'] })).toBe(false);
  });

  it('allows domain that does not match wildcard', () => {
    expect(isDomainBlocked('not-evil.com', { enabled: true, domains: ['*.evil.com'] })).toBe(false);
  });

  it('no-op when disabled', () => {
    expect(isDomainBlocked('evil.com', { enabled: false, domains: ['evil.com'] })).toBe(false);
  });

  it('case-insensitive domain matching', () => {
    expect(isDomainBlocked('EVIL.COM', { enabled: true, domains: ['evil.com'] })).toBe(true);
  });

  it('case-insensitive blocklist entry', () => {
    expect(isDomainBlocked('evil.com', { enabled: true, domains: ['Evil.COM'] })).toBe(true);
  });

  it('empty blocklist allows everything', () => {
    expect(isDomainBlocked('evil.com', { enabled: true, domains: [] })).toBe(false);
  });

  it('does not block partial domain matches', () => {
    // 'myevil.com' should not match blocklist entry 'evil.com'
    expect(isDomainBlocked('myevil.com', { enabled: true, domains: ['evil.com'] })).toBe(false);
  });

  it('wildcard blocks parent domain too', () => {
    // '*.example.com' should also match 'example.com' itself
    // per design: wildcards match the domain and all subdomains
    expect(isDomainBlocked('example.com', { enabled: true, domains: ['*.example.com'] })).toBe(true);
  });
});