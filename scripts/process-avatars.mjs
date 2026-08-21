// Turns a "floating head" cutout on a white background into a tightly
// cropped, transparent-background square PNG for use as an avatar photo.
//
// Usage: node scripts/process-avatars.mjs <source-dir>
//
// Each <Name>.png/.PNG in the source directory becomes
// public/avatars/<name>.png (lowercased), matched at render time against a
// manager's first name — see app/components/Avatar.tsx.
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const WHITE_THRESHOLD = 235;
const PADDING_FRACTION = 0.08;
const OUTPUT_SIZE = 512;

async function floodFillBackground(data, width, height, channels) {
  const alphaIndex = channels - 1;
  const visited = new Uint8Array(width * height);
  const stack = [];

  const isWhiteAt = (x, y) => {
    const i = (y * width + x) * channels;
    return data[i] >= WHITE_THRESHOLD && data[i + 1] >= WHITE_THRESHOLD && data[i + 2] >= WHITE_THRESHOLD;
  };

  for (let x = 0; x < width; x += 1) {
    stack.push([x, 0], [x, height - 1]);
  }
  for (let y = 0; y < height; y += 1) {
    stack.push([0, y], [width - 1, y]);
  }

  while (stack.length > 0) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const idx = y * width + x;
    if (visited[idx]) continue;
    visited[idx] = 1;
    if (!isWhiteAt(x, y)) continue;

    data[idx * channels + alphaIndex] = 0;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
}

function boundingBoxOf(data, width, height, channels) {
  const alphaIndex = channels - 1;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * channels + alphaIndex] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  return { minX, minY, maxX, maxY };
}

async function processOne(inputPath, outputPath) {
  const image = sharp(inputPath).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  await floodFillBackground(data, width, height, channels);

  const { minX, minY, maxX, maxY } = boundingBoxOf(data, width, height, channels);
  if (maxX < 0) {
    throw new Error(`${inputPath}: no non-background content found`);
  }

  const contentWidth = maxX - minX + 1;
  const contentHeight = maxY - minY + 1;
  const side = Math.round(Math.max(contentWidth, contentHeight) * (1 + PADDING_FRACTION * 2));

  const cx = minX + contentWidth / 2;
  const cy = minY + contentHeight / 2;
  const left = Math.round(cx - side / 2);
  const top = Math.round(cy - side / 2);

  // Sharp can't chain `.extend().extract()` directly on a raw-buffer source
  // — it throws "bad extract area" even when the extract region fits neatly
  // inside the extended canvas. Materializing the extend step first works
  // around it.
  const extended = await sharp(data, { raw: { width, height, channels } })
    .extend({
      top: Math.max(0, -top),
      bottom: Math.max(0, top + side - height),
      left: Math.max(0, -left),
      right: Math.max(0, left + side - width),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  await sharp(extended.data, {
    raw: { width: extended.info.width, height: extended.info.height, channels: extended.info.channels },
  })
    .extract({
      left: Math.max(0, left),
      top: Math.max(0, top),
      width: side,
      height: side,
    })
    .resize(OUTPUT_SIZE, OUTPUT_SIZE)
    .png()
    .toFile(outputPath);
}

async function main() {
  const sourceDir = process.argv[2];
  if (!sourceDir) {
    console.error('Usage: node scripts/process-avatars.mjs <source-dir>');
    process.exit(1);
  }

  const outputDir = path.resolve(import.meta.dirname, '../public/avatars');
  await mkdir(outputDir, { recursive: true });

  const entries = await readdir(sourceDir);
  const images = entries.filter((name) => /\.png$/i.test(name));

  if (images.length === 0) {
    console.error(`No .png files found in ${sourceDir}`);
    process.exit(1);
  }

  for (const name of images) {
    const slug = path.parse(name).name.toLowerCase();
    const outputPath = path.join(outputDir, `${slug}.png`);
    await processOne(path.join(sourceDir, name), outputPath);
    console.log(`${name} -> public/avatars/${slug}.png`);
  }

  await writeManifest(outputDir);
}

/**
 * Scans the full output directory, not just what was processed this run —
 * re-running against a subset of source photos must not drop names that
 * were added in an earlier run.
 */
async function writeManifest(outputDir) {
  const manifestPath = path.resolve(import.meta.dirname, '../lib/league/avatarManifest.ts');
  const files = await readdir(outputDir);
  const slugs = files
    .filter((name) => /\.png$/i.test(name))
    .map((name) => path.parse(name).name)
    .sort();

  const contents = `// Auto-generated by scripts/process-avatars.mjs — do not edit by hand.
export const AVAILABLE_AVATARS = new Set([${slugs.map((slug) => `'${slug}'`).join(', ')}]);
`;
  await writeFile(manifestPath, contents);
  console.log(`Updated lib/league/avatarManifest.ts (${slugs.length} avatar${slugs.length === 1 ? '' : 's'})`);
}

main();
