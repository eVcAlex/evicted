import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadDraftHistories } from './histories';
import * as client from './client';
import type { DraftMember } from './members';

afterEach(() => {
  vi.restoreAllMocks();
});

function member(overrides: Partial<DraftMember> = {}): DraftMember {
  return {
    entryId: 1,
    teamId: 100,
    managerName: 'Alex McGuiness',
    teamName: "Alex's Team",
    shortName: 'AM',
    joinedTime: '2026-08-01T12:00:00Z',
    ...overrides,
  };
}

describe('loadDraftHistories', () => {
  it('fetches by teamId but keys the result map by entryId', async () => {
    vi.spyOn(client, 'fetchDraftEntryHistory').mockResolvedValue({ history: [] });

    const histories = await loadDraftHistories([member({ entryId: 7, teamId: 700 })], 60);

    expect(client.fetchDraftEntryHistory).toHaveBeenCalledWith(700, 60);
    expect(histories.has(7)).toBe(true);
  });

  it('skips a member with no teamId (unclaimed slot)', async () => {
    const spy = vi.spyOn(client, 'fetchDraftEntryHistory').mockResolvedValue({ history: [] });

    const histories = await loadDraftHistories([member({ entryId: 9, teamId: null })], 60);

    expect(spy).not.toHaveBeenCalled();
    expect(histories.size).toBe(0);
  });
});
