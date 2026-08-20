import { describe, expect, it } from 'vitest';
import bootstrapFixture from './fixtures/bootstrap.json';
import historyFixture from './fixtures/history.json';
import standingsFixture from './fixtures/standings.json';
import { bootstrapSchema, entryHistorySchema, leagueStandingsSchema } from './schemas';

describe('bootstrapSchema', () => {
  it('parses the recorded bootstrap fixture', () => {
    const parsed = bootstrapSchema.parse(bootstrapFixture);
    expect(parsed.events).toHaveLength(38);
  });

  it('exposes the flags that decide whether a gameweek is settled', () => {
    const parsed = bootstrapSchema.parse(bootstrapFixture);
    const first = parsed.events[0];
    expect(typeof first.finished).toBe('boolean');
    expect(typeof first.data_checked).toBe('boolean');
    expect(typeof first.deadline_time).toBe('string');
  });
});

describe('leagueStandingsSchema', () => {
  it('parses the recorded standings fixture', () => {
    const parsed = leagueStandingsSchema.parse(standingsFixture);
    expect(parsed.league.id).toBe(79294);
  });

  it('keeps both member arrays, either of which may be empty', () => {
    const parsed = leagueStandingsSchema.parse(standingsFixture);
    const total = parsed.standings.results.length + parsed.new_entries.results.length;
    expect(total).toBe(7);
  });
});

describe('entryHistorySchema', () => {
  it('parses the recorded history fixture', () => {
    const parsed = entryHistorySchema.parse(historyFixture);
    expect(Array.isArray(parsed.current)).toBe(true);
  });

  it('tolerates an empty current array before the season starts', () => {
    const parsed = entryHistorySchema.parse({ current: [] });
    expect(parsed.current).toEqual([]);
  });
});
