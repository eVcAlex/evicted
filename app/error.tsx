'use client';

import { Container } from '@mantine/core';
import classes from './error.module.scss';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <Container size="sm" py="xl">
      <div className={classes.card}>
        <span className={classes.kicker}>Could not load</span>
        <p className={classes.title}>The league didn&rsquo;t respond</p>
        <p className={classes.sub}>
          The Fantasy Premier League API didn&rsquo;t respond as expected. This
          usually clears on its own during a busy gameweek.
        </p>
        <button className={classes.retry} onClick={reset}>
          Try again
        </button>
      </div>
    </Container>
  );
}
