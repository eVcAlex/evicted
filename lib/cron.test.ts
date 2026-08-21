import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkCronSecret } from './cron';

const original = process.env.CRON_SECRET;
const SECRET = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
});

afterEach(() => {
  process.env.CRON_SECRET = original;
});

describe('checkCronSecret', () => {
  it('accepts the configured secret', () => {
    expect(checkCronSecret(SECRET)).toBe(true);
  });

  it('rejects a wrong secret', () => {
    expect(checkCronSecret('wrong')).toBe(false);
  });

  it('rejects a missing secret', () => {
    expect(checkCronSecret(null)).toBe(false);
  });

  it('rejects a secret of a different length', () => {
    expect(checkCronSecret(`${SECRET}-extra`)).toBe(false);
  });

  it('rejects everything when no secret is configured', () => {
    delete process.env.CRON_SECRET;
    expect(checkCronSecret('anything')).toBe(false);
  });
});
