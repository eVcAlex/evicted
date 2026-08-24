/** Shared between every client component that reads/writes "who you are". */
export const ME_STORAGE_KEY = 'evicted-me';

/**
 * The classic league and the draft league use two different id spaces for
 * the same human — `lib/draft/members.ts` documents the trap in detail.
 * Both are captured at pick time (`IdentityPicker` joins the two rosters on
 * manager name) so every screen can compare against the id space it owns
 * without re-deriving the join later.
 */
export interface StoredIdentity {
  entryId: number;
  draftEntryId: number | null;
  managerName: string;
  teamName: string;
}

function isStoredIdentity(value: unknown): value is StoredIdentity {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.entryId === 'number' &&
    (candidate.draftEntryId === null || typeof candidate.draftEntryId === 'number') &&
    typeof candidate.managerName === 'string' &&
    typeof candidate.teamName === 'string'
  );
}

/** Returns `null` for "never set" as well as "unparseable" — same handling either way. */
export function readMe(): StoredIdentity | null {
  try {
    const raw = window.localStorage.getItem(ME_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredIdentity(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeMe(identity: StoredIdentity): void {
  try {
    window.localStorage.setItem(ME_STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // Storage unavailable (private mode, quota) — the pick just won't stick.
  }
}

export function clearMe(): void {
  try {
    window.localStorage.removeItem(ME_STORAGE_KEY);
  } catch {
    // Nothing to clean up if storage was never reachable.
  }
}
