import { colorForTeam, initialsFor, photoUrlFor } from '@/lib/league/avatar';
import classes from './Avatar.module.scss';

/**
 * A team's mark: a real photo when one has been generated into
 * `public/avatars/<first-name>.png` by `scripts/process-avatars.mjs`,
 * otherwise the initials tile. No code change is needed to add a photo
 * later — matching a file to a manager and re-running the script is enough.
 */
export function Avatar({
  teamName,
  managerName,
  size = 44,
  className,
}: {
  teamName: string;
  managerName: string;
  size?: number;
  className?: string;
}) {
  const photoUrl = photoUrlFor(managerName);

  return (
    <div
      className={className ? `${classes.avatar} ${className}` : classes.avatar}
      style={{
        backgroundColor: photoUrl ? undefined : colorForTeam(teamName),
        boxShadow: photoUrl ? undefined : '0 4px 10px rgba(0, 0, 0, 0.35)',
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
      }}
    >
      {photoUrl ? (
        // A cut-out head, not a framed photo — no tile behind it to fight
        // its silhouette.
        // eslint-disable-next-line @next/next/no-img-element -- a handful of
        // small, pre-cropped static files; next/image's optimizer isn't
        // worth the extra config for this.
        <img src={photoUrl} alt="" className={classes.photo} />
      ) : (
        initialsFor(teamName)
      )}
    </div>
  );
}
