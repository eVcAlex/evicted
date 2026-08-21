import { NextResponse } from 'next/server';
import { checkPin } from '@/lib/admin';
import { fetchStandings } from '@/lib/fpl/client';
import { resolveMembers } from '@/lib/league/members';

/**
 * The current member list, for the pending queue's "who is this?" picker on
 * a 'no-match' credit — there's no candidate list to offer there, so the
 * admin needs the full roster to attribute one manually.
 */
export async function GET(request: Request) {
  if (!checkPin(request.headers.get('x-admin-pin'))) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  try {
    const standings = await fetchStandings(60);
    const members = resolveMembers(standings).map((member) => ({
      entryId: member.entryId,
      teamName: member.teamName,
    }));
    return NextResponse.json({ members });
  } catch (error) {
    console.error('fetchStandings failed for members list', error);
    return NextResponse.json({ error: 'FPL unavailable' }, { status: 502 });
  }
}
