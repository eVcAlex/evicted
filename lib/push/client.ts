/**
 * Browser-side helpers shared between `PushToggle` (subscribe/unsubscribe)
 * and `IdentityPicker` (re-tag an existing subscription when "who you are"
 * changes) — both need to POST the same shape to `/api/push/subscribe`, and
 * having two copies of that POST previously risked them drifting apart.
 */
/** Neither response body nor status was ever checked here before — a 401
 * (e.g. an auth wall in front of the API route) or 5xx looked identical to
 * success, so the UI happily reported "subscribed" for a subscription that
 * was never actually saved server-side. */
async function throwOnFailure(response: Response, action: string): Promise<void> {
  if (response.ok) return;
  const body = await response.text().catch(() => '');
  throw new Error(`${action} failed (${response.status})${body ? `: ${body.slice(0, 200)}` : ''}`);
}

export async function postSubscription(
  subscription: PushSubscriptionJSON,
  entryId: number | null,
): Promise<void> {
  const response = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...subscription, entryId }),
  });
  await throwOnFailure(response, 'Saving subscription');
}

export async function deleteSubscription(endpoint: string): Promise<void> {
  const response = await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
  await throwOnFailure(response, 'Removing subscription');
}

/**
 * Re-POSTs the device's live subscription (if any) with a new `entryId`.
 * Silently does nothing when the browser has no push support or no active
 * subscription — switching identity shouldn't surface a push-specific error
 * on a page that isn't about push.
 */
export async function syncSubscriptionIdentity(entryId: number | null): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!registration) return;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    await postSubscription(subscription.toJSON(), entryId);
  } catch (error) {
    console.error('syncSubscriptionIdentity failed', error);
  }
}
