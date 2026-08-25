'use client';

import { createElement, type ReactNode } from 'react';
import { useMe } from './MeProvider';

/**
 * Wraps a server-rendered row and appends a highlight class when it's yours.
 * Taking `children` as a prop (rather than owning the row's markup) is what
 * lets the server-rendered tables (`DraftStandingsTable`, `SeasonGrid`) stay
 * server components apart from this one wrapper — only the "is this me?"
 * check needs the client.
 */
export function MeRow({
  entryId,
  league,
  component = 'div',
  className,
  meClassName,
  children,
}: {
  entryId: number;
  league: 'classic' | 'draft';
  component?: keyof React.JSX.IntrinsicElements;
  className?: string;
  meClassName: string;
  children: ReactNode;
}) {
  const { me } = useMe();
  const isYou = me ? (league === 'classic' ? me.entryId === entryId : me.draftEntryId === entryId) : false;

  const combined = [className, isYou ? meClassName : null].filter(Boolean).join(' ') || undefined;

  return createElement(component, { className: combined }, children);
}
