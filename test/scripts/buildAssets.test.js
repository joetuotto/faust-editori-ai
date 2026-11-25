/**
 * @jest-environment node
 */
// The stylesheets of the page and the build's asset lists name the same files (final pass F, T-012):
// index.html links them, scripts/post-build.js copies them to dist, scripts/verify-assets.js requires
// them there, and no stylesheet lies in styles/ unlinked. The Tyylinäyte loads what the app loads.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const { CRITICAL_FILES } = require('../../scripts/post-build.js');
const { REQUIRED_ASSETS } = require('../../scripts/verify-assets.js');

// The local stylesheets a page links, in order, as paths from the repository root
const localSheets = (html) => [...html.matchAll(/<link\b[^>]*>/g)]
  .map((match) => match[0])
  .filter((tag) => /\brel="stylesheet"/.test(tag))
  .map((tag) => (tag.match(/\bhref="([^"]+)"/) || [])[1])
  .filter((href) => href && !/^https?:/.test(href))
  .map((href) => href.replace(/^\.\//, ''));
const fontRequest = (html) => (html.match(/href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/) || [])[1];

test('the stylesheets index.html links are the ones post-build copies and verify-assets requires, and no other lies in styles/', () => {
  const linked = localSheets(read('index.html'));
  expect(linked.length).toBeGreaterThan(0);
  for (const file of linked) expect(fs.existsSync(path.join(ROOT, file))).toBe(true);

  const copied = CRITICAL_FILES.filter((row) => row.src.endsWith('.css'));
  expect(copied.map((row) => row.src)).toEqual(linked);
  expect(copied.map((row) => row.dst)).toEqual(linked.map((file) => 'dist/' + file));
  expect(REQUIRED_ASSETS.filter((asset) => asset.endsWith('.css'))).toEqual(linked.map((file) => 'dist/' + file));

  const onDisk = fs.readdirSync(path.join(ROOT, 'styles')).filter((name) => name.endsWith('.css') && !name.startsWith('._'));
  expect(onDisk.sort()).toEqual(linked.map((file) => path.basename(file)).sort());
  expect(onDisk).not.toContain('faust-theme.css');
});

test('the Tyylinäyte links the same stylesheets and fonts as index.html, and IBM Plex Mono is asked for upright only', () => {
  const app = read('index.html');
  const sample = read('tyylinayte.html');
  expect(localSheets(sample)).toEqual(localSheets(app));
  expect(fontRequest(app)).toBeDefined();
  expect(fontRequest(sample)).toBe(fontRequest(app));

  const families = Object.fromEntries(fontRequest(app).split('?')[1].split('&')
    .filter((part) => part.startsWith('family='))
    .map((part) => part.slice('family='.length).split(':')));
  expect(families['EB+Garamond']).toBe('ital,wght@0,400..800;1,400..800');
  expect(families['IBM+Plex+Mono']).toBe('wght@400;500;600');
});
