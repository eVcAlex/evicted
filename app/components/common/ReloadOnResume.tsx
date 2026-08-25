'use client';

import { useEffect } from 'react';

/**
 * Standalone home-screen PWAs get suspended, not killed — reopening the icon
 * resumes the bfcache'd page instead of fetching the latest deploy. `pageshow`
 * with `persisted: true` is the one reliable signal for that resume, so force
 * a real reload only then.
 */
export function ReloadOnResume() {
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  return null;
}
