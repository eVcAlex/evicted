import { AVAILABLE_AVATARS } from './avatarManifest';

/**
 * A small fixed set of muted tints for team marks — deliberately clear of
 * red/green/amber, which are reserved for eviction/paid/provisional meaning
 * elsewhere in the app.
 */
const TINTS = ['#3a4a63', '#5a4526', '#3f5b4c', '#5c3a5e', '#63463a', '#39525c'];

/**
 * A manager's photo, if `scripts/process-avatars.mjs` has generated one —
 * matched against a build-time manifest rather than probed at render time.
 * Probing (an `<img>` with an `onError` fallback) races the server's
 * optimistic markup against React attaching the handler during hydration: a
 * 404 that resolves before hydration completes is missed entirely, leaving
 * a permanently broken image. Knowing the answer up front avoids the race.
 */
export function photoUrlFor(managerName: string): string | null {
  const firstName = managerName.trim().split(/\s+/)[0]?.toLowerCase();
  return firstName && AVAILABLE_AVATARS.has(firstName) ? `/avatars/${firstName}.png` : null;
}

/**
 * The first letter of each of the first two words in a team name. A
 * one-word name uses its first two characters instead.
 */
export function initialsFor(teamName: string): string {
  const words = teamName.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return (words[0] ?? '').slice(0, 2).toUpperCase();
}

/** A stable tint per team name — the same team always gets the same mark. */
export function colorForTeam(teamName: string): string {
  let hash = 0;
  for (let i = 0; i < teamName.length; i += 1) {
    hash = (hash * 31 + teamName.charCodeAt(i)) | 0;
  }
  return TINTS[Math.abs(hash) % TINTS.length];
}
