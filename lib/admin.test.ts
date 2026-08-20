import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkPin } from './admin';

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
