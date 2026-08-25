/** FPL classic league "Evicted". */
export const LEAGUE_ID = 79294;

/** Alex McGuiness, "Høgh are you?" — the league admin and fine collector. */
export const ADMIN_ENTRY = 394534;

/** The fine for finishing bottom of a gameweek, in pence. */
export const FINE_PENCE = 200;

/** The one-off season buy-in, in pence. */
export const BUYIN_PENCE = 2000;

/**
 * A monzo.me link that pre-fills the £2 fine, e.g.
 * `https://monzo.me/alexmcguiness/2`. Unset until configured — every "Pay £2"
 * surface checks this and renders nothing rather than a broken link.
 */
export const MONZO_ME_URL = process.env.MONZO_ME_URL ?? null;

/** Web Push VAPID identity. Unset until generated — push sends no-op without it. */
export const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? null;
export const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? null;
export const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? null;

/** Shared secret the GitHub Actions settlement check authenticates with. */
export const CRON_SECRET = process.env.CRON_SECRET ?? null;

/** Base URL for the official FPL API. */
export const FPL_BASE = 'https://fantasy.premierleague.com/api';

/**
 * The FPL API rejects requests without a browser-like User-Agent.
 */
export const FPL_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/**
 * FPL Draft league "Evicted" — the same friend group's separate, no-money,
 * 5-person competition.
 */
export const DRAFT_LEAGUE_ID = 77196;

/** Base URL for the FPL Draft API — a different host and payload shape from classic. */
export const DRAFT_BASE = 'https://draft.premierleague.com/api';
