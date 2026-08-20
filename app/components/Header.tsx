'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Anchor, Box, Container, Group, Text } from '@mantine/core';
import classes from './Header.module.scss';

const LINKS = [
  { href: '/', label: 'This week' },
  { href: '/balances', label: 'Balances' },
];

export function Header() {
  const pathname = usePathname();

  return (
    <Box component="header" className={classes.header}>
      <Container size="sm" className={classes.inner}>
        <Group gap={7} wrap="nowrap">
          <span className={classes.dot} />
          <Text className={classes.wordmark}>EVICTED</Text>
        </Group>
        <Group gap={2} className={classes.tabs} wrap="nowrap">
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
