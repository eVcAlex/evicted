import { describe, expect, it } from 'vitest';
import type { DraftLeagueMeta } from './schemas';
import { isDraftLive } from './status';

function league(drafts: DraftLeagueMeta['drafts']): DraftLeagueMeta {
  return {
    id: 77196,
    name: 'Evicted',
    draft_status: 'pre',
    draft_dt: '2026-08-21T11:00:00Z',
    closed: true,
    scoring: 'h',
    start_event: 1,
    stop_event: 38,
    drafts,
  };
}

describe('isDraftLive', () => {
  it('is false before any draft has been scheduled', () => {
    expect(isDraftLive(league([]))).toBe(false);
  });

  it('is false while a scheduled draft has not completed', () => {
    expect(isDraftLive(league([{ draft_completed: null }]))).toBe(false);
  });

  it('is true once a draft has completed, even though draft_status is still "pre"', () => {
    expect(
      isDraftLive(league([{ draft_completed: '2026-08-21T11:23:22.672585Z' }])),
    ).toBe(true);
  });

  it('is true if any prior draft completed (renewed league)', () => {
    expect(
      isDraftLive(
        league([
          { draft_completed: '2025-08-01T10:00:00Z' },
          { draft_completed: null },
        ]),
      ),
    ).toBe(true);
  });
});
