import { describe, expect, it } from 'vitest';
import type { Member } from '@/lib/league/members';
import { extractEligibleCredit, matchSender } from './matcher';

function member(entryId: number, managerName: string): Member {
  return { entryId, managerName, teamName: `${managerName}'s team`, joinedTime: null };
}

const members: Member[] = [
  member(1, 'Alex McGuiness'),
  member(2, 'Aidan McGuiness'),
  member(3, 'Joe Taylor'),
  member(4, 'Finn Taylor'),
];

describe('extractEligibleCredit', () => {
  const base = {
    id: 'tx_1',
    amount: 200,
    is_load: false,
    counterparty: { name: 'ALEXANDER MCGUINESS' },
  };

  it('accepts a plain £2 credit', () => {
    expect(extractEligibleCredit(base)).toEqual({
      txId: 'tx_1',
      amountPence: 200,
      counterpartyName: 'ALEXANDER MCGUINESS',
    });
  });

  it('accepts a multiple of the fine', () => {
    expect(extractEligibleCredit({ ...base, amount: 600 })?.amountPence).toBe(600);
  });

  it('rejects a top-up (is_load: true)', () => {
    expect(extractEligibleCredit({ ...base, is_load: true })).toBeNull();
  });

  it('rejects a declined transaction', () => {
    expect(extractEligibleCredit({ ...base, decline_reason: 'insufficient_funds' })).toBeNull();
  });

  it('rejects a debit', () => {
    expect(extractEligibleCredit({ ...base, amount: -200 })).toBeNull();
  });

  it('rejects an amount that is not a multiple of the fine', () => {
    expect(extractEligibleCredit({ ...base, amount: 250 })).toBeNull();
  });

  it('rejects a transaction with no counterparty name', () => {
    expect(extractEligibleCredit({ ...base, counterparty: null })).toBeNull();
  });

  it('rejects a payload that does not match the expected shape', () => {
    expect(extractEligibleCredit({ nonsense: true })).toBeNull();
  });
});

describe('matchSender', () => {
  it('matches on full name, case-insensitively', () => {
    expect(matchSender('ALEX MCGUINESS', members)).toEqual({ outcome: 'matched', member: members[0] });
  });

  it('distinguishes the two McGuinesses by full name', () => {
    expect(matchSender('Aidan McGuiness', members)).toEqual({
      outcome: 'matched',
      member: members[1],
    });
  });

  it('distinguishes the two Taylors by full name', () => {
    expect(matchSender('finn taylor', members)).toEqual({ outcome: 'matched', member: members[3] });
  });

  it('reports no-match for an unrecognised sender', () => {
    expect(matchSender('A Random Friend', members)).toEqual({ outcome: 'no-match' });
  });

  it('resolves a known bank-name alias to the registered manager name', () => {
    expect(matchSender('ALEXANDER MCGUINESS', members)).toEqual({
      outcome: 'matched',
      member: members[0],
    });
  });

  it('reports ambiguous when more than one member shares a normalised name', () => {
    const clashing = [...members, member(5, 'alex   mcguiness')];
    expect(matchSender('Alex McGuiness', clashing)).toEqual({
      outcome: 'ambiguous',
      members: [members[0], clashing[4]],
    });
  });

  it('prefers an admin-approved alias over name matching entirely', () => {
    // A sender name that wouldn't otherwise match anyone still resolves once
    // an admin has approved it once via the pending queue.
    expect(matchSender('A Random Friend', members, 3)).toEqual({
      outcome: 'matched',
      member: members[2],
    });
  });

  it('falls back to ordinary matching when the aliased member has left the league', () => {
    expect(matchSender('Aidan McGuiness', members, 999)).toEqual({
      outcome: 'matched',
      member: members[1],
    });
  });
});
