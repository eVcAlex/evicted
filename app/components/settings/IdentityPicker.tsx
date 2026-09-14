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
    <div className={classes.list}>
      {roster.map((entry) => {
        const isYou = me?.entryId === entry.entryId;
        return (
          <button
            key={entry.entryId}
            type="button"
            onClick={() => setMe(entry)}
            className={isYou ? `${classes.row} ${classes.rowActive}` : classes.row}
            aria-pressed={isYou}
          >
            <Avatar teamName={entry.teamName} managerName={entry.managerName} size={36} />
            <div className={classes.identity}>
              <span className={classes.name}>{entry.teamName}</span>
              <span className={classes.manager}>{entry.managerName}</span>
            </div>
          </button>
        );
      })}

      {me && (
        <Button variant="subtle" size="xs" mt="sm" onClick={clear}>
          Not me, clear
        </Button>
      )}
    </div>
  );
}
