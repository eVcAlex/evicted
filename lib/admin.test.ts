import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkPin } from './admin';

const original = process.env.ADMIN_PIN;

beforeEach(() => {
  process.env.ADMIN_PIN = 'correct-horse';
});

afterEach(() => {
  process.env.ADMIN_PIN = original;
});

describe('checkPin', () => {
  it('accepts the configured pin', () => {
    expect(checkPin('correct-horse')).toBe(true);
  });

  it('rejects a wrong pin', () => {
    expect(checkPin('wrong')).toBe(false);
  });

  it('rejects a missing pin', () => {
    expect(checkPin(null)).toBe(false);
  });

  it('rejects a pin of a different length', () => {
    expect(checkPin('correct-horse-battery')).toBe(false);
  });

  it('rejects a wrong pin of the same length', () => {
    expect(checkPin('wrong-horse-x')).toBe(false);
  });

  it('rejects everything when no pin is configured', () => {
    delete process.env.ADMIN_PIN;
    expect(checkPin('anything')).toBe(false);
  });
});
