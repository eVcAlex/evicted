/**
 * Draws a Hall of Shame stat as a PNG and hands it straight to the device as
 * a download — no server round trip, no upload, nothing to host. Deliberately
 * plain `<canvas>` drawing rather than `html2canvas` or similar: the app has
 * no such dependency today, the layout is simple enough to draw by hand, and
 * a canvas snapshot can never be foiled by CSS it doesn't understand.
 *
 * Visual language echoes `app/opengraph-image.tsx` (the site's other
 * shareable card, rendered server-side via `next/og` for link previews) —
 * same dark ground and ink tones, same "kicker, headline, filled number box"
 * shape. The accent itself is pinned separately from that file's (see
 * `ACCENT` below) since this card is a fixed brand asset, not a live render
 * of the in-app theme.
 */

const WIDTH = 1200;
const HEIGHT = 630;
const PAD = 56;

const PAPER = '#0b0e14';
const INK = '#e8ecf3';
const INK_DIM = '#8b93a3';
// The Evicted brand colour, fixed regardless of whatever accent the live
// in-app theme is using at any given moment — a downloadable card is a
// standalone asset, not a live view of the site, so it deliberately doesn't
// chase `app/layout.tsx`'s `primaryColor`. ACCENT_FILL is ACCENT darkened for
// a filled box that needs to hold white text.
const ACCENT = '#5420ff';
const ACCENT_FILL = '#34149e';

const DISPLAY_FONT = '"Big Shoulders", system-ui, sans-serif';
const BODY_FONT = 'system-ui, sans-serif';

export interface ShareCardContent {
  /** Small caps label above the headline, e.g. "Most evictions". */
  kicker: string;
  /** The manager/team name(s) this record belongs to. */
  name: string;
  /** A short supporting line, e.g. "Gameweek 6" or "GW 3 to GW 5". */
  sub: string;
  /** The one big number the card exists to show off. */
  statValue: string;
  /** Unit under the big number, e.g. "evictions". */
  statLabel: string;
  /** Filename for the downloaded PNG, without extension. */
  fileName: string;
  /** Manager name under `sub`, when the record already names a team. */
  meta?: string;
  /** The one-line quip, rendered like the in-app blockquote. Wraps to two lines. */
  quip?: string;
  /** Status chip inside the stat panel, e.g. "OWES £2.00" or "PAID". */
  note?: string;
  /** Real cropped photo URL, when one exists — see `lib/league/avatar.ts`. */
  avatarUrl?: string | null;
  /** Initials fallback, used when there's no photo. */
  avatarInitials?: string;
  /** Tint for the initials fallback's circle. */
  avatarColor?: string;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`avatar failed to load: ${url}`));
    img.src = url;
  });
}

/** Draws a photo cropped to a circle, cover-fit so it fills the frame with
 * no letterboxing regardless of the source image's aspect ratio. */
function drawAvatarPhoto(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const scale = Math.max((r * 2) / img.width, (r * 2) / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
}

/** Same tinted-circle-plus-initials fallback as the live `Avatar` component,
 * for a manager with no processed photo. */
function drawAvatarInitials(
  ctx: CanvasRenderingContext2D,
  initials: string,
  color: string,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = `800 ${Math.round(r * 0.8)}px ${DISPLAY_FONT}`;
  ctx.fillText(initials, cx, cy + r * 0.32);
}

/** Shrinks the font until `text` fits `maxWidth`, down to a sane floor. */
function fittedFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  weight: number,
  startSize: number,
  minSize: number,
): string {
  let size = startSize;
  let font = `${weight} ${size}px ${DISPLAY_FONT}`;
  ctx.font = font;
  while (ctx.measureText(text).width > maxWidth && size > minSize) {
    size -= 2;
    font = `${weight} ${size}px ${DISPLAY_FONT}`;
    ctx.font = font;
  }
  return font;
}

/** Greedily wraps `text` to `maxWidth`, capped at `maxLines` — the last kept
 * line gets an ellipsis if there was more text than that allows. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = candidate;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);

  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    const consumed = lines.slice(0, -1).join(' ').length + (lines.length > 1 ? 1 : 0);
    if (consumed + last.length < text.length) lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

/** A rect rounded on its left corners only — the panel sits flush against
 * the canvas's right/top/bottom edges, so rounding those would just clip. */
function roundedLeftRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export async function drawShareCard(
  canvas: HTMLCanvasElement,
  content: ShareCardContent,
): Promise<void> {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.textBaseline = 'alphabetic';

  // A masthead rule across the very top — the brand colour reads immediately,
  // before the eye even reaches the panel on the right.
  const ruleHeight = 6;
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, 0, WIDTH, ruleHeight);

  // The stat panel: full-bleed top-to-bottom against the right edge, not a
  // small square floating in the middle of empty space. Rounded only on the
  // corners that don't sit flush against the canvas edge.
  const panelWidth = 440;
  const panelX = WIDTH - panelWidth;
  const panelY = ruleHeight;
  const panelHeight = HEIGHT - ruleHeight;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = ACCENT_FILL;
  roundedLeftRect(ctx, panelX, panelY, panelWidth, panelHeight, 28);
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedLeftRect(ctx, panelX, panelY, panelWidth, panelHeight, 28);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // The stat block sits above panel-centre, not dead centre — leaves room
  // below for the status chip instead of one clump of content in a tall
  // empty column.
  const panelCenterX = panelX + panelWidth / 2;
  const statCenterY = panelY + panelHeight * 0.4;

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  const statFont = fittedFont(ctx, content.statValue, panelWidth - 80, 800, 148, 64);
  ctx.font = statFont;
  ctx.fillText(content.statValue, panelCenterX, statCenterY + 10);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(panelCenterX - 40, statCenterY + 40);
  ctx.lineTo(panelCenterX + 40, statCenterY + 40);
  ctx.stroke();

  ctx.font = `700 22px ${BODY_FONT}`;
  ctx.globalAlpha = 0.75;
  ctx.fillText(content.statLabel.toUpperCase(), panelCenterX, statCenterY + 76);
  ctx.globalAlpha = 1;

  if (content.note) {
    const noteFont = `700 20px ${BODY_FONT}`;
    ctx.font = noteFont;
    const noteWidth = ctx.measureText(content.note.toUpperCase()).width;
    const chipW = noteWidth + 48;
    const chipH = 46;
    const chipY = panelY + panelHeight * 0.68;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.beginPath();
    ctx.roundRect(panelCenterX - chipW / 2, chipY, chipW, chipH, chipH / 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(content.note.toUpperCase(), panelCenterX, chipY + chipH / 2 + 7);
  }

  // Left column: wordmark and a hairline pinned to the top, the record body
  // filling the middle, a footer credit pinned to the bottom — using the
  // full vertical run rather than one clump of text with dead margins above
  // and below it.
  const leftWidth = panelX - PAD - 56;
  ctx.textAlign = 'left';

  ctx.fillStyle = INK_DIM;
  ctx.font = `700 22px ${BODY_FONT}`;
  ctx.fillText('EVICTED', PAD, PAD + 26);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, PAD + 46);
  ctx.lineTo(PAD + 120, PAD + 46);
  ctx.stroke();

  // The avatar sits beside the kicker/name pair, same as the live card's
  // head row — whoever this is about, shown, not just named.
  const hasAvatar = Boolean(content.avatarUrl || content.avatarInitials);
  const avatarSize = 84;
  const textX = hasAvatar ? PAD + avatarSize + 26 : PAD;
  const textWidth = hasAvatar ? leftWidth - avatarSize - 26 : leftWidth;

  if (hasAvatar) {
    const cx = PAD + avatarSize / 2;
    // Centred against the kicker+name block as a pair, not just the kicker
    // line — the block runs roughly from the kicker's cap-height to the
    // name's baseline plus descender.
    const cy = 220;
    const r = avatarSize / 2;
    let drewPhoto = false;
    if (content.avatarUrl) {
      try {
        const img = await loadImage(content.avatarUrl);
        drawAvatarPhoto(ctx, img, cx, cy, r);
        drewPhoto = true;
      } catch {
        // Falls through to the initials tile below.
      }
    }
    if (!drewPhoto && content.avatarInitials) {
      drawAvatarInitials(ctx, content.avatarInitials, content.avatarColor ?? INK_DIM, cx, cy, r);
    }
    ctx.textAlign = 'left';
  }

  ctx.fillStyle = ACCENT;
  ctx.font = `700 22px ${BODY_FONT}`;
  ctx.fillText(content.kicker.toUpperCase(), textX, 190);

  ctx.fillStyle = INK;
  ctx.font = fittedFont(ctx, content.name, textWidth, 800, 64, 32);
  ctx.fillText(content.name, textX, 250);

  ctx.fillStyle = INK_DIM;
  ctx.font = `400 26px ${BODY_FONT}`;
  ctx.fillText(content.sub, PAD, 324);

  let cursorY = 324;
  if (content.meta) {
    cursorY += 38;
    ctx.fillStyle = INK_DIM;
    ctx.globalAlpha = 0.8;
    ctx.font = `400 22px ${BODY_FONT}`;
    ctx.fillText(content.meta, PAD, cursorY);
    ctx.globalAlpha = 1;
  }

  if (content.quip) {
    cursorY += 56;
    ctx.font = `italic 400 25px ${BODY_FONT}`;
    const lines = wrapText(ctx, `“${content.quip}”`, leftWidth - 24, 2);
    const lineHeight = 34;
    const blockHeight = lines.length * lineHeight;

    ctx.fillStyle = ACCENT;
    ctx.fillRect(PAD, cursorY - 22, 3, blockHeight + 4);

    ctx.fillStyle = INK_DIM;
    lines.forEach((line, i) => {
      ctx.fillText(line, PAD + 20, cursorY + i * lineHeight);
    });
  }

  ctx.fillStyle = INK_DIM;
  ctx.globalAlpha = 0.7;
  ctx.font = `400 18px ${BODY_FONT}`;
  ctx.fillText('evicted.dev', PAD, HEIGHT - 40);
  ctx.globalAlpha = 1;
}

export async function downloadShareCard(
  canvas: HTMLCanvasElement,
  fileName: string,
): Promise<void> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.png`;
  link.click();
  URL.revokeObjectURL(url);
}
