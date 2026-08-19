import { z } from 'zod';

export const gameweekEventSchema = z.object({
  id: z.number(),
  name: z.string(),
  deadline_time: z.string(),
  finished: z.boolean(),
  data_checked: z.boolean(),
  is_current: z.boolean(),
  is_next: z.boolean(),
  is_previous: z.boolean(),
});

export const bootstrapSchema = z.object({
  events: z.array(gameweekEventSchema),
});

/** A member who has played at least one scored gameweek. */
export const standingsRowSchema = z.object({
  entry: z.number(),
  entry_name: z.string(),
  player_name: z.string(),
});

/**
 * A member who has joined but not yet played a scored gameweek. Before the
 * league's first scored gameweek every member appears here instead, and the
 * name is split across two fields rather than one.
 */
export const newEntryRowSchema = z.object({
  entry: z.number(),
  entry_name: z.string(),
  player_first_name: z.string(),
  player_last_name: z.string(),
});

export const leagueStandingsSchema = z.object({
  league: z.object({
    id: z.number(),
    name: z.string(),
    start_event: z.number(),
  }),
  standings: z.object({
    results: z.array(standingsRowSchema),
  }),
  new_entries: z.object({
    results: z.array(newEntryRowSchema),
  }),
});

export const gameweekEntrySchema = z.object({
  event: z.number(),
  points: z.number(),
  event_transfers_cost: z.number(),
  total_points: z.number(),
  points_on_bench: z.number(),
});

export const entryHistorySchema = z.object({
  current: z.array(gameweekEntrySchema),
});

export type GameweekEvent = z.infer<typeof gameweekEventSchema>;
export type Bootstrap = z.infer<typeof bootstrapSchema>;
export type StandingsRow = z.infer<typeof standingsRowSchema>;
export type NewEntryRow = z.infer<typeof newEntryRowSchema>;
export type LeagueStandings = z.infer<typeof leagueStandingsSchema>;
export type GameweekEntry = z.infer<typeof gameweekEntrySchema>;
export type EntryHistory = z.infer<typeof entryHistorySchema>;
