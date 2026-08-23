'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Anchor, Box, Container, Group } from '@mantine/core';
import { PushToggle } from './PushToggle';
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

  return (
    <Box component="header" className={classes.header}>
      <Container size="sm" className={classes.inner}>
        <Link href="/" className={classes.brand}>
          <span className={classes.mark} aria-hidden="true" />
          <span className={classes.wordmark}>Evicted</span>
        </Link>
        <Group gap="md" wrap="nowrap">
          <Group gap="lg" className={classes.tabs} wrap="nowrap">
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
          </Group>
          <PushToggle />
        </Group>
      </Container>
    </Box>
  );
}
