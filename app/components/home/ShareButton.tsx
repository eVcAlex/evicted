'use client';

import { ActionIcon, Tooltip } from '@mantine/core';
import { downloadShareCard, drawShareCard, type ShareCardContent } from '@/lib/shareCard';
import classes from './ShareButton.module.scss';

/**
 * Downloads the current "bottom of the week" result as a PNG, same
 * mechanism as `ShareStatButton` on the season page — a plain `<canvas>`
 * drawn in memory, never mounted, handed to the device as a file. No Web
 * Share API, no clipboard: a link's own preview already covers "share this
 * page" via `app/opengraph-image.tsx`, so this button's whole job is
 * getting a standalone image onto the phone, ready to paste into the group
 * chat that isn't reading the page itself.
 */
export function ShareButton({ content }: { content: ShareCardContent }) {
  async function handleClick() {
    const canvas = document.createElement('canvas');
    await drawShareCard(canvas, content);
    await downloadShareCard(canvas, content.fileName);
  }

  return (
    <Tooltip label="Download image" withArrow>
      <ActionIcon
        variant="subtle"
        size="lg"
        aria-label="Download this result as an image"
        className={classes.button}
        onClick={handleClick}
      >
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true">
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
