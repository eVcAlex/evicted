'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Anchor, Box, Container } from '@mantine/core';
import { SettingsLink } from './SettingsLink';
import classes from './Header.module.scss';

const ICON_PROPS = {
  viewBox: '0 0 24 24',
  width: 22,
  height: 22,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const LINKS: Array<{ href: string; label: string; icon: ReactNode }> = [
  {
    href: '/',
    label: 'This week',
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7.5V12l3 2" />
      </svg>
    ),
  },
  {
    href: '/season',
    label: 'Season',
    icon: (
      <svg {...ICON_PROPS}>
        <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
        <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
        <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
        <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
      </svg>
    ),
  },
  {
    href: '/balances',
    label: 'Balances',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H18a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 17V8.5Z" />
        <path d="M4 8.5C4 7.7 4.7 7 5.5 7H17M20 12h-3.5a1.75 1.75 0 0 0 0 3.5H20" />
      </svg>
    ),
  },
  // The no-money side attraction, kept after the money tabs on purpose.
  {
    href: '/draft',
    label: 'Draft',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M5 6h14M5 12h14M5 18h9" />
      </svg>
    ),
  },
];

/**
 * Exact match for home (otherwise every route would light it up); prefix
 * match everywhere else, since /draft now has a sub-route (/draft/season)
 * that should still highlight the "Draft" tab.
 */
function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Tabs that read the classic league; greyed out while FPL's standings are bad. */
const CLASSIC_ONLY = new Set(['/season', '/balances']);

export function Header({ leagueBroken = false }: { leagueBroken?: boolean }) {
  const pathname = usePathname();
  const blocked = (href: string) => leagueBroken && CLASSIC_ONLY.has(href);

  return (
    <>
      <Box component="header" className={classes.header}>
        <Container size="sm" className={classes.inner}>
          <Link href="/" className={classes.brand}>
            <span className={classes.wordmark}>Evicted</span>
          </Link>
          {/* Keyed on pathname: two coercion tricks (compositor-layer promotion,
              then an opacity nudge) still left a ghosted border-color from the
              previously active tab on iOS/WebKit. Remounting fresh DOM nodes on
              every navigation sidesteps that stale-paint-cache bug entirely
              instead of trying to coax WebKit into repainting the old ones.
              Hidden on phones, where the bottom bar below takes over. */}
          <nav key={pathname} className={classes.tabs} aria-label="Primary">
            {LINKS.map(({ href, label }) =>
              blocked(href) ? (
                <span key={href} aria-disabled="true" className={`${classes.tab} ${classes.tabDisabled}`}>
                  {label}
                </span>
              ) : (
                <Anchor
                  key={href}
                  component={Link}
                  href={href}
                  underline="never"
                  className={`${classes.tab} ${isActive(pathname, href) ? classes.tabActive : ''}`.trim()}
                >
                  {label}
                </Anchor>
              ),
            )}
          </nav>
          <div className={classes.actions}>
            <SettingsLink />
          </div>
        </Container>
      </Box>

      {/* Phone navigation: a bottom bar within thumb reach instead of a
          sideways-scrolling strip squeezed next to the wordmark. */}
      <nav key={`bottom-${pathname}`} className={classes.bottomBar} aria-label="Primary, mobile">
        {LINKS.map(({ href, label, icon }) =>
          blocked(href) ? (
            <span
              key={href}
              aria-disabled="true"
              className={`${classes.bottomTab} ${classes.tabDisabled}`}
            >
              {icon}
              <span>{label}</span>
            </span>
          ) : (
            <Link
              key={href}
              href={href}
              aria-current={isActive(pathname, href) ? 'page' : undefined}
              className={`${classes.bottomTab} ${isActive(pathname, href) ? classes.bottomTabActive : ''}`.trim()}
            >
              {icon}
              <span>{label}</span>
            </Link>
          ),
        )}
      </nav>
    </>
  );
}
