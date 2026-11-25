#!/usr/bin/env node
/**
 * scripts/check-tokens.js - keeps the FAUST token system closed.
 *
 * Fails when
 *   1. a var(--name) used in app.js, src/** or styles/** is not declared in the token file
 *      (or in the component stylesheet), which is the defect that made 169 surfaces transparent;
 *   2. the count of a debt item in any file is HIGHER than in the checked-in allowlist:
 *      colour literals (hex, rgb(), rgba()) outside the token file, bare font names,
 *      pixel font sizes, `transition: all`, alert( and confirm( calls, pictographs and
 *      symbol glyphs used as icons.
 * The allowlist (scripts/token-allowlist.json) is a baseline of today's counts per file. It may
 * only shrink: run with --update after a region has been migrated, never to admit new debt.
 *
 *   node scripts/check-tokens.js                 check
 *   node scripts/check-tokens.js --update        rewrite the allowlist with the current (lower) counts
 *   node scripts/check-tokens.js --root <repo> --css <dir with faust-tokens.css> --allow <json>
 */
const fs = require('fs');
const path = require('path');
const arg = (name, def) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : def; };
const ROOT = path.resolve(arg('--root', path.join(__dirname, '..')));
const CSS = path.resolve(arg('--css', path.join(ROOT, 'styles')));
const ALLOW = path.resolve(arg('--allow', path.join(ROOT, 'scripts', 'token-allowlist.json')));
const UPDATE = process.argv.includes('--update');

const walk = (dir, exts, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { if (f !== 'node_modules') walk(p, exts, out); }
    else if (exts.some(x => f.endsWith(x))) out.push(p);
  }
  return out;
};
const noComments = (t, css) => css ? t.replace(/\/\*[\s\S]*?\*\//g, '') : t;
const TOKEN_FILES = ['faust-tokens.css', 'faust-components.css'].map(f => path.join(CSS, f)).filter(fs.existsSync);
const files = [path.join(ROOT, 'app.js'), ...walk(path.join(ROOT, 'src'), ['.js', '.jsx', '.css']), ...walk(path.join(ROOT, 'styles'), ['.css'])]
  .filter(fs.existsSync).filter(f => !f.endsWith('faust-theme.css'));          // the legacy theme file (emptied in XR-15, deleted with its link in the final pass): matches nothing now

// 1. undefined custom properties. Declarations count from the token and component files, from the
//    legacy theme file if it exists (it no longer does), and from names the JS sets inline ('--fe-pad-top': ...).
const declared = new Set();
const LEGACY_THEME = path.join(ROOT, 'styles', 'faust-theme.css');
for (const f of [...TOKEN_FILES, ...(fs.existsSync(LEGACY_THEME) ? [LEGACY_THEME] : [])])
  for (const m of noComments(fs.readFileSync(f, 'utf8'), true).matchAll(/(?<![\w-])(--[\w-]+)\s*:/g)) declared.add(m[1]);
for (const f of files.filter(f => /\.jsx?$/.test(f)))
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/['"](--[\w-]+)['"]\s*:/g)) declared.add(m[1]);
// Names a recipe expects to be set per element (--value, --stripe, --depth, --n, --from, --to, --thread,
// --popover-max-h): allowed only inside the two token files, and only if EVERY use there has a fallback.
const LOCAL = new Set();
{
  const uses = {};
  for (const f of TOKEN_FILES) for (const m of noComments(fs.readFileSync(f, 'utf8'), true).matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)) (uses[m[1]] = uses[m[1]] || []).push(m[2]);
  for (const [name, seps] of Object.entries(uses)) if (!declared.has(name) && seps.every(s => s === ',')) LOCAL.add(name);
}
const undefinedUses = [];
for (const f of [...files, ...TOKEN_FILES]) {
  const t = noComments(fs.readFileSync(f, 'utf8'), f.endsWith('.css'));
  for (const m of t.matchAll(/var\(\s*(--[\w-]+)/g)) if (!declared.has(m[1]) && !(LOCAL.has(m[1]) && TOKEN_FILES.includes(f))) undefinedUses.push(`${path.relative(ROOT, f)}: ${m[1]}`);
}

// 2. debt counters
const RULES = {
  colourLiteral: /#[0-9a-fA-F]{3,8}\b(?![\w-])|rgba?\([^)]*\)/g,
  bareFontName: /fontFamily:\s*['"]\s*'?(IBM Plex Mono|EB Garamond)'?\s*['"]/g,
  pixelFontSize: /fontSize:\s*['"`]?\d+(\.\d+)?px/g,
  transitionAll: /transition:\s*['"]?all\b/g,
  alertCall: /(?<![\w.])alert\(/g,
  confirmCall: /(?<![\w.])confirm\(/g,
  pictograph: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F700}-\u{1F77F}]/gu
};
const counts = {};
for (const f of files) {
  if (TOKEN_FILES.includes(f)) continue;
  const rel = path.relative(ROOT, f);
  const t = noComments(fs.readFileSync(f, 'utf8'), f.endsWith('.css'));
  for (const [name, re] of Object.entries(RULES)) {
    const n = (t.match(re) || []).length;
    if (n) (counts[rel] = counts[rel] || {})[name] = n;
  }
}
// the component stylesheet itself must be clean
for (const f of TOKEN_FILES.filter(f => f.endsWith('faust-components.css'))) {
  const n = (noComments(fs.readFileSync(f, 'utf8'), true).replace(/\[style[^\]]*\]/g, '').match(RULES.colourLiteral) || []).length;   // an attribute selector quoting a serialised style is not a colour
  if (n) (counts[path.basename(f)] = {}).colourLiteral = n;
}

const totals = {};
for (const c of Object.values(counts)) for (const [k, v] of Object.entries(c)) totals[k] = (totals[k] || 0) + v;

if (UPDATE) {
  fs.writeFileSync(ALLOW, JSON.stringify(counts, null, 2) + '\n');
  console.log('allowlist written:', ALLOW, totals);
  process.exit(undefinedUses.length ? 1 : 0);
}
const allow = fs.existsSync(ALLOW) ? JSON.parse(fs.readFileSync(ALLOW, 'utf8')) : null;
const grew = [];
if (allow) {
  for (const [file, c] of Object.entries(counts)) for (const [k, v] of Object.entries(c)) {
    const was = (allow[file] || {})[k] || 0;
    if (v > was) grew.push(`${file}: ${k} ${was} -> ${v}`);
  }
}
console.log('undefined custom properties:', new Set(undefinedUses.map(u => u.split(': ')[1])).size, 'names,', undefinedUses.length, 'uses');
const byName = {};
for (const u of undefinedUses) { const n = u.split(': ')[1]; byName[n] = (byName[n] || 0) + 1; }
Object.entries(byName).sort((a, b) => b[1] - a[1]).forEach(([n, c]) => console.log('  ' + n + '  ' + c));
console.log('debt totals:', JSON.stringify(totals));
if (!allow) console.log('no allowlist yet: run with --update once to record the baseline');
else if (grew.length) { console.log('debt grew (not allowed):'); grew.forEach(g => console.log('  ' + g)); }
else console.log('no debt item grew against the allowlist');
process.exit(undefinedUses.length || grew.length ? 1 : 0);
