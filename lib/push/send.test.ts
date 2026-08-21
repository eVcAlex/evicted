import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Member } from '@/lib/league/members';
import type { NewlyRecordedGameweek } from '@/lib/league/record';

const sendNotification = vi.fn();
const getSubscriptions = vi.fn();
const removeSubscription = vi.fn();
const saveSubscription = vi.fn();

vi.mock('web-push', () => ({
  default: {
    sendNotification,
    setVapidDetails: vi.fn(),
  },
  WebPushError: class WebPushError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

vi.mock('./store', () => ({ getSubscriptions, removeSubscription, saveSubscription }));

vi.mock('@/lib/config', () => ({
  VAPID_PUBLIC_KEY: 'public-key',
  VAPID_PRIVATE_KEY: 'private-key',
  VAPID_SUBJECT: 'mailto:test@example.com',
}));

const { buildNotifications, notifyLosers } = await import('./send');
const { WebPushError } = await import('web-push');

function member(entryId: number, teamName: string): Member {
  return { entryId, teamName, managerName: `Manager ${entryId}`, joinedTime: null };
}

function newlyRecorded(overrides: Partial<NewlyRecordedGameweek> = {}): NewlyRecordedGameweek {
  return {
    summary: {
      gameweek: 4,
      provisional: false,
      losers: [
        {
          member: member(1, 'Borussia Teeth'),
          score: { entryId: 1, gross: 40, net: 28, hits: 12, bench: 4 },
        },
      ],
      allTied: false,
      runnerUpNet: 32,
    },
    previousLosses: new Map(),
    ...overrides,
  };
}

const subscription = {
  endpoint: 'https://push.example.com/abc',
  keys: { p256dh: 'p256dh', auth: 'auth' },
};

beforeEach(() => {
  vi.clearAllMocks();
  removeSubscription.mockResolvedValue(undefined);
});

describe('buildNotifications', () => {
  it('builds one notification per loser, reusing the same quip logic as the card', () => {
    const notifications = buildNotifications([newlyRecorded()]);

    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toBe('Evicted: Borussia Teeth');
    expect(notifications[0].body.length).toBeGreaterThan(0);
  });

  it('builds one notification per loser when the gameweek is tied', () => {
    const tied = newlyRecorded({
      summary: {
        gameweek: 4,
        provisional: false,
        allTied: false,
        runnerUpNet: null,
        losers: [
          { member: member(1, 'Team A'), score: { entryId: 1, gross: 0, net: 0, hits: 0, bench: 0 } },
          { member: member(2, 'Team B'), score: { entryId: 2, gross: 0, net: 0, hits: 0, bench: 0 } },
        ],
      },
    });

    expect(buildNotifications([tied])).toHaveLength(2);
  });
});

describe('notifyLosers', () => {
  it('sends to every subscription for every notification', async () => {
    getSubscriptions.mockResolvedValue([subscription]);
    sendNotification.mockResolvedValue(undefined);

    await notifyLosers([newlyRecorded()]);

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification.mock.calls[0][0]).toEqual(subscription);
  });

  it('prunes a subscription that has gone (410) instead of leaving it to fail forever', async () => {
    getSubscriptions.mockResolvedValue([subscription]);
    sendNotification.mockRejectedValue(new WebPushError('gone', 410, {}, '', subscription.endpoint));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await notifyLosers([newlyRecorded()]);

    expect(removeSubscription).toHaveBeenCalledWith(subscription.endpoint);
    logged.mockRestore();
  });

  it('does not blow up the whole batch when one subscription fails for another reason', async () => {
    const other = { ...subscription, endpoint: 'https://push.example.com/other' };
    getSubscriptions.mockResolvedValue([subscription, other]);
    sendNotification.mockRejectedValueOnce(new Error('network blip')).mockResolvedValueOnce(undefined);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await notifyLosers([newlyRecorded()]);

    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(removeSubscription).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  it('does nothing when nothing was newly recorded', async () => {
    await notifyLosers([]);
    expect(getSubscriptions).not.toHaveBeenCalled();
  });
});
