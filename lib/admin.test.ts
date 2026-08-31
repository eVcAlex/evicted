import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAdmin } from './admin';

describe('isAdmin', () => {
  const savedAllowlist = process.env.ADMIN_ALLOWLIST;

  afterEach(() => {
    if (savedAllowlist === undefined) delete process.env.ADMIN_ALLOWLIST;
    else process.env.ADMIN_ALLOWLIST = savedAllowlist;
  });

  it('accepts an allowlisted email', () => {
    process.env.ADMIN_ALLOWLIST = 'admin@example.com';
    expect(isAdmin({ email: 'admin@example.com' })).toBe(true);
  });

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    process.env.ADMIN_ALLOWLIST = 'admin@example.com';
    expect(isAdmin({ email: '  ADMIN@Example.com ' })).toBe(true);
  });

  it('matches any entry in a multi-value allowlist', () => {
    process.env.ADMIN_ALLOWLIST = 'a@x.com, b@y.com ,c@z.com';
    expect(isAdmin({ email: 'b@y.com' })).toBe(true);
  });

  it('rejects an email that is not on the list', () => {
    process.env.ADMIN_ALLOWLIST = 'admin@example.com';
    expect(isAdmin({ email: 'intruder@example.com' })).toBe(false);
  });

  it('rejects null / undefined claims', () => {
    process.env.ADMIN_ALLOWLIST = 'admin@example.com';
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });

  it('rejects claims with a missing or non-string email', () => {
    process.env.ADMIN_ALLOWLIST = 'admin@example.com';
    expect(isAdmin({})).toBe(false);
    expect(isAdmin({ email: 123 })).toBe(false);
  });

  it('warns when claims are a non-null object with no usable email, not for null', () => {
    process.env.ADMIN_ALLOWLIST = 'admin@example.com';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      isAdmin({});
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockClear();
      isAdmin(null);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('fails closed when ADMIN_ALLOWLIST is unset', () => {
    delete process.env.ADMIN_ALLOWLIST;
    expect(isAdmin({ email: 'admin@example.com' })).toBe(false);
  });
});
