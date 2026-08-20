import { MONZO_API_BASE } from './config';
import { monzoAccountsResponseSchema } from './schemas';

/**
 * A completed OAuth exchange gets a token, not a subscription — Monzo only
 * calls the webhook URL once something has explicitly registered it via
 * POST /webhooks.
 *
 * Deliberately *not* called from the OAuth callback. Right after exchange,
 * the access token is valid but not yet "unlocked": Monzo gates account data
 * behind Strong Customer Authentication, confirmed from inside the Monzo app,
 * which doesn't happen synchronously during the redirect. Calling this from
 * the callback produced `403 forbidden.insufficient_permissions` on
 * /accounts every time — not a config problem, a race. This is a standalone,
 * re-triable action instead: the admin confirms in the Monzo app in their
 * own time, then clicks Register in /admin.
 *
 * Not idempotent: calling this twice registers a second webhook rather than
 * replacing the first. Acceptable for a single-admin hobby app during the
 * capture phase — listing and de-duplicating existing webhooks is real
 * scope, deliberately deferred until the matcher (the thing that actually
 * needs exactly-once delivery) is being built.
 */
export async function registerWebhook(accessToken: string, webhookUrl: string): Promise<void> {
  const accountsRes = await fetch(`${MONZO_API_BASE}/accounts?account_type=uk_retail`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!accountsRes.ok) {
    throw new Error(`listing accounts failed: ${accountsRes.status} ${await accountsRes.text()}`);
  }

  const parsed = monzoAccountsResponseSchema.safeParse(await accountsRes.json());
  if (!parsed.success || parsed.data.accounts.length === 0) {
    throw new Error('no uk_retail account found to register the webhook against');
  }

  const accountId = parsed.data.accounts[0].id;

  const webhookRes = await fetch(`${MONZO_API_BASE}/webhooks`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ account_id: accountId, url: webhookUrl }),
  });
  if (!webhookRes.ok) {
    throw new Error(`registering webhook failed: ${webhookRes.status} ${await webhookRes.text()}`);
  }
}
