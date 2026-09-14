import { ImageResponse } from 'next/og';
import { fetchBootstrap, fetchStandings } from '@/lib/fpl/client';
import { FINE_PENCE } from '@/lib/config';
import { pounds } from '@/lib/format';
import { paidKey } from '@/lib/ledger/store';
import { safeGetPaid, safeGetResults } from '@/lib/ledger/safe';
import { eligibleFromByEntry } from '@/lib/league/eligibility';
import { recentForm } from '@/lib/league/form';
import { currentGameweek, nextGameweek, revalidateFor } from '@/lib/league/gameweeks';
import { loadHistories } from '@/lib/league/checkAndRecord';
import { resolveMembers } from '@/lib/league/members';
import { scoresForGameweek } from '@/lib/league/scoring';
import { buildSummary } from '@/lib/league/summary';

// This is the link-preview image every share of the site's URL renders —
// pasted into the group chat, it *is* the shareable card. Read-only: unlike
// the home page it never calls `checkAndRecordSettled`, so a crawler or a
// repeated unfurl can never trigger a ledger write or a push notification.
export const dynamic = 'force-dynamic';

export const alt = 'Evicted — who finished bottom this gameweek';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Matches the real app's ground now — `app/styles/globals.scss` /
// `styles/_card.scss`'s `$paper`/`$ink`/`$ink-dim`/`$rule`. The image just is
// the page rather than a card floating on one.
const PAPER = '#0b0e14';
const INK = '#e8ecf3';
const INK_DIM = '#8b93a3';
const RULE = '#242c3a';
// Two roles from the theme's brand ramp (see `app/layout.tsx`): ACCENT is
// the bright shade used for label text and marks directly on the dark
// ground, ACCENT_FILL is the exact brand hex, #5420ff, the shade a
// white-text fill needs (the net-score block).
const ACCENT = '#a184ff';
const ACCENT_FILL = '#5420ff';

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: PAPER,
        padding: 56,
        fontFamily: 'sans-serif',
      }}
    >
      {children}
    </div>
  );
}

function Wordmark() {
  return (
    <div style={{ display: 'flex', fontSize: 24, fontWeight: 700, letterSpacing: 4, color: INK_DIM }}>
      EVICTED
    </div>
  );
}

export default async function Image() {
  const bootstrap = await fetchBootstrap();
  const revalidate = revalidateFor(bootstrap);
  const standings = await fetchStandings(revalidate);
  const members = resolveMembers(standings);
  const current = currentGameweek(bootstrap);

  if (!current) {
    const next = nextGameweek(bootstrap);
    return new ImageResponse(
      (
        <Frame>
          <Wordmark />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', fontSize: 64, fontWeight: 800, color: INK, textTransform: 'uppercase' }}>
              Season hasn&apos;t started
            </div>
            <div style={{ display: 'flex', fontSize: 26, color: INK_DIM, marginTop: 16 }}>
              {next ? `${next.name} is next.` : 'Who finished bottom this week, and have they paid up.'}
            </div>
          </div>
        </Frame>
      ),
      size,
    );
  }

  const eligibleFrom = eligibleFromByEntry({
    bootstrap,
    members,
    startEvent: standings.league.start_event,
  });
  const histories = await loadHistories(members, revalidate);
  const scores = scoresForGameweek(histories, current.id, eligibleFrom);
  const summary = buildSummary({
    gameweek: current.id,
    provisional: !current.data_checked,
    members,
    scores,
  });

  const noScores = summary.losers.length === 0;
  const levelSoFar = summary.provisional && summary.allTied;
  if (noScores || levelSoFar) {
    return new ImageResponse(
      (
        <Frame>
          <Wordmark />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', fontSize: 20, fontWeight: 700, color: ACCENT, letterSpacing: 2 }}>
              GAMEWEEK {summary.gameweek}
            </div>
            <div style={{ display: 'flex', fontSize: 72, fontWeight: 800, color: INK, textTransform: 'uppercase', marginTop: 12 }}>
              Nobody yet
            </div>
            <div style={{ display: 'flex', fontSize: 26, color: INK_DIM, marginTop: 16, maxWidth: 720 }}>
              {noScores
                ? 'Nobody has scored a point yet this gameweek.'
                : 'Every manager is level so far — nobody is bottom yet.'}
            </div>
          </div>
        </Frame>
      ),
      size,
    );
  }

  const { results, degraded: resultsDegraded } = await safeGetResults();
  const { paid, degraded: paidDegraded } = await safeGetPaid();

  // A tie renders a simplified roll-call — a fixed 1200×630 card has no room
  // for several full stat blocks, and the tie is the more important fact.
  if (summary.losers.length > 1) {
    return new ImageResponse(
      (
        <Frame>
          <Wordmark />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', fontSize: 20, fontWeight: 700, color: ACCENT, letterSpacing: 2 }}>
              GAMEWEEK {summary.gameweek} &middot; TIED AT THE BOTTOM
            </div>
            <div style={{ display: 'flex', fontSize: 60, fontWeight: 800, color: INK, marginTop: 12 }}>
              {summary.losers[0].score.net} net pts
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 20 }}>
              {summary.losers.map(({ member }) => (
                <div key={member.entryId} style={{ display: 'flex', fontSize: 28, color: INK, marginTop: 6 }}>
                  {member.teamName} &middot; {member.managerName}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', fontSize: 24, color: INK_DIM, marginTop: 20 }}>
              Everyone tied pays {pounds(FINE_PENCE)}.
            </div>
          </div>
        </Frame>
      ),
      size,
    );
  }

  const { member, score } = summary.losers[0];
  const settled = !paidDegraded && paid.has(paidKey(summary.gameweek, member.entryId));
  const form = resultsDegraded ? [] : recentForm(results, member.entryId, summary.gameweek);
  const maxNet = Math.max(...form.map((p) => p.net), score.net, 1);
  const status = paidDegraded ? 'Status unknown' : settled ? 'Paid' : `Owes ${pounds(FINE_PENCE)}`;

  return new ImageResponse(
    (
      <Frame>
        <Wordmark />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 56 }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ display: 'flex', fontSize: 18, fontWeight: 700, color: INK_DIM, letterSpacing: 2 }}>
              GAMEWEEK {summary.gameweek} &middot; BOTTOM OF THE WEEK
            </div>
            <div style={{ display: 'flex', fontSize: 54, fontWeight: 800, color: INK, textTransform: 'uppercase', marginTop: 10, lineHeight: 1.02 }}>
              {member.teamName}
            </div>
            <div style={{ display: 'flex', fontSize: 24, color: INK_DIM, marginTop: 6 }}>
              {member.managerName}
            </div>
            <div style={{ display: 'flex', fontSize: 20, fontWeight: 700, color: ACCENT, marginTop: 20 }}>
              {status.toUpperCase()}
            </div>

            {form.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 32, height: 64 }}>
                {form.map((point, index) => (
                  <div
                    key={point.gameweek}
                    style={{
                      display: 'flex',
                      width: 20,
                      height: `${Math.max(10, Math.round((Math.max(point.net, 0) / maxNet) * 100))}%`,
                      borderRadius: 3,
                      backgroundColor: index === form.length - 1 ? ACCENT : RULE,
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              width: 280,
              height: 280,
              borderRadius: 20,
              backgroundColor: ACCENT_FILL,
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', fontSize: 96, fontWeight: 800, color: '#fff', lineHeight: 1 }}>
              {score.net}
            </div>
            <div style={{ display: 'flex', fontSize: 20, color: '#fff', opacity: 0.65, letterSpacing: 2, marginTop: 4 }}>
              NET PTS
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            borderTop: `2px solid ${RULE}`,
            paddingTop: 24,
            fontSize: 20,
            color: INK_DIM,
          }}
        >
          Team {score.gross} &middot; Hits &minus;{score.hits} &middot; Bench {score.bench}
        </div>
      </Frame>
    ),
    size,
  );
}
