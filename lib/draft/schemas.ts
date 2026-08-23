import { z } from 'zod';

/**
 * Draft's bootstrap event shape has no `data_checked` and no `is_current`/
 * `is_next` flags — those live on `events.current`/`events.next` instead
 * (see `draftBootstrapSchema`). `average_entry_score` is null until FPL's
 * post-gameweek aggregation job runs, which is the closest thing draft has
 * to a "fully settled" signal — see `lib/draft/gameweeks.ts`.
 */
export const draftEventSchema = z.object({
  id: z.number(),
  name: z.string(),
  deadline_time: z.string(),
  finished: z.boolean(),
  average_entry_score: z.number().nullable(),
  highest_scoring_entry: z.number().nullable(),
});

export const draftBootstrapSchema = z.object({
  events: z.object({
    current: z.number().nullable(),
    next: z.number().nullable(),
    data: z.array(draftEventSchema),
  }),
});

/** A cheap poll target — a few hundred bytes versus bootstrap's ~1MB. */
export const draftGameSchema = z.object({
  current_event: z.number().nullable(),
  current_event_finished: z.boolean(),
  next_event: z.number().nullable(),
});

/**
 * `id` is the stable member key — it's what `matches[]`/`standings[]`
 * reference. `entry_id` is the *team* id, only used to build
 * `/entry/{entry_id}/history` URLs, and can be null for an unclaimed slot —
 * the live API pairs that with null `entry_name`/`player_first_name`/
 * `player_last_name` too (e.g. the synthetic "AVERAGE" entry every league
 * gets once the draft completes). Mixing `id` and `entry_id` up silently
 * mis-keys everything downstream.
 */
export const leagueEntrySchema = z.object({
  id: z.number(),
  entry_id: z.number().nullable(),
  entry_name: z.string().nullable(),
  player_first_name: z.string().nullable(),
  player_last_name: z.string().nullable(),
  short_name: z.string(),
  joined_time: z.string(),
});

export const draftLeagueMetaSchema = z.object({
  id: z.number(),
  name: z.string(),
  draft_status: z.enum(['pre', 'post']),
  draft_dt: z.string().nullable(),
  closed: z.boolean(),
  scoring: z.enum(['h', 'c']),
  start_event: z.number(),
  stop_event: z.number(),
});

/**
 * `league_entry` matches `league_entries[].id` (the stable member key), not
 * `entry_id`/`teamId`. `rank` is null until the API has settled at least one
 * match, so every row is tied at rank `null` for the whole preseason.
 */
export const draftStandingSchema = z.object({
  league_entry: z.number(),
  rank: z.number().nullable(),
  matches_won: z.number(),
  matches_drawn: z.number(),
  matches_lost: z.number(),
  points_for: z.number(),
  points_against: z.number(),
  total: z.number(),
});

export const draftLeagueDetailsSchema = z.object({
  league: draftLeagueMetaSchema,
  league_entries: z.array(leagueEntrySchema),
  standings: z.array(draftStandingSchema),
});

/**
 * `points_on_bench` is present (bench quips survive); there is no
 * `event_transfers_cost` — draft has no transfer-hit concept, so
 * `net === gross` always. `event_transfers` is a count, quip fodder only.
 */
export const draftHistoryRowSchema = z.object({
  event: z.number(),
  points: z.number(),
  total_points: z.number(),
  points_on_bench: z.number(),
  event_transfers: z.number(),
});

export const draftEntryHistorySchema = z.object({
  history: z.array(draftHistoryRowSchema),
});

export type DraftEvent = z.infer<typeof draftEventSchema>;
export type DraftBootstrap = z.infer<typeof draftBootstrapSchema>;
export type DraftGame = z.infer<typeof draftGameSchema>;
export type LeagueEntry = z.infer<typeof leagueEntrySchema>;
export type DraftLeagueMeta = z.infer<typeof draftLeagueMetaSchema>;
export type DraftStanding = z.infer<typeof draftStandingSchema>;
export type DraftLeagueDetails = z.infer<typeof draftLeagueDetailsSchema>;
export type DraftHistoryRow = z.infer<typeof draftHistoryRowSchema>;
export type DraftEntryHistory = z.infer<typeof draftEntryHistorySchema>;
