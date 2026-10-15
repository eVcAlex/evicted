'use client';

import { Button } from '@mantine/core';
import { Avatar } from '../common/Avatar';
import { useMe } from '../common/MeProvider';
import classes from './IdentityPicker.module.scss';

export interface RosterEntry {
  entryId: number;
  draftEntryId: number | null;
  managerName: string;
  teamName: string;
}

/**
 * The roster is re-fetched from FPL on every visit to this page (see
 * `app/settings/page.tsx`), so picking a row here also refreshes a
 * previously stored `teamName` if it's since changed.
 */
export function IdentityPicker({ roster }: { roster: RosterEntry[] }) {
  const { me, setMe, clear } = useMe();

  if (roster.length === 0) {
    return <p className={classes.empty}>Nobody to pick yet. Try again once the roster loads.</p>;
  }

  return (
    <div>
      <div className={classes.grid}>
        {roster.map((entry) => {
          const isYou = me?.entryId === entry.entryId;
          return (
            <button
              key={entry.entryId}
              type="button"
              onClick={() => setMe(entry)}
              className={isYou ? `${classes.card} ${classes.cardActive}` : classes.card}
              aria-pressed={isYou}
            >
              <Avatar teamName={entry.teamName} managerName={entry.managerName} size={72} />
              <span className={classes.name}>{entry.teamName}</span>
              <span className={classes.manager}>{entry.managerName}</span>
              {isYou && <span className={classes.you}>This is you</span>}
            </button>
          );
        })}
      </div>

      {me && (
        <Button variant="subtle" size="xs" mt="md" onClick={clear}>
          Not me, clear
        </Button>
      )}
    </div>
  );
}
