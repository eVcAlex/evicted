import { Stack, Text } from '@mantine/core';
import type { Member } from '@/lib/league/members';
import { Avatar } from './Avatar';
import classes from './PreSeason.module.scss';

export function PreSeason({
  members,
  deadline,
  gameweekName,
}: {
  members: Member[];
  deadline: string | null;
  gameweekName: string | null;
}) {
  return (
    <Stack gap="lg">
      <div className={classes.hero}>
        <span className={classes.kicker}>Season not started</span>
        <h1 className={classes.title}>Nobody yet</h1>
        <Text className={classes.heroSub}>
          {gameweekName ?? 'The season'} has not been played.
        </Text>
      </div>

      {deadline && (
        <div className={classes.deadline}>
          <span className={classes.deadlineCaption}>
            {gameweekName ?? 'Kickoff'} deadline
          </span>
          <span className={classes.deadlineValue}>
            {new Date(deadline).toLocaleString('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      )}

      <div>
        <div className={classes.eyebrow}>{members.length} in the league</div>
        <div className={classes.roster}>
          {members.map((member) => (
            <div key={member.entryId} className={classes.row}>
              <Avatar teamName={member.teamName} managerName={member.managerName} size={44} />
              <span className={classes.name}>{member.teamName}</span>
              <span className={classes.manager}>{member.managerName}</span>
            </div>
          ))}
        </div>
      </div>
    </Stack>
  );
}
