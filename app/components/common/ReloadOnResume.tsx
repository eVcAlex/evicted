'use client';

import { useEffect, useRef } from 'react';

/**
 * Standalone home-screen PWAs get suspended, not killed — reopening the icon
 * resumes the exact in-memory page rather than navigating, so page lifecycle
 * events (`pageshow`/`pagehide`) never fire and a new deploy is never
 * fetched. `visibilitychange` is the one event that does fire on that
 * resume. Reload only when the deployed commit has actually moved on (via
 * the `build-sha` meta tag vs. a fresh /api/build fetch), so a plain
 * app-switch with no new deploy doesn't blow away scroll position/state.
 */
export function ReloadOnResume() {
  const checking = useRef(false);

  useEffect(() => {
    const currentSha = document
      .querySelector('meta[name="build-sha"]')
      ?.getAttribute('content');
    if (!currentSha) return;

    const onVisible = () => {
      if (document.visibilityState !== 'visible' || checking.current) return;
      checking.current = true;

      fetch('/api/build', { cache: 'no-store' })
        .then((res) => res.json())
        .then((data: { sha: string | null }) => {
          if (data.sha && data.sha !== currentSha) window.location.reload();
        })
        .catch(() => {})
        .finally(() => {
          checking.current = false;
        });
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  return null;
}
