import { describe, expect, it } from 'vitest';
import { ADMIN_ENTRY, FINE_PENCE, LEAGUE_ID } from './config';

describe('config', () => {
  it('points at the Evicted league', () => {
    expect(LEAGUE_ID).toBe(79294);
  });

  it('knows the admin entry', () => {
    expect(ADMIN_ENTRY).toBe(394534);
  });

  it('sets the fine at two pounds in pence', () => {
    expect(FINE_PENCE).toBe(200);
  });
});
