import type { PendingReason } from '@/lib/monzo/store';
import classes from './AdminPanel.module.scss';

interface ReasonInfo {
  detail: string;
  tag: string;
  tone: string;
}

const REASONS: Record<PendingReason, ReasonInfo> = {
  ambiguous: {
    detail: 'Name matched more than one member',
    tag: 'Ambiguous',
    tone: classes.ambiguous,
  },
  'no-match': {
    detail: "Sender name didn't match any member",
    tag: 'No match',
    tone: classes.noMatch,
  },
  unusual: {
    detail: 'Unusual amount, check before applying',
    tag: 'Unusual',
    tone: classes.ambiguous,
  },
  reversed: {
    detail: 'Payment reversed, re-attribute or remove',
    tag: 'Reversed',
    tone: classes.noDebt,
  },
};

const FALLBACK: ReasonInfo = { detail: 'Needs review', tag: 'Review', tone: classes.noMatch };

/** Tolerates reason strings not in the union — e.g. 'no-debt' entries still
 *  in the live queue from before that reason was removed. */
export function reasonInfo(reason: string): ReasonInfo {
  // `hasOwn`, not a bare index: a reason of 'constructor' or 'toString' would
  // otherwise resolve off the prototype chain instead of falling back.
  return Object.hasOwn(REASONS, reason)
    ? (REASONS as Record<string, ReasonInfo>)[reason]
    : FALLBACK;
}
