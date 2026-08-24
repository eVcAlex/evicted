'use client';

import { useMe } from './MeProvider';
import classes from './YouTag.module.scss';

/**
 * A small "You" chip beside a name — the classic and draft leagues use
 * different id spaces for the same human (see `lib/draft/members.ts`), so
 * which stored id to compare against depends on which league the row
 * belongs to.
 */
export function YouTag({ entryId, league }: { entryId: number; league: 'classic' | 'draft' }) {
  const { me } = useMe();
  if (!me) return null;

  const isYou = league === 'classic' ? me.entryId === entryId : me.draftEntryId === entryId;
  if (!isYou) return null;

  return <span className={classes.tag}>You</span>;
}
