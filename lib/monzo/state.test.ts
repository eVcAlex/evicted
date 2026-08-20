import { describe, expect, it } from 'vitest';
import { verifyState } from './state';

describe('verifyState', () => {
  it('accepts a matching state', () => {
    expect(verifyState('abc123', 'abc123')).toBe(true);
  });

  it('rejects a mismatched state', () => {
    expect(verifyState('abc123', 'xyz789')).toBe(false);
  });

  it('rejects when the cookie is missing (state never set, or expired)', () => {
    expect(verifyState(undefined, 'abc123')).toBe(false);
  });

  it('rejects when Monzo returns no state', () => {
    expect(verifyState('abc123', null)).toBe(false);
  });

  it('rejects a same-length forged state rather than throwing', () => {
    // timingSafeEqual throws on mismatched buffer lengths; same-length
    // inputs are the case that actually exercises the comparison.
    expect(verifyState('aaaaaa', 'bbbbbb')).toBe(false);
  });
});
