/**
 * The structural subset of a recorded gameweek that the shared grid/stats
 * code actually reads — never `recordedAt`, which is a ledger-persistence
 * detail no consumer needs. `lib/ledger/store.ts`'s `GameweekResult` is
 * structurally assignable to this, so every classic call site keeps working
 * unchanged; a league with no ledger at all (draft) can produce this shape
 * without inventing a fake `recordedAt`.
 */
export interface GridResult {
  /** Entry ids of everyone tied at the bottom. */
  losers: number[];
  /** Score per entry id. */
  scores: Record<number, number>;
}
