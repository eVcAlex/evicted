'use client';

import { ActionIcon, Tooltip } from '@mantine/core';
import { downloadShareCard, drawShareCard, type ShareCardContent } from '@/lib/shareCard';
import classes from './ShareStatButton.module.scss';

/**
 * Renders a Hall of Shame stat to a PNG and downloads it straight to the
 * device — sits on the filled `hero` card, so it needs its own onDark
 * styling rather than `ShareButton`'s, which assumes a plain page ground.
 * The canvas is created in memory and never mounted: nothing to draw over,
 * nothing to clean up but the object URL `downloadShareCard` already
 * revokes.
 */
export function ShareStatButton({ content }: { content: ShareCardContent }) {
  async function handleClick() {
    const canvas = document.createElement('canvas');
    await drawShareCard(canvas, content);
    await downloadShareCard(canvas, content.fileName);
  }

  return (
    <Tooltip label="Download image" withArrow>
      <ActionIcon
        variant="subtle"
        size="md"
        aria-label="Download this stat as an image"
        className={classes.button}
        onClick={handleClick}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
          <path
            d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </ActionIcon>
    </Tooltip>
  );
}
