import { Stack, Text, Title } from '@mantine/core';
import type { GameweekResult } from '@/lib/ledger/store';
import type { Member } from '@/lib/league/members';
import { LoserCard } from '../components/LoserCard';
import { SeasonGrid } from '../components/SeasonGrid';

/**
 * A visual harness for states that only occur naturally once real gameweeks
 * settle. The leading underscore makes `_preview` a Next.js private folder —
 * excluded from routing entirely, not merely unlinked — so this never
 * resolves to a live URL at all, in dev or in production.
 */

const member = (overrides: Partial<Member> = {}): Member => ({
  entryId: 1,
  teamName: 'Borussia Teeth',
  managerName: 'Charlie Robinson',
  joinedTime: null,
  ...overrides,
});

const CARDS: Array<{ label: string; previousLosses: number[]; summary: Parameters<typeof LoserCard>[0]['summary'] }> = [
  {
    label: 'Hits caused it',
    previousLosses: [],
    summary: {
      gameweek: 4,
      provisional: false,
      allTied: false,
      runnerUpNet: 32,
      losers: [{ member: member(), score: { entryId: 1, gross: 40, net: 28, hits: 12, bench: 4 } }],
    },
  },
  {
    label: 'Bench outscored the team',
    previousLosses: [],
    summary: {
      gameweek: 4,
      provisional: false,
      allTied: false,
      runnerUpNet: 45,
      losers: [{ member: member(), score: { entryId: 1, gross: 20, net: 20, hits: 0, bench: 34 } }],
    },
  },
  {
    label: 'Second week running',
    previousLosses: [3],
    summary: {
      gameweek: 4,
      provisional: false,
      allTied: false,
      runnerUpNet: 30,
      losers: [{ member: member(), score: { entryId: 1, gross: 25, net: 25, hits: 0, bench: 2 } }],
    },
  },
  {
    label: 'Third eviction of the season',
    previousLosses: [1, 2],
    summary: {
      gameweek: 6,
      provisional: false,
      allTied: false,
      runnerUpNet: 40,
      losers: [{ member: member(), score: { entryId: 1, gross: 25, net: 25, hits: 0, bench: 2 } }],
    },
  },
  {
    label: 'One point off safety',
    previousLosses: [],
    summary: {
      gameweek: 4,
      provisional: false,
      allTied: false,
      runnerUpNet: 26,
      losers: [{ member: member(), score: { entryId: 1, gross: 25, net: 25, hits: 0, bench: 2 } }],
    },
  },
  {
    label: 'Wide margin',
    previousLosses: [],
    summary: {
      gameweek: 4,
      provisional: false,
      allTied: false,
      runnerUpNet: 40,
      losers: [{ member: member(), score: { entryId: 1, gross: 10, net: 10, hits: 0, bench: 2 } }],
    },
  },
  {
    label: 'Everyone tied',
    previousLosses: [],
    summary: {
      gameweek: 4,
      provisional: false,
      allTied: true,
      runnerUpNet: null,
      losers: [
        { member: member(), score: { entryId: 1, gross: 0, net: 0, hits: 0, bench: 2 } },
        {
          member: member({ entryId: 2, teamName: 'JT', managerName: 'Joe Taylor' }),
          score: { entryId: 2, gross: 0, net: 0, hits: 0, bench: 2 },
        },
      ],
    },
  },
];

const SEASON_MEMBERS: Member[] = [
  member({ entryId: 1, teamName: 'Høgh are you?', managerName: 'Alex McGuiness' }),
  member({ entryId: 2, teamName: 'Jacquet Potato', managerName: 'Ben Hopla' }),
  member({ entryId: 3, teamName: 'Borussia Teeth', managerName: 'Charlie Robinson' }),
];

const SEASON_RESULTS = new Map<number, GameweekResult>([
  [1, { losers: [2], scores: { 1: 40, 2: 10, 3: 35 }, recordedAt: '2026-08-24T00:00:00Z' }],
  [2, { losers: [3], scores: { 1: 38, 2: 30, 3: 5 }, recordedAt: '2026-08-31T00:00:00Z' }],
  [3, { losers: [2], scores: { 1: 45, 2: 8, 3: 40 }, recordedAt: '2026-09-07T00:00:00Z' }],
]);

export default function PreviewPage() {
  return (
    <Stack gap={48}>
      <div>
        <Title order={2} mb="md">
          Quip branches
        </Title>
        <Stack gap="xl">
          {CARDS.map(({ label, summary, previousLosses }) => (
            <div key={label}>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={6}>
                {label}
              </Text>
              <LoserCard
                summary={summary}
                paid={new Set()}
                degraded={false}
                previousLosses={new Map([[1, previousLosses]])}
              />
            </div>
          ))}
        </Stack>
      </div>

      <div>
        <Title order={2} mb="md">
          Season grid
        </Title>
        <SeasonGrid members={SEASON_MEMBERS} results={SEASON_RESULTS} />
      </div>

      <div>
        <Title order={2} mb="md">
          Season grid — empty state
        </Title>
        <SeasonGrid members={SEASON_MEMBERS} results={new Map()} />
      </div>
    </Stack>
  );
}
