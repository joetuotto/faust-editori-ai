// Askeleen 0 mallikoe 16.11.2026. Uusinta: python3 <withkey.py> CHERRY_API_KEY node scripts/step0/run.js --tag <nimi>; sitten node scripts/step0/score.js --tag <nimi>.
//
// Kokoaa ajojen yhteenvedot tulostiedostoa varten: yhdistetty taulukko, päättelyn pituus ja korjausosuus,
// tokenien tarve ja vuorosanarivien luvut.
//
// Käyttö: node scripts/step0/summary.js [--data <kansio>] [--out <kansio>]
//   --data  kansio, jossa ovat scores/ ja raw/ (oletus test/fixtures/step0-gateway)
//   --out   kansio, johon yhteenveto kirjoitetaan tiedostoksi summary.md (oletus: uusi kansio
//           käyttöjärjestelmän väliaikaiskansiossa; kansioon test/fixtures ei kirjoiteta, ellei --out osoita sinne)
// Yhteenveto tulostetaan myös näytölle; tiedoston polku kerrotaan virhevirrassa, jotta tulosteen voi ohjata tiedostoon.
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) { const n = process.argv[i + 1]; if (n && !n.startsWith('--')) { args[a.slice(2)] = n; i++; } else args[a.slice(2)] = true; }
}
const DATA_DIR = path.resolve(typeof args.data === 'string' ? args.data : path.join(ROOT, 'test', 'fixtures', 'step0-gateway'));

// Kaikki tulostus kulkee tämän kautta, jotta sama teksti voidaan kirjoittaa tiedostoon
const printed = [];
const say = (text) => { printed.push(text); console.log(text); };

const TAGS = ['v1', 'v1-toisto', 'v1-era28'];
const load = (tag) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'scores', tag + '.json'), 'utf8'));
const raw = (tag, model) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'raw', tag, model + '.json'), 'utf8'));
const pct = (a, b) => b ? Math.round(100 * a / b) + ' %' : '–';
const scores = Object.fromEntries(TAGS.map((t) => [t, load(t)]));
const models = scores.v1.map((s) => s.model);

say('## Kaikki ajot yhteensä (v1 + toisto + 28 rivin erä)\n');
say('| Malli | Korjattu | Väärät korjaukset | Uusiksi kirjoitetut rivit | Kohdistumattomat rivit | Paikkamerkit tallella |');
say('|---|---|---|---|---|---|');
for (const m of models) {
  let fixed = 0, planted = 0, wrong = 0, rew = 0, lines = 0, mis = 0, ph = 0, phLost = 0;
  for (const t of TAGS) { const s = scores[t].find((x) => x.model === m); fixed += s.fixed; planted += s.planted; wrong += s.wrong; rew += s.rewritten; lines += s.lines; mis += s.misaligned; ph += s.placeholders; phLost += s.placeholdersLost; }
  say(`| ${m} | ${fixed}/${planted} (${pct(fixed, planted)}) | ${wrong} | ${rew}/${lines} | ${mis}/${lines} | ${ph - phLost}/${ph} |`);
}

say('\n## Erät: päättelyn pituus, aika, tokenit ja korjausosuus\n');
say('| Ajo | Malli | Erä | Rivejä | Päättelyä (merkkiä) | Sekuntia | Tulostokenit | Vastaustekstin merkit | Tokenia per merkki | Korjattu | Omia muutoksia |');
say('|---|---|---|---|---|---|---|---|---|---|---|');
const batches = [];
for (const t of TAGS) for (const m of models) {
  const s = scores[t].find((x) => x.model === m);
  const r = raw(t, m);
  for (const b of r.batches) {
    const ds = s.details.filter((d) => b.ids.includes(d.id));
    const planted = ds.reduce((n, d) => n + d.errors.length, 0);
    const fixed = ds.reduce((n, d) => n + d.errors.filter((e) => e.result === 'korjattu').length, 0);
    const own = ds.reduce((n, d) => n + d.residual.filter((c) => !c.kind.startsWith('istutettu:')).length, 0);
    const rec = { tag: t, model: m, batch: b.batch, lines: b.ids.length, think: b.thinkingChars, sec: b.seconds, out: b.usage.output_tokens, chars: b.text.length, planted, fixed, own };
    batches.push(rec);
    say(`| ${t} | ${m} | ${b.batch} | ${rec.lines} | ${rec.think} | ${rec.sec.toFixed(1)} | ${rec.out} | ${rec.chars} | ${(rec.out / rec.chars).toFixed(2)} | ${fixed}/${planted} | ${own} |`);
  }
}

say('\n## Päättelyn pituus ja korjausosuus (vain seitsemän rivin erät)\n');
const seven = batches.filter((b) => b.lines === 7);
for (const [label, f] of [['alle 1 000 merkkiä', (b) => b.think < 1000], ['vähintään 1 000 merkkiä', (b) => b.think >= 1000]]) {
  const g = seven.filter(f);
  const fx = g.reduce((n, b) => n + b.fixed, 0), pl = g.reduce((n, b) => n + b.planted, 0);
  const by = {};
  for (const b of g) by[b.model] = (by[b.model] || 0) + 1;
  say(`- päättelyä ${label}: ${g.length} erää, korjattu ${fx}/${pl} (${pct(fx, pl)}); erät malleittain ${JSON.stringify(by)}`);
}

say('\n## Tokenien tarve malleittain (tulostokenit / vastaustekstin merkit)\n');
for (const m of models) {
  const g = batches.filter((b) => b.model === m);
  const ratios = g.map((b) => b.out / b.chars);
  const g7 = g.filter((b) => b.lines === 7);
  const secs = g7.map((b) => b.sec).sort((a, b) => a - b);
  say(`- ${m}: tokenia per merkki ${Math.min(...ratios).toFixed(2)}–${Math.max(...ratios).toFixed(2)}; tulostokenit 7 rivin erässä ${Math.min(...g7.map((b) => b.out))}–${Math.max(...g7.map((b) => b.out))}, 28 rivin erässä ${g.filter((b) => b.lines === 28).map((b) => b.out).join(', ')}; sekuntia 7 rivin erässä ${secs[0].toFixed(1)}–${secs[secs.length - 1].toFixed(1)} (mediaani ${((secs[3] + secs[4]) / 2).toFixed(1)}), 28 rivin erässä ${g.filter((b) => b.lines === 28).map((b) => b.sec.toFixed(1)).join(', ')}`);
}

say('\n## Vuorosanarivit (7 riviä ja 4 aitoa lyöntivirhettä per ajo)\n');
say('| Malli | Ajo | Lyöntivirheet korjattu | Murremuotoja muutettu | Muutetut muodot |');
say('|---|---|---|---|---|');
for (const m of models) for (const t of TAGS) {
  const s = scores[t].find((x) => x.model === m);
  const ds = s.details.filter((d) => d.genre === 'vuorosana');
  const planted = ds.reduce((n, d) => n + d.errors.length, 0);
  const fixed = ds.reduce((n, d) => n + d.errors.filter((e) => e.result === 'korjattu').length, 0);
  const own = ds.flatMap((d) => d.residual.filter((c) => !c.kind.startsWith('istutettu:')).map((c) => `${c.clean} → ${c.got}`));
  say(`| ${m} | ${t} | ${fixed}/${planted} | ${own.length} | ${own.join('; ') || '–'} |`);
}

say('\n## Mallien omat muutokset muualla kuin vuorosanoissa\n');
for (const m of models) for (const t of TAGS) {
  const s = scores[t].find((x) => x.model === m);
  for (const d of s.details.filter((x) => x.genre !== 'vuorosana')) for (const c of d.residual.filter((x) => !x.kind.startsWith('istutettu:'))) say(`- ${m}, ${t}, ${d.id}: ${c.clean} → ${c.got} (${c.kind})`);
}

say('\n## Istutetut virheet, joita ei korjattu (kuinka monessa 12 malliajosta)\n');
const miss = {};
for (const t of TAGS) for (const s of scores[t]) for (const d of s.details) for (const e of d.errors) if (e.result !== 'korjattu') { const k = `${d.id} ${e.type}: ${e.wrong} → ${e.right}`; miss[k] = (miss[k] || 0) + 1; }
for (const [k, n] of Object.entries(miss).sort((a, b) => b[1] - a[1])) say(`- ${n}/12: ${k}`);

say('\n## Tyypeittäin, kaikki ajot\n');
say('| Malli | yhdyssana | pilkku | kongruenssi | oikeinkirjoitus | typografia |');
say('|---|---|---|---|---|---|');
for (const m of models) {
  const acc = {};
  for (const t of TAGS) { const s = scores[t].find((x) => x.model === m); for (const [k, v] of Object.entries(s.byType)) { acc[k] = acc[k] || { f: 0, p: 0 }; acc[k].f += v.fixed; acc[k].p += v.planted; } }
  say(`| ${m} | ` + ['yhdyssana', 'pilkku', 'kongruenssi', 'oikeinkirjoitus', 'typografia'].map((k) => `${acc[k].f}/${acc[k].p}`).join(' | ') + ' |');
}

const OUT_DIR = typeof args.out === 'string' ? path.resolve(args.out) : fs.mkdtempSync(path.join(os.tmpdir(), 'faust-step0-'));
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'summary.md'), printed.join('\n') + '\n');
console.error(`Kirjoitettu: ${path.join(OUT_DIR, 'summary.md')}`);
