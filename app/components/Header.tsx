'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Anchor, Box, Container, Group } from '@mantine/core';
import classes from './Header.module.scss';

const LINKS = [
  { href: '/', label: 'This week' },
  { href: '/season', label: 'Season' },
  { href: '/balances', label: 'Balances' },
];

export function Header() {
  const pathname = usePathname();

  return (
    <Box component="header" className={classes.header}>
      <Container size="sm" className={classes.inner}>
        <Link href="/" className={classes.brand}>
          <span className={classes.mark} aria-hidden="true" />
          <span className={classes.wordmark}>Evicted</span>
        </Link>
        <Group gap="lg" className={classes.tabs} wrap="nowrap">
          {LINKS.map(({ href, label }) => (
            <Anchor
              key={href}
              component={Link}
              href={href}
              underline="never"
              className={`${classes.tab} ${pathname === href ? classes.tabActive : ''}`.trim()}
            >
              {label}
            </Anchor>
          ))}
        </Group>
      </Container>
    </Box>
  );
}
