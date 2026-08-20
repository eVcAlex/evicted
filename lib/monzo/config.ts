/** Monzo OAuth authorisation endpoint. */
export const MONZO_AUTH_URL = 'https://auth.monzo.com';

/** Monzo API base — token exchange, refresh, and webhook registration. */
export const MONZO_API_BASE = 'https://api.monzo.com';

export function monzoRedirectUri(): string {
  const base = process.env.MONZO_REDIRECT_BASE_URL;
  if (!base) {
    throw new Error('MONZO_REDIRECT_BASE_URL is not configured.');
  }
  return `${base}/api/monzo/callback`;
}

export function monzoClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.MONZO_CLIENT_ID;
  const clientSecret = process.env.MONZO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Monzo OAuth client is not configured: set MONZO_CLIENT_ID and MONZO_CLIENT_SECRET.');
  }
  return { clientId, clientSecret };
}
