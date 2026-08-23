/**
 * The structural minimum every league (classic or draft) can produce for a
 * member — just enough for the shared presentational components (`Avatar`,
 * `PreSeason`, `SeasonGrid`) to render someone without needing to know which
 * league, or league-specific fields like `joinedTime`, they came from.
 */
export interface Identity {
  entryId: number;
  managerName: string;
  teamName: string;
}
