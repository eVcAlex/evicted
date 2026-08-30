import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkPin, isAdmin } from './admin';

const original = process.env.ADMIN_PIN;
const LONG_ENOUGH = 'correct-horse-battery-staple';

beforeEach(() => {
  process.env.ADMIN_PIN = LONG_ENOUGH;
});

afterEach(() => {
  process.env.ADMIN_PIN = original;
  vi.restoreAllMocks();
});

describe('checkPin', () => {
  it('accepts the configured pin', () => {
    expect(checkPin(LONG_ENOUGH)).toBe(true);
  });

  it('rejects a wrong pin', () => {
    expect(checkPin('wrong')).toBe(false);
  });

  it('rejects a missing pin', () => {
    expect(checkPin(null)).toBe(false);
  });

  it('rejects a pin of a different length', () => {
    expect(checkPin(`${LONG_ENOUGH}-extra`)).toBe(false);
  });

  it('rejects a wrong pin of the same length', () => {
    expect(checkPin('wrong-horse-battery-stapler.')).toBe(false);
  });

  it('rejects everything when no pin is configured', () => {
    delete process.env.ADMIN_PIN;
    expect(checkPin('anything')).toBe(false);
  });

  it('refuses to trust a configured secret shorter than sixteen characters', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.ADMIN_PIN = '1234';

    expect(checkPin('1234')).toBe(false);
    expect(logged).toHaveBeenCalledOnce();
  });

  it('accepts a secret of exactly sixteen characters', () => {
    process.env.ADMIN_PIN = 'sixteencharacter';
    expect(checkPin('sixteencharacter')).toBe(true);
  });
});

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

  it('fails closed when ADMIN_ALLOWLIST is unset', () => {
    delete process.env.ADMIN_ALLOWLIST;
    expect(isAdmin({ email: 'admin@example.com' })).toBe(false);
  });
});
