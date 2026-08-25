'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ActionIcon, Tooltip } from '@mantine/core';
import { Avatar } from '../common/Avatar';
import { useMe } from '../common/MeProvider';
import classes from './SettingsLink.module.scss';

/**
 * The header's right-hand control — replaces the old bare `PushToggle` bell.
 * Shows your own avatar once you've picked who you are on `/settings`
 * (`Avatar` has no client-only dependencies, so it renders fine bundled
 * into this client component — the same pattern `BalancesTable` already
 * uses), otherwise a neutral placeholder.
 */
export function SettingsLink() {
  const pathname = usePathname();
  const { me, ready } = useMe();
  const active = pathname === '/settings';

  return (
    <Tooltip label={me ? me.teamName : 'Settings'}>
      <ActionIcon
        component={Link}
        href="/settings"
        variant="subtle"
        size="lg"
        aria-label="Settings"
        aria-current={active ? 'page' : undefined}
        className={active ? `${classes.link} ${classes.active}` : classes.link}
      >
        {ready && me ? (
          <Avatar teamName={me.teamName} managerName={me.managerName} size={26} className={classes.avatar} />
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
            <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M5 19c0-3.3 3.1-6 7-6s7 2.7 7 6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        )}
      </ActionIcon>
    </Tooltip>
  );
}
