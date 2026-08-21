// Renders the same violet-bg + white-crest mark as app/icon.svg to the raster
// PNG sizes app/manifest.ts references — Next's icon.svg convention covers
// the browser tab, but PWA install icons need real bitmaps.
import path from 'node:path';
import sharp from 'sharp';

const SOURCE_SVG = path.resolve(import.meta.dirname, '../app/icon.svg');
const SIZES = [192, 512];

async function main() {
  const outputDir = path.resolve(import.meta.dirname, '../public');

  for (const size of SIZES) {
    const outputPath = path.join(outputDir, `icon-${size}.png`);
    await sharp(SOURCE_SVG).resize(size, size).png().toFile(outputPath);
    console.log(`app/icon.svg -> public/icon-${size}.png`);
  }
}

main();
