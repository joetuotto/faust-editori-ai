/**
 * Renders the app icon from build/icons/*.svg into every format the
 * packages need. The outputs are committed, so this only runs when the
 * artwork changes: npm run icons  (needs Playwright's Chromium:
 * npx playwright install chromium).
 *
 *   build/icons/icon.icns        macOS (Dock, Finder, DMG)
 *   build/icons/icon.ico         Windows
 *   build/icons/png/NxN.png      Linux icon set and the window icon
 *
 * Sizes up to 64 px use the simplified star-only artwork, which stays
 * legible in Finder lists and title bars; larger sizes use the full icon.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const iconsDir = path.join(root, 'build', 'icons');
const SMALL_MAX = 64;

/** EB Garamond for the name on the icon, from the bundled font package */
function fontFace() {
  try {
    const file = require.resolve('@fontsource/eb-garamond/files/eb-garamond-latin-600-normal.woff2');
    const data = fs.readFileSync(file).toString('base64');
    return `@font-face { font-family: 'EB Garamond'; font-weight: 600; src: url(data:font/woff2;base64,${data}) format('woff2'); }`;
  } catch {
    return '';
  }
}

/**
 * Draws the SVG on a canvas in a hidden window and returns PNGs for the given
 * sizes. Canvas output keeps the transparent margin on every platform, and no
 * screen capture is needed (works headless too).
 */
async function render(browser, svgFile, sizes) {
  let svg = fs.readFileSync(path.join(iconsDir, svgFile), 'utf-8').replace(/<\?xml[^>]*>/, '');
  // An SVG drawn as an image cannot load fonts from outside, so embed it
  svg = svg.replace(/(<svg[^>]*>)/, `$1<style>${fontFace()}</style>`);
  const page = await browser.newPage();
  const result = await page.evaluate(`(async () => {
    const svg = ${JSON.stringify(svg)};
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    await img.decode();
    // Halve step by step from 2048 for smooth small sizes
    const base = document.createElement('canvas');
    base.width = base.height = 2048;
    base.getContext('2d').drawImage(img, 0, 0, 2048, 2048);
    const out = {};
    for (const size of ${JSON.stringify(sizes)}) {
      let src = base;
      while (src.width / 2 >= size) {
        const half = document.createElement('canvas');
        half.width = half.height = src.width / 2;
        const ctx = half.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(src, 0, 0, half.width, half.height);
        src = half;
      }
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, 0, 0, size, size);
      out[size] = c.toDataURL('image/png').split(',')[1];
    }
    return out;
  })()`);
  await page.close();
  return Object.fromEntries(Object.entries(result).map(([size, b64]) => [size, Buffer.from(b64, 'base64')]));
}

let images = {};

function png(size) {
  return images[size];
}

/** ICNS with PNG entries (supported since OS X 10.7) */
function icns() {
  const entries = [
    ['icp4', 16], ['icp5', 32], ['ic11', 32], ['ic12', 64],
    ['ic07', 128], ['ic13', 256], ['ic08', 256], ['ic14', 512], ['ic09', 512], ['ic10', 1024]
  ];
  const chunks = entries.map(([type, size]) => {
    const data = png(size);
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  });
  const header = Buffer.alloc(8);
  header.write('icns', 0, 'ascii');
  header.writeUInt32BE(8 + chunks.reduce((n, c) => n + c.length, 0), 4);
  return Buffer.concat([header, ...chunks]);
}

/** ICO with PNG entries (Windows Vista and newer) */
function ico() {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = sizes.map(size => png(size));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = 6 + 16 * sizes.length;
  const dir = sizes.map((size, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(pngs[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    return e;
  });
  return Buffer.concat([header, ...dir, ...pngs]);
}

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    const all = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
    const small = await render(browser, 'faust-icon-small.svg', all.filter(n => n <= SMALL_MAX));
    const full = await render(browser, 'faust-icon.svg', all.filter(n => n > SMALL_MAX));
    images = { ...small, ...full };
    const pngDir = path.join(iconsDir, 'png');
    fs.mkdirSync(pngDir, { recursive: true });
    for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
      fs.writeFileSync(path.join(pngDir, `${size}x${size}.png`), png(size));
    }
    fs.writeFileSync(path.join(iconsDir, 'icon.icns'), icns());
    fs.writeFileSync(path.join(iconsDir, 'icon.ico'), ico());
    console.log('Icons written to build/icons');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
