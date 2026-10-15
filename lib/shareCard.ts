/**
 * Draws a share card as a PNG and hands it straight to the device as a
 * download. No server round trip, no upload, nothing to host. Plain
 * `<canvas>` drawing rather than `html2canvas` or similar: the app has no
 * such dependency, the layout is simple enough to draw by hand, and a canvas
 * snapshot can never be foiled by CSS it doesn't understand.
 *
 * Layout: a flat dark ground on the left carrying the name and the figure, a
 * flat brand-colour panel on the right carrying the person's face. No
 * gradients, no glow, no domain. The brand colour is pinned here (see
 * `ACCENT_FILL`) since a downloaded card is a fixed asset, not a live view of
 * the in-app theme.
 */

const WIDTH = 1200;
// Full height for a card with a quip (the "bottom of the week" card). A Hall
// of Shame stat has no quip, so the canvas shrinks to fit what's there
// instead of leaving dead space below it.
const HEIGHT_FULL = 630;
const HEIGHT_COMPACT = 500;
const PAD = 56;
const PANEL_WIDTH = 440;

const PAPER = '#0b0e14';
const INK = '#e8ecf3';
const INK_DIM = '#8b93a3';
const RULE = '#2a3344';
// The Evicted brand colour darkened for a filled panel that holds white text.
const ACCENT_FILL = '#34149e';

const DISPLAY_FONT = '"Big Shoulders", system-ui, sans-serif';
const BODY_FONT = 'system-ui, sans-serif';

export interface ShareCardContent {
  /** Small label above the headline, e.g. "Most evictions". */
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
  /** Manager name under the team name, when the record already names a team. */
  meta?: string;
  /** The one-line quip. Wraps to three lines at most. */
  quip?: string;
  /** Status next to the figure, e.g. "OWES £2.00" or "PAID". */
  note?: string;
  /** Real cropped photo URL, when one exists, see `lib/league/avatar.ts`. */
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

/** The manager's cut-out head, contained in a square and centred on (cx, cy). */
function drawFace(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  box: number,
): void {
  const scale = Math.min(box / img.width, box / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

/** Tinted circle plus initials, for a manager with no processed photo. */
function drawInitials(
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
  ctx.fillText(initials, cx, cy + r * 0.28);
}

/** Greedily wraps `text` to `maxWidth` using the context's current font. */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * The largest display size at which `text` wraps to at most `maxLines` lines
 * inside `maxWidth`, down to `minSize`. Returns the size and its lines.
 */
function fitName(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  startSize: number,
  minSize: number,
): { size: number; lines: string[] } {
  let size = startSize;
  for (;;) {
    ctx.font = `800 ${size}px ${DISPLAY_FONT}`;
    const lines = wrapLines(ctx, text, maxWidth);
    if (lines.length <= maxLines || size <= minSize) {
      return { size, lines: lines.slice(0, maxLines) };
    }
    size -= 4;
  }
}

export async function drawShareCard(
  canvas: HTMLCanvasElement,
  content: ShareCardContent,
): Promise<void> {
  const compact = !content.quip;
  const HEIGHT = compact ? HEIGHT_COMPACT : HEIGHT_FULL;
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.textBaseline = 'alphabetic';

  // Right: a flat brand panel with the face centred in it.
  const panelX = WIDTH - PANEL_WIDTH;
  ctx.fillStyle = ACCENT_FILL;
  ctx.fillRect(panelX, 0, PANEL_WIDTH, HEIGHT);

  const panelCx = panelX + PANEL_WIDTH / 2;
  const faceBox = compact ? 300 : 340;
  const faceCy = content.quip ? HEIGHT / 2 - 18 : HEIGHT / 2;

  let drewPhoto = false;
  if (content.avatarUrl) {
    try {
      drawFace(ctx, await loadImage(content.avatarUrl), panelCx, faceCy, faceBox);
      drewPhoto = true;
    } catch {
      // Falls through to the initials tile below.
    }
  }
  if (!drewPhoto && content.avatarInitials) {
    drawInitials(
      ctx,
      content.avatarInitials,
      content.avatarColor ?? '#3a4a63',
      panelCx,
      faceCy,
      faceBox * 0.36,
    );
  }

  if (content.quip) {
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = `500 22px ${BODY_FONT}`;
    const lines = wrapLines(ctx, content.quip, PANEL_WIDTH - 80).slice(0, 3);
    const lineHeight = 30;
    const top = HEIGHT - 44 - (lines.length - 1) * lineHeight;
    lines.forEach((line, i) => ctx.fillText(line, panelCx, top + i * lineHeight));
  }

  // Left: wordmark, rule and the supporting line across the top.
  ctx.textAlign = 'left';
  const headY = PAD + 24;
  ctx.fillStyle = INK;
  ctx.font = `800 32px ${DISPLAY_FONT}`;
  ctx.fillText('EVICTED', PAD, headY);
  const wordmarkWidth = ctx.measureText('EVICTED').width;

  ctx.fillStyle = RULE;
  ctx.fillRect(PAD + wordmarkWidth + 18, headY - 20, 2, 24);

  ctx.fillStyle = INK_DIM;
  ctx.font = `600 22px ${BODY_FONT}`;
  ctx.fillText(content.sub, PAD + wordmarkWidth + 38, headY - 1);

  // The name, up to two lines, as large as the column allows.
  const columnWidth = panelX - PAD - 56;
  const nameStart = compact ? 84 : 128;
  const { size, lines } = fitName(
    ctx,
    content.name.toUpperCase(),
    columnWidth,
    2,
    nameStart,
    48,
  );
  const lineHeight = Math.round(size * 0.92);
  const nameTop = compact ? 150 : 200;

  ctx.fillStyle = INK_DIM;
  ctx.font = `600 20px ${BODY_FONT}`;
  ctx.fillText(content.kicker, PAD, nameTop - 18 - (compact ? 0 : 4));

  ctx.fillStyle = INK;
  ctx.font = `800 ${size}px ${DISPLAY_FONT}`;
  lines.forEach((line, i) => ctx.fillText(line, PAD, nameTop + size * 0.78 + i * lineHeight));

  const nameBottom = nameTop + size * 0.78 + (lines.length - 1) * lineHeight;
  if (content.meta) {
    ctx.fillStyle = INK_DIM;
    ctx.font = `500 24px ${BODY_FONT}`;
    ctx.fillText(content.meta, PAD, nameBottom + 40);
  }

  // The figure, pinned to the bottom of the column with its label and note
  // beside it.
  const baseY = HEIGHT - PAD;
  const statSize = compact ? 84 : 104;
  ctx.fillStyle = INK;
  ctx.font = `800 ${statSize}px ${DISPLAY_FONT}`;
  ctx.fillText(content.statValue, PAD, baseY);
  const statWidth = ctx.measureText(content.statValue).width;

  ctx.fillStyle = INK_DIM;
  ctx.font = `600 22px ${BODY_FONT}`;
  ctx.fillText(content.statLabel, PAD + statWidth + 18, baseY - 6);

  if (content.note) {
    const labelWidth = ctx.measureText(content.statLabel).width;
    ctx.font = `700 18px ${BODY_FONT}`;
    const noteText = content.note.toUpperCase();
    const chipW = ctx.measureText(noteText).width + 32;
    const chipH = 38;
    const chipX = PAD + statWidth + 18 + labelWidth + 28;
    const chipY = baseY - 6 - chipH / 2 - 8;
    ctx.strokeStyle = RULE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(chipX, chipY, chipW, chipH, chipH / 2);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillText(noteText, chipX + 16, chipY + chipH / 2 + 6);
  }
}

/**
 * Hands the PNG to the device. Prefers the Web Share API with the image as
 * a file attachment: on iOS Safari, an `<a download>` doesn't actually
 * download at all, it just opens the blob in a new tab for a manual
 * long-press save, and Android's save-image flow is clumsier than its
 * native share sheet. A direct share sheet with the file already attached
 * is the whole point for an app whose audience is a phone group chat.
 * Falls back to the anchor-download trick where file sharing isn't
 * supported (desktop browsers, mostly).
 */
export async function downloadShareCard(
  canvas: HTMLCanvasElement,
  fileName: string,
): Promise<void> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return;

  const file = new File([blob], `${fileName}.png`, { type: 'image/png' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      // AbortError is the user cancelling the share sheet, not a failure, so
      // leave them where they were rather than also firing a download.
      if (err instanceof Error && err.name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.png`;
  link.click();
  URL.revokeObjectURL(url);
}
