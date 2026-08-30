import { fetchStandings } from '@/lib/fpl/client';
import { buildBalances } from '@/lib/league/balances';
import { resolveMembers } from '@/lib/league/members';
import { safeGetBuyins, safeGetCredit, safeGetPaid, safeGetResults } from '@/lib/ledger/safe';
import { AdminHeader } from '../components/admin/AdminHeader';
import { AdminPanel } from '../components/admin/AdminPanel';
import { MarkPayments } from '../components/admin/MarkPayments';

export const dynamic = 'force-dynamic';

/**
 * Deliberately unlinked from every public page, and now gated by
 * `middleware.ts` - an unauthenticated visitor is redirected to `/sign-in`
 * before this renders. The balances fetch mirrors `/balances`; it feeds the
 * marking table, which is the only place fines and buy-ins are toggled now.
 */
export default async function AdminPage() {
  const [standings, resultsState, paidState, buyinsState, creditState] = await Promise.all([
    fetchStandings(3600).catch(() => null),
    safeGetResults(),
    safeGetPaid(),
    safeGetBuyins(),
    safeGetCredit(),
  ]);

  const balances = buildBalances({
    members: standings ? resolveMembers(standings) : [],
    results: resultsState.results,
    paid: paidState.paid,
    buyins: buyinsState.buyins,
    credit: creditState.credit,
  });

  return (
    <>
      <AdminHeader />
      <MarkPayments
        balances={balances}
        resultsDegraded={resultsState.degraded || !standings}
      />
      <AdminPanel />
    </>
  );
}
