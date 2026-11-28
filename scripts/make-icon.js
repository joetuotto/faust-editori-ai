/**
 * FAUST Dock icon generator
 *
 * The icon is a dark cloth book cover with the FAUST mark (the star8 sigil of
 * src/components/icons.js) stamped on it in gold foil. It is drawn here as SVG,
 * rasterised at every iconset size with the repo's own Electron, and packed with
 * iconutil. Nothing is downloaded or installed.
 *
 *   node_modules/.bin/electron scripts/make-icon.js
 *       writes build/faust-dock-icon.iconset/*.png (all ten sizes),
 *       build/faust-dock-icon.icns, build/icon.icns (same bytes) and
 *       build/faust-icon.svg (the 1024 master)
 *
 *   ... --all-sizes
 *       packs all ten bitmaps into the icns instead of the seven of 64 px and up.
 *       Seven is the default because macOS 26 and later draw the three small ones
 *       badly (see PACK_FROM below); ten is right for macOS 15 and earlier.
 *
 *   ... --preview <dir>
 *       writes <dir>/preview.png (contact sheet) and every size as icon-<px>.png and
 *       icon-<px>.svg; build/ is left untouched
 */

const { app, BrowserWindow } = require('electron');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

if (!app) {
  console.error('Run this with Electron: node_modules/.bin/electron scripts/make-icon.js');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Colours (styles/faust-tokens.css, theme NOX)
// ---------------------------------------------------------------------------

const CLOTH_LIT = '#2A251F';      // the cover where the light falls, a step above --surface-raised
const CLOTH = '#141210';          // --surface-page
const CLOTH_DEEP = '#0C0B09';     // --surface-panel
const WARM_WHITE = '#FFF3DC';     // edge light on the tile
const THREAD = '#F0E9E1';         // --text, the light threads of the cloth

const GOLD = '#C7A25A';           // --accent-line, the tooled rule
// The foil, from the top left tip of the star to the bottom right one: the highlight
// just inside the lit end and the faint return of light at the far end are what make
// it read as metal and not as a flat yellow.
const FOIL = [
  [0, '#E9CE96'],
  [0.16, '#F3DFAE'],
  [0.42, '#D3AF66'],
  [0.62, '#C39C58'],
  [0.86, '#A67D50'],              // --accent-active
  [1, '#B38B56']
];
const GOLD_EDGE = '#FBEBC2';      // bevel edge towards the light
const GOLD_SHADE = '#6F4F2B';     // bevel edge away from the light
const GOLD_GLOW = '#B68B5C';      // --accent, the warmth behind the mark
const FOIL_SMALL = ['#E6C680', '#C9A45E'];   // 64 px: two stops around #D8B56E
const GOLD_SMALL = '#D8B56E';     // 32 px: flat, lighter foil
const GOLD_TINY = '#E0BE78';      // 16 px: a step lighter, every ray pixel is mixed with the cloth

// ---------------------------------------------------------------------------
// Geometry of the 1024 master (the macOS icon grid)
// ---------------------------------------------------------------------------

const CANVAS = 1024;
const TILE = 824;                 // tile side; 100 px of margin on every side
const TILE_RADIUS = 185.4;        // continuous-corner radius of the macOS icon template
// macOS 26 and later cut every icon again, to a rounder tile of the same size. Measured
// from the system's own rendering of this icon, its corner radius is 215 to 216 in the
// terms of squirclePath(); 214.5 gives the most even gap between that edge and the rule.
// The rule follows THIS shape, because that is the edge it is seen against on current
// macOS. On macOS 11 to 15, where the tile above is shown as drawn, the gap is 46 px
// along the sides and widens to about 58 px in the corners.
const MASK_RADIUS = 214.5;
const RULE_INSET = 46;            // the tooled rule, from the tile edge (snapped per size, 46 to 48)
const RULE_WIDTH = 3;
const STAR_SIZE = 520;            // tip to tip (63 % of the tile, so the mark holds its own in the Dock); centred on the tile
// Drop shadow of the tile. These values reproduce the shadow of the system's own icons
// almost pixel for pixel (measured from Calculator's and Chess's AppIcon.icns).
const SHADOW = { blur: 17, drop: 8, opacity: 0.22 };

// The FAUST mark: star8 of src/components/icons.js, viewBox 0 0 100 100, centre 50 50.
// The geometry is used as it is and only scaled.
const STAR_PATH = 'M50 2l8 29 26-15-15 26 29 8-29 8 15 26-26-15-8 29-8-29-26 15 15-26-29-8 29-8-15-26 26 15z';
const STAR_SPAN = 96;             // tip to tip in viewBox units

// Small sizes have a drawing of their own, on the pixel grid and in pixels: no rule, grain,
// glow or bevel, and a larger star. `star` is tip to tip; the tips anti-alias away, so
// the smaller the bitmap, the larger the star is drawn. `edge` is the opacity of the light
// on the top edge, one pixel wide. `shadow` is [blur, drop, opacity]: tight, below the tile.
//
// 64 px: the tile is the macOS grid (824/1024) rounded to an even side and centred, which
// is exactly where macOS 26+ puts its own tile at 32 pt @2x. The same bitmap is what the
// system scales down for 16 to 24 pt on a Retina display, so the star sits exactly in
// the middle and nothing is fitted to single pixels.
//
// 32 and 16 px (packed only with --all-sizes, see PACK_FROM): the tile side is rounded
// to an ODD number of pixels, so the centre of the star lies on the centre of a pixel and
// each ray ends in one crisp pixel, where an even tile smears every ray over two and
// turns the 16 px star into a blob. The tile therefore sits half a pixel up and left of
// the bitmap's centre; the spare pixel is below it.
const SMALL = {
  16: { inset: 1, tile: 13, star: 10.8, gold: GOLD_TINY, edge: 0.1, shadow: [0.35, 0.6, 0.24] },
  32: { inset: 3, tile: 25, star: 17.6, gold: GOLD_SMALL, edge: 0.15, shadow: [0.6, 0.8, 0.24] },
  64: { inset: 6, tile: 52, star: 35, gold: 'url(#foil)', edge: 0.18, shadow: [1.1, 1, 0.24] }
};

// iconset file name -> bitmap size in pixels
const ICONSET = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024]
];

// Only bitmaps of this size and up go into the icns, unless --all-sizes is given.
// Measured on macOS 27.0 (icons are cut to a new tile since macOS 26):
//  - icon_16x16.png and icon_32x32.png, the 1x bitmaps, are shown shrunk inside a grey
//    container tile on a 1x display at 16 to 32 pt, whatever is drawn in them (tried:
//    this icon, plain downscales of it, other tile sizes, a full square, Apple's own
//    Calculator icns; other apps on the machine that ship such bitmaps look the same);
//  - icon_16x16@2x.png is used for 16 pt on a Retina display without a container, but
//    the system draws the tile larger there (28 px wide, not 25.75) and enlarges the
//    bitmap to fit, which blurs a pixel-fitted drawing. The 64 px bitmap scaled down
//    comes out cleaner.
// Without the three, the system makes the small sizes itself: from the 64 px bitmap on
// a Retina display, from the 128 px one on a 1x display, and never in a container.
// They are still written to the iconset folder: on macOS 15 and earlier, which show
// bitmaps as drawn, they are the better small sizes (--all-sizes).
const PACK_FROM = 64;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const n = (v) => String(Math.round(v * 1000) / 1000);

/**
 * A square with continuous corners (the "squircle" of Apple's icon grid): each
 * corner is three cubic segments that ease in and out of the straight edge
 * instead of a circular arc. The constants are those of the system's rounded rect.
 */
function squirclePath(x, y, side, radius) {
  const r = Math.min(radius, side / 2 / 1.52866483);
  // One corner, as distances from the corner point: a along the edge we arrive on,
  // b along the edge we leave on, both in units of r.
  const corner = [
    ['L', [1.52866483, 0]],
    ['C', [1.08849323, 0], [0.86840689, 0], [0.66993427, 0.065496]],
    ['L', [0.63149399, 0.074911]],
    ['C', [0.37282392, 0.16905899], [0.16905899, 0.37282392], [0.074911, 0.63149399]],
    ['L', [0.065496, 0.66993427]],
    ['C', [0, 0.86840689], [0, 1.08849323], [0, 1.52866483]]
  ];
  const x1 = x + side;
  const y1 = y + side;
  const corners = [
    ([a, b]) => [x1 - a * r, y + b * r],    // top right, arriving along the top edge
    ([a, b]) => [x1 - b * r, y1 - a * r],   // bottom right, arriving down the right edge
    ([a, b]) => [x + a * r, y1 - b * r],    // bottom left, arriving along the bottom edge
    ([a, b]) => [x + b * r, y + a * r]      // top left, arriving up the left edge
  ];
  let d = `M${n(x + 1.52866483 * r)} ${n(y)}`;
  for (const place of corners) {
    for (const [cmd, ...points] of corner) {
      d += cmd + points.map((p) => place(p).map(n).join(' ')).join(' ');
    }
  }
  return d + 'Z';
}

/** transform that puts the 100-unit star with its centre on (cx, cy), `size` from tip to tip */
function starTransform(cx, cy, size) {
  const s = size / STAR_SPAN;
  return `translate(${n(cx - 50 * s)} ${n(cy - 50 * s)}) scale(${n(s)})`;
}

/** '#RRGGBB' -> 'r 0 0 0 .. ' rows of an feColorMatrix that paints this colour */
function matrixColour(hex) {
  return [1, 3, 5].map((i) => `0 0 0 0 ${n(parseInt(hex.slice(i, i + 2), 16) / 255)}`).join('  ');
}

const stops = (list) => list.map(([at, colour]) => `      <stop offset="${at}" stop-color="${colour}"/>`).join('\n');

// ---------------------------------------------------------------------------
// The large drawing: 128 px and up
// ---------------------------------------------------------------------------

/**
 * @param {number} px bitmap size the drawing is made for. The picture is the same at
 *   every size; only what would fall between pixels is adjusted: the rule is centred on
 *   a row of pixels and keeps a minimum width, the bevel keeps a minimum width, and the
 *   cloth grain is left out where it could not be seen.
 */
function largeSvg(px) {
  const unit = CANVAS / px;                       // one device pixel in drawing units
  const m = (CANVAS - TILE) / 2;
  const c = CANVAS / 2;
  const tile = squirclePath(m, m, TILE, TILE_RADIUS);
  const ruleInset = (Math.floor((m + RULE_INSET) / unit) + 0.5) * unit - m;
  const rule = squirclePath(m + ruleInset, m + ruleInset, TILE - 2 * ruleInset, MASK_RADIUS - ruleInset);
  const ruleWidth = Math.max(RULE_WIDTH, 0.85 * unit);
  const bevel = Math.max(1.6, 0.55 * unit);       // width of the bevel edge
  const grain = px >= 512;
  const grainGain = px >= CANVAS ? 1 : 0.55;      // at half size the threads are finer than a pixel and must fade, not alias
  const lightY = m + TILE * 0.3;                  // where the light falls on the cover
  const lightR = TILE * 0.8;
  const star = starTransform(c, c, STAR_SIZE);
  const k = STAR_SPAN / STAR_SIZE;                // drawing units -> star units

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <title>FAUST</title>
  <defs>
    <clipPath id="tile-clip"><path d="${tile}"/></clipPath>
    <!-- the cover: lit from above the middle, falling to near black at the bottom and corners -->
    <radialGradient id="cloth" gradientUnits="userSpaceOnUse" cx="${c}" cy="${n(lightY)}" r="${n(lightR)}">
      <stop offset="0" stop-color="${CLOTH_LIT}"/>
      <stop offset="0.52" stop-color="${CLOTH}"/>
      <stop offset="1" stop-color="${CLOTH_DEEP}"/>
    </radialGradient>
    <linearGradient id="edge-light" gradientUnits="userSpaceOnUse" x1="0" y1="${m}" x2="0" y2="${c}">
      <stop offset="0" stop-color="${WARM_WHITE}" stop-opacity="0.16"/>
      <stop offset="0.35" stop-color="${WARM_WHITE}" stop-opacity="0.07"/>
      <stop offset="1" stop-color="${WARM_WHITE}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="edge-shade" gradientUnits="userSpaceOnUse" x1="0" y1="${c}" x2="0" y2="${m + TILE}">
      <stop offset="0" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.55"/>
    </linearGradient>
    <filter id="tile-shadow" filterUnits="userSpaceOnUse" x="0" y="0" width="${CANVAS}" height="${CANVAS}">
      <feGaussianBlur stdDeviation="${SHADOW.blur}"/>
      <feOffset dy="${SHADOW.drop}"/>
      <feComponentTransfer><feFuncA type="linear" slope="${SHADOW.opacity}"/></feComponentTransfer>
    </filter>${grain ? `
    <!-- book cloth: two sets of threads, across and down, as light and dark specks that
         leave the tone as it is. The weave shows where the light falls and sinks into
         the dark towards the corners. -->
    <filter id="cloth-grain" filterUnits="userSpaceOnUse" x="${m}" y="${m}" width="${TILE}" height="${TILE}" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.035 0.7" numOctaves="2" seed="4" result="weft"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.7 0.035" numOctaves="2" seed="9" result="warp"/>
      <feComposite in="weft" in2="warp" operator="arithmetic" k2="0.5" k3="0.5" result="weave"/>
      <feColorMatrix in="weave" type="matrix" values="${matrixColour(THREAD)}  ${n(0.26 * grainGain)} 0 0 0 ${n(-0.13 * grainGain)}" result="light"/>
      <feColorMatrix in="weave" type="matrix" values="${matrixColour('#000000')}  ${n(-grainGain)} 0 0 0 ${n(0.5 * grainGain)}" result="dark"/>
      <feMerge><feMergeNode in="dark"/><feMergeNode in="light"/></feMerge>
    </filter>
    <radialGradient id="cloth-lit" gradientUnits="userSpaceOnUse" cx="${c}" cy="${n(lightY)}" r="${n(lightR)}">
      <stop offset="0" stop-color="#fff"/>
      <stop offset="1" stop-color="#666"/>
    </radialGradient>
    <mask id="cloth-light" maskUnits="userSpaceOnUse" x="${m}" y="${m}" width="${TILE}" height="${TILE}">
      <rect x="${m}" y="${m}" width="${TILE}" height="${TILE}" fill="url(#cloth-lit)"/>
    </mask>` : ''}
    <!-- gold foil, lit from the top left; in the star's own units, like the star itself -->
    <linearGradient id="foil" gradientUnits="userSpaceOnUse" x1="16" y1="16" x2="84" y2="84">
${stops(FOIL)}
    </linearGradient>
    <radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="${c}" cy="${c}" r="${n(STAR_SIZE * 0.78)}">
      <stop offset="0" stop-color="${GOLD_GLOW}" stop-opacity="0.13"/>
      <stop offset="0.55" stop-color="${GOLD_GLOW}" stop-opacity="0.045"/>
      <stop offset="1" stop-color="${GOLD_GLOW}" stop-opacity="0"/>
    </radialGradient>
    <filter id="star-shadow" filterUnits="userSpaceOnUse" x="0" y="0" width="${CANVAS}" height="${CANVAS}">
      <feGaussianBlur stdDeviation="5"/>
      <feOffset dx="2" dy="6"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.6"/></feComponentTransfer>
    </filter>
    <!-- the bevel: the part of the star that a copy shifted away from, or towards, the light leaves uncovered -->
    <mask id="bevel-light" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
      <path d="${STAR_PATH}" fill="#fff"/>
      <path d="${STAR_PATH}" fill="#000" transform="translate(${n(bevel * k)} ${n(bevel * k)})"/>
    </mask>
    <mask id="bevel-shade" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
      <path d="${STAR_PATH}" fill="#fff"/>
      <path d="${STAR_PATH}" fill="#000" transform="translate(${n(-bevel * k)} ${n(-bevel * k)})"/>
    </mask>
  </defs>

  <!-- tile: shadow, cloth, grain, edge light and shade -->
  <path d="${tile}" fill="#000" filter="url(#tile-shadow)"/>
  <path d="${tile}" fill="url(#cloth)"/>
  <g clip-path="url(#tile-clip)">${grain ? `
    <g mask="url(#cloth-light)">
      <rect x="${m}" y="${m}" width="${TILE}" height="${TILE}" fill="#000" fill-opacity="0" filter="url(#cloth-grain)"/>
    </g>` : ''}
    <path d="${tile}" fill="none" stroke="url(#edge-shade)" stroke-width="${n(Math.max(8, 2 * unit))}"/>
    <path d="${tile}" fill="none" stroke="url(#edge-light)" stroke-width="${n(Math.max(4, 2 * unit))}"/>
  </g>

  <!-- the tooled rule -->
  <path d="${rule}" fill="none" stroke="${GOLD}" stroke-opacity="0.55" stroke-width="${n(ruleWidth)}"/>

  <!-- the mark: glow, shadow, foil, bevel -->
  <circle cx="${c}" cy="${c}" r="${n(STAR_SIZE * 0.78)}" fill="url(#glow)"/>
  <path d="${STAR_PATH}" transform="${star}" fill="#000" filter="url(#star-shadow)"/>
  <path d="${STAR_PATH}" transform="${star}" fill="url(#foil)"/>
  <g transform="${star}">
    <path d="${STAR_PATH}" fill="${GOLD_SHADE}" fill-opacity="0.55" mask="url(#bevel-shade)"/>
    <path d="${STAR_PATH}" fill="${GOLD_EDGE}" fill-opacity="0.9" mask="url(#bevel-light)"/>
  </g>
</svg>
`;
}

// ---------------------------------------------------------------------------
// The small drawing: 16, 32 and 64 px
// ---------------------------------------------------------------------------

function smallSvg(px) {
  const { inset: m, tile: side, star: starSize, gold, edge, shadow: [blur, drop, opacity] } = SMALL[px];
  const c = m + side / 2;                         // centre of the tile
  const tile = squirclePath(m, m, side, side * TILE_RADIUS / TILE);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">
  <defs>
    <clipPath id="tile-clip"><path d="${tile}"/></clipPath>
    <linearGradient id="cloth" gradientUnits="userSpaceOnUse" x1="0" y1="${m}" x2="0" y2="${m + side}">
      <stop offset="0" stop-color="${CLOTH_LIT}"/>
      <stop offset="1" stop-color="${CLOTH}"/>
    </linearGradient>
    <linearGradient id="edge-light" gradientUnits="userSpaceOnUse" x1="0" y1="${m}" x2="0" y2="${c}">
      <stop offset="0" stop-color="${WARM_WHITE}" stop-opacity="${edge}"/>
      <stop offset="1" stop-color="${WARM_WHITE}" stop-opacity="0"/>
    </linearGradient>
    <!-- in the star's own units, like the star itself -->
    <linearGradient id="foil" gradientUnits="userSpaceOnUse" x1="16" y1="16" x2="84" y2="84">
${stops([[0, FOIL_SMALL[0]], [1, FOIL_SMALL[1]]])}
    </linearGradient>
    <filter id="tile-shadow" filterUnits="userSpaceOnUse" x="0" y="0" width="${px}" height="${px}">
      <feGaussianBlur stdDeviation="${blur}"/>
      <feOffset dy="${drop}"/>
      <feComponentTransfer><feFuncA type="linear" slope="${opacity}"/></feComponentTransfer>
    </filter>
  </defs>
  <path d="${tile}" fill="#000" filter="url(#tile-shadow)"/>
  <path d="${tile}" fill="url(#cloth)"/>
  <path d="${tile}" fill="none" stroke="url(#edge-light)" stroke-width="2" clip-path="url(#tile-clip)"/>
  <path d="${STAR_PATH}" transform="${starTransform(c, c, starSize)}" fill="${gold}"/>
</svg>
`;
}

const svgFor = (px) => (SMALL[px] ? smallSvg(px) : largeSvg(px));

// ---------------------------------------------------------------------------
// Rasterising
// ---------------------------------------------------------------------------

/**
 * SVG -> PNG in a hidden page: the SVG is decoded as an image and drawn on a canvas of
 * exactly px by px. This gives the same sRGB pixels on every machine; a window capture
 * would depend on the display's scale factor and colour profile.
 */
async function rasterise(win, svg, px) {
  const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const url = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image();
    img.src = ${JSON.stringify(src)};
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = ${px};
    canvas.getContext('2d').drawImage(img, 0, 0, ${px}, ${px});
    return canvas.toDataURL('image/png');
  })()`);
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
}

/**
 * Contact sheet for review: every size on a light and on a dark ground, the small
 * ones also enlarged four times without smoothing. These are the bitmaps as drawn;
 * macOS 26+ cuts them to its own tile shape and adds its own edge light when it
 * shows them.
 */
async function contactSheet(win, pngs) {
  const urls = {};
  for (const px of Object.keys(pngs)) urls[px] = 'data:image/png;base64,' + pngs[px].toString('base64');
  const url = await win.webContents.executeJavaScript(`(async () => {
    const urls = ${JSON.stringify(urls)};
    const imgs = {};
    for (const px of Object.keys(urls)) {
      imgs[px] = new Image();
      imgs[px].src = urls[px];
      await imgs[px].decode();
    }
    // [size, zoom] left to right
    const cells = [[512, 1], [256, 1], [128, 1], [64, 1], [64, 4], [32, 1], [32, 4], [16, 1], [16, 4]];
    const gap = 13, pad = 20, label = 26, rowH = 512 + label + 2 * pad;
    const W = 1600, H = 2 * rowH;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    [['#E8E4DC', '#3A362F'], ['#1E1E1E', '#B8B2A6']].forEach(([ground, ink], row) => {
      const top = row * rowH;
      ctx.fillStyle = ground;
      ctx.fillRect(0, top, W, rowH);
      ctx.fillStyle = ink;
      ctx.font = '13px -apple-system, Helvetica, sans-serif';
      ctx.textBaseline = 'top';
      let x = pad;
      for (const [px, zoom] of cells) {
        const side = px * zoom;
        const y = top + pad + (512 - side);          // bottoms aligned
        ctx.drawImage(imgs[px], x, y, side, side);
        ctx.fillText(zoom === 1 ? String(px) : px + ' x' + zoom, x, top + pad + 512 + 8);
        x += side + gap;
      }
    });
    return canvas.toDataURL('image/png');
  })()`);
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const BUILD = path.join(__dirname, '..', 'build');
const previewAt = process.argv.indexOf('--preview');
const previewDir = previewAt >= 0 ? process.argv[previewAt + 1] : null;
const allSizes = process.argv.includes('--all-sizes');

// A profile of our own, so a running FAUST or Electron is not disturbed. Chromium keeps
// a few small state files in it and writes them once more after this script has ended,
// so the folder cannot be removed from here: one fixed folder in the temp directory is
// reused on every run instead.
app.setPath('userData', path.join(os.tmpdir(), 'faust-make-icon-profile'));
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('force-color-profile', 'srgb');
if (app.dock) app.dock.hide();

async function main() {
  const win = new BrowserWindow({ show: false, width: 64, height: 64, webPreferences: { offscreen: true } });
  await win.loadURL('about:blank');

  const pngs = {};
  for (const px of [...new Set(ICONSET.map(([, size]) => size))]) {
    pngs[px] = await rasterise(win, svgFor(px), px);
  }

  if (previewDir) {
    fs.mkdirSync(previewDir, { recursive: true });
    fs.writeFileSync(path.join(previewDir, 'preview.png'), await contactSheet(win, pngs));
    for (const px of Object.keys(pngs)) {
      fs.writeFileSync(path.join(previewDir, `icon-${px}.png`), pngs[px]);
      fs.writeFileSync(path.join(previewDir, `icon-${px}.svg`), svgFor(Number(px)));
    }
    console.log('preview written to ' + previewDir);
    return;
  }

  const iconset = path.join(BUILD, 'faust-dock-icon.iconset');
  const icns = path.join(BUILD, 'faust-dock-icon.icns');
  // iconutil packs whatever is in the folder it is given, so the bitmaps to pack get a folder of their own
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'faust-make-icon-'));
  const packing = path.join(temp, 'faust.iconset');
  fs.mkdirSync(iconset, { recursive: true });
  fs.mkdirSync(packing);
  const packed = [];
  try {
    for (const [name, px] of ICONSET) {
      fs.writeFileSync(path.join(iconset, name), pngs[px]);
      if (allSizes || px >= PACK_FROM) {
        fs.writeFileSync(path.join(packing, name), pngs[px]);
        packed.push(name);
      }
    }
    execFileSync('iconutil', ['-c', 'icns', packing, '-o', icns], { stdio: 'inherit' });
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
  fs.copyFileSync(icns, path.join(BUILD, 'icon.icns'));       // packaged by the "build/icon.*" entry of package.json
  fs.writeFileSync(path.join(BUILD, 'faust-icon.svg'), largeSvg(CANVAS));
  console.log(`icon written: ${icns} (${packed.length} bitmaps: ${packed.join(', ')})`);
}

app.whenReady()
  .then(main)
  .then(() => 0, (err) => { console.error(err); return 1; })
  .then((code) => app.exit(code));
