import type { PendingReason } from '@/lib/monzo/store';
import classes from './AdminPanel.module.scss';

interface ReasonInfo {
  /** Why this credit needs a human, shown in the pending card body. */
  detail: string;
  /** Short label for the card's corner tag. */
  tag: string;
  /** The reason encoded as a colour: yellow for a caution worth a careful
   * pick, violet for a decision that needs the admin's judgement, neutral
   * otherwise. */
  tone: string;
}

/**
 * One lookup table in place of the three parallel switches this used to be —
 * label, tag, and tone were each their own `switch (reason)` over this same
 * union, so a fourth reason meant editing all three.
 */
export const REASONS: Record<PendingReason, ReasonInfo> = {
  ambiguous: {
    detail: 'Name matched more than one member',
    tag: 'Ambiguous',
    tone: classes.ambiguous,
  },
  'no-debt': {
    detail: 'No matching debt owed',
    tag: 'No debt',
    tone: classes.noDebt,
  },
  'no-match': {
    detail: "Sender name didn't match any member",
    tag: 'No match',
    tone: classes.noMatch,
  },
};
