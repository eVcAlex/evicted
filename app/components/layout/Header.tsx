'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Anchor, Box, Container } from '@mantine/core';
import { SettingsLink } from './SettingsLink';
import classes from './Header.module.scss';

const LINKS = [
  { href: '/', label: 'This week' },
  { href: '/season', label: 'Season' },
  { href: '/balances', label: 'Balances' },
  // The no-money side attraction — kept after the money tabs on purpose.
  { href: '/draft', label: 'Draft' },
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

export function Header() {
  const pathname = usePathname();
  const tabsRef = useRef<HTMLElement>(null);

  // The translateZ(0) layer promotion below (Header.module.scss) isn't
  // always enough on its own — WebKit can still skip repainting the active
  // tab's border-color change inside that layer. Nudging opacity forces a
  // fresh paint of the tabs specifically, once per navigation.
  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    el.style.opacity = '0.999';
    const id = requestAnimationFrame(() => {
      el.style.opacity = '';
    });
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  return (
    <Box component="header" className={classes.header}>
      <Container size="sm" className={classes.inner}>
        <Link href="/" className={classes.brand}>
          <span className={classes.wordmark}>Evicted</span>
        </Link>
        <nav ref={tabsRef} className={classes.tabs} aria-label="Primary">
          {LINKS.map(({ href, label }) => (
            <Anchor
              key={href}
              component={Link}
              href={href}
              underline="never"
              className={`${classes.tab} ${isActive(pathname, href) ? classes.tabActive : ''}`.trim()}
            >
              {label}
            </Anchor>
          ))}
        </nav>
        <div className={classes.actions}>
          <SettingsLink />
        </div>
      </Container>
    </Box>
  );
}
