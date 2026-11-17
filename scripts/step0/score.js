// Askeleen 0 mallikoe 16.11.2026. Uusinta: python3 <withkey.py> CHERRY_API_KEY node scripts/step0/run.js --tag <nimi>; sitten node scripts/step0/score.js --tag <nimi>.
//
// Askeleen 0 pisteytys. Lukee dataset.json ja raw/<tunniste>/<malli>.json, kirjoittaa scores/<tunniste>.json
// ja tulostaa taulukon sekä tarkistettavat yksityiskohdat.
//
// Käyttö: node scripts/step0/score.js --tag v1 [--details] [--data <kansio>] [--out <kansio>]
//   --data  kansio, jossa on dataset.json ja tallessa olevat raakavastaukset (oletus test/fixtures/step0-gateway)
//   --out   kansio, johon scores/<tunniste>.json kirjoitetaan (oletus: uusi kansio käyttöjärjestelmän
//           väliaikaiskansiossa; kansioon test/fixtures ei kirjoiteta, ellei --out osoita sinne)
// Raakavastaukset raw/<tunniste> haetaan ensin --out-kansiosta, sitten --data-kansiosta ja viimeksi
// run.js:n uusimmasta väliaikaiskansiosta, jossa tunniste on; silloin pisteet kirjoitetaan samaan kansioon.
//
// Määritelmät:
// - Istutettu virhe on korjattu, kun vastausrivillä on oikea muoto eikä väärää muotoa (sanarajoin).
// - Muutos = yhtenäinen muuttunut jakso sanatason diffissä (LCS sanoista, välimerkeistä ja väleistä).
// - Väärät korjaukset lasketaan vertaamalla vastausta virheettömään versioon (clean): jokainen jäljelle jäävä
//   ero on joko korjaamatta jäänyt istutettu virhe tai mallin oma muutos. Väärä korjaus = mallin oma muutos,
//   joka ei ole pelkkä typografinen merkinvaihto, tai istutetun virheen kohta, joka on muutettu muuksi kuin
//   oikeaksi muodoksi. Peräkkäiset muutetut sanat lasketaan yhdeksi jaksoksi.
// - Typografian suoristus = ” → ", – → -, … → ..., ’ → ' (lasketaan erikseen).
// - Uusiksi kirjoitettu rivi = sanatason muutossuhde yli 0,3: (poistetut + lisätyt) / (sanat ennen + sanat jälkeen),
//   laskettuna typografisesti normalisoidusta tekstistä.
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_DATA_DIR = path.join(ROOT, 'test', 'fixtures', 'step0-gateway');
const RUN_DIR_PREFIX = 'faust-step0-';
const readItems = (dataDir) => JSON.parse(fs.readFileSync(path.join(dataDir, 'dataset.json'), 'utf8')).items;

// ---------- apufunktiot ----------
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const bounded = (needle) => new RegExp(
  (/^[\p{L}\p{N}]/u.test(needle) ? '(?<![\\p{L}\\p{N}])' : '') + esc(needle) + (/[\p{L}\p{N}]$/u.test(needle) ? '(?![\\p{L}\\p{N}])' : ''), 'gu');
const count = (hay, needle) => (hay.match(bounded(needle)) || []).length;
const indexOfBounded = (hay, needle) => { const m = bounded(needle).exec(hay); return m ? m.index : -1; };

// Sitova väli, kapea sitova väli ja ohuke (kirjoitettu koodeina, koska merkit eivät näy)
const NBSP_RE = /[\u00a0\u202f\u2009]/g;
const asciiTypo = (s) => s
  .replace(/[”“„»«]/g, '"').replace(/[’‘]/g, "'").replace(/[–—−]/g, '-').replace(/…/g, '...').replace(NBSP_RE, ' ');

const TOKEN_RE = /⟦\d+⟧|[\p{L}\p{N}]+(?:[-'’:][\p{L}\p{N}]+)*|\s+|[^\s]/gu;
function tokenize(s) {
  const out = [];
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(s)) !== null) out.push({ t: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}

// LCS-diffi merkkijonotaulukoille; palauttaa operaatiot [{op:'eq'|'del'|'ins', ai, bi}]
function diffOps(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ op: 'eq', ai: i, bi: j }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ op: 'del', ai: i }); i++; }
    else { ops.push({ op: 'ins', bi: j }); j++; }
  }
  while (i < n) ops.push({ op: 'del', ai: i++ });
  while (j < m) ops.push({ op: 'ins', bi: j++ });
  return ops;
}

// Muutosjaksot lähdetekstin merkkikoordinaatein
function hunks(src, out) {
  const A = tokenize(src), B = tokenize(out);
  const ops = diffOps(A.map((x) => x.t), B.map((x) => x.t));
  const res = [];
  let cur = null;
  let aPos = 0; // seuraavan lähdetokenin alku
  for (const o of ops) {
    if (o.op === 'eq') { if (cur) { res.push(cur); cur = null; } aPos = A[o.ai].end; continue; }
    if (!cur) cur = { aStart: aPos, aEnd: aPos, oldText: '', newText: '' };
    if (o.op === 'del') { cur.oldText += A[o.ai].t; cur.aEnd = A[o.ai].end; aPos = A[o.ai].end; }
    else cur.newText += B[o.bi].t;
  }
  if (cur) res.push(cur);
  return res;
}

function changeRatio(src, out) {
  const words = (s) => tokenize(asciiTypo(s)).map((x) => x.t).filter((t) => !/^\s+$/.test(t));
  const a = words(src), b = words(out);
  const ops = diffOps(a, b);
  const changed = ops.filter((o) => o.op !== 'eq').length;
  return (a.length + b.length) ? changed / (a.length + b.length) : 0;
}

// Istutetun virheen pienin eroava jakso virheettömässä tekstissä (clean)
function errorSpan(clean, e) {
  const at = indexOfBounded(clean, e.right);
  let p = 0;
  while (p < e.wrong.length && p < e.right.length && e.wrong[p] === e.right[p]) p++;
  let s = 0;
  while (s < e.wrong.length - p && s < e.right.length - p && e.wrong[e.wrong.length - 1 - s] === e.right[e.right.length - 1 - s]) s++;
  return { start: at + p, end: at + e.right.length - s };
}

// Yhdistää peräkkäiset jaksot, joiden välissä on vain tyhjää (usean sanan uudelleenkirjoitus on yksi jakso)
function mergeAdjacent(list, base) {
  const out = [];
  for (const h of list) {
    const prev = out[out.length - 1];
    if (prev && !prev.hit && !h.hit && /^\s*$/.test(base.slice(prev.aEnd, h.aStart))) {
      const gap = base.slice(prev.aEnd, h.aStart);
      prev.oldText += gap + h.oldText;
      prev.newText += gap + h.newText;
      prev.aEnd = h.aEnd;
    } else out.push(h);
  }
  return out;
}

// ---------- vastauksen jäsennys ----------
function parseResponse(text, expected) {
  const info = { hasOpen: false, hasClose: false, outside: '', fence: /```/.test(text), thinkTag: /<think/i.test(text), format: 'brackets', entries: new Map(), continued: new Set(), extraNumbers: [], preamble: [] };
  let body = text;
  const open = text.indexOf('<teksti>');
  const close = text.lastIndexOf('</teksti>');
  info.hasOpen = open !== -1;
  info.hasClose = close !== -1 && close > open;
  if (info.hasOpen) {
    const endAt = info.hasClose ? close : text.length;
    body = text.slice(open + '<teksti>'.length, endAt);
    info.outside = (text.slice(0, open) + (info.hasClose ? text.slice(close + '</teksti>'.length) : '')).trim();
  }
  const lines = body.replace(/```[a-z]*\n?/g, '').split('\n').map((l) => l.replace(/\r$/, ''));
  const bracket = /^\s*\[(\d{1,4})\][ \t]?(.*)$/;
  const dotted = /^\s*(\d{1,4})[.)][ \t]+(.*)$/;
  const useDotted = !lines.some((l) => bracket.test(l)) && lines.some((l) => dotted.test(l));
  if (useDotted) info.format = 'dotted';
  const re = useDotted ? dotted : bracket;
  let current = null;
  for (const l of lines) {
    const m = re.exec(l);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n < 1 || n > expected) info.extraNumbers.push(n);
      if (!info.entries.has(n)) info.entries.set(n, []);
      info.entries.get(n).push(m[2].replace(/\s+$/, ''));
      current = n;
    } else if (l.trim() === '') {
      continue;
    } else if (current === null) {
      info.preamble.push(l);
    } else {
      info.continued.add(current);
    }
  }
  return info;
}

// ---------- istutetun virheen sääntö ----------
// Kokeen sääntö: tulosteessa on oikea muoto (tai jokin hyväksytyistä muodoista, error.accept)
// eikä siinä ole väärää muotoa. Molemmat haetaan kirjain- ja numerorajoin (bounded).
function isFixed(output, error) {
  const out = String(output == null ? '' : output);
  const hasRight = count(out, error.right) >= 1;
  const hasWrong = count(out, error.wrong) >= 1;
  const accepted = (error.accept || []).some((alt) => count(out, alt) >= 1);
  return (hasRight || accepted) && !hasWrong;
}

// ---------- yhden mallin pisteytys ----------
// options.items: aineiston rivit (oletus: test/fixtures/step0-gateway/dataset.json)
// options.tag: ajon tunniste (oletus: raakatiedoston oma tunniste)
function scoreModel(file, options = {}) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ITEMS = options.items || readItems(DEFAULT_DATA_DIR);
  const TAG = options.tag || raw.tag || 'v1';
  const S = {
    model: raw.model.replace(/^[^:]*:/, ''), modelId: raw.model, tag: TAG, promptFile: raw.promptFile,
    requests: raw.batches.length, requestErrors: 0, stopReasons: {},
    lines: 0, planted: 0, fixed: 0, unfixed: 0, alteredOtherwise: 0,
    byType: {}, byGenre: {},
    wrong: 0, wrongAtPlanted: 0, wrongElsewhere: 0, wrongCommaOnly: 0,
    typoStraightened: 0, typoOther: 0,
    rewritten: 0, maxRatio: 0, exactLines: 0,
    lost: 0, duplicate: 0, split: 0, extraNumbers: 0, wrongNumberFormat: 0,
    dialogueLines: 0, dialogueAltered: 0, dialogueChanges: 0,
    controlLines: 0, controlAltered: 0,
    placeholders: 0, placeholdersLost: 0, placeholderMoved: 0,
    missingOpenTag: 0, missingCloseTag: 0, textOutsideTags: 0, codeFence: 0, thinkTagInText: 0,
    nbspIntroduced: 0,
    seconds: [], outputTokens: [], thinkingChars: [],
    details: []
  };
  for (const b of raw.batches) {
    const items = b.ids.map((id) => ITEMS.find((it) => it.id === id));
    S.seconds.push(b.seconds);
    if (b.usage) S.outputTokens.push(b.usage.output_tokens);
    S.thinkingChars.push(b.thinkingChars || 0);
    S.stopReasons[b.stopReason || 'virhe'] = (S.stopReasons[b.stopReason || 'virhe'] || 0) + 1;
    if (b.error) S.requestErrors += 1;
    const p = parseResponse(b.text || '', items.length);
    if (!p.hasOpen) S.missingOpenTag += 1;
    if (!p.hasClose) S.missingCloseTag += 1;
    if (p.outside) S.textOutsideTags += 1;
    if (p.fence) S.codeFence += 1;
    if (p.thinkTag) S.thinkTagInText += 1;
    if (p.format !== 'brackets') S.wrongNumberFormat += 1;
    S.extraNumbers += p.extraNumbers.length;

    items.forEach((it, idx) => {
      const n = idx + 1;
      S.lines += 1;
      const g = S.byGenre[it.genre] || (S.byGenre[it.genre] = { lines: 0, planted: 0, fixed: 0, wrong: 0, altered: 0 });
      g.lines += 1;
      g.planted += it.errors.length;
      S.planted += it.errors.length;
      for (const e of it.errors) { const t = S.byType[e.type] || (S.byType[e.type] = { planted: 0, fixed: 0 }); t.planted += 1; }
      const marks = Object.keys(it.placeholders);
      S.placeholders += marks.length;
      if (it.genre === 'vuorosana') S.dialogueLines += 1;
      if (it.genre === 'kontrolli') S.controlLines += 1;

      const entry = p.entries.get(n);
      const d = { id: it.id, genre: it.genre, batch: b.batch, n, source: it.text, output: null, status: 'ok', ratio: null, exact: false, errors: [], changes: [], residual: [] };
      if (!entry) {
        d.status = 'puuttuu';
        S.lost += 1;
        S.unfixed += it.errors.length;
        S.placeholdersLost += marks.length;
        it.errors.forEach((e) => d.errors.push({ ...e, result: 'rivi puuttuu' }));
        S.details.push(d);
        return;
      }
      if (entry.length > 1) { d.status = 'kahdesti'; S.duplicate += 1; }
      if (p.continued.has(n)) { d.status = 'jaettu'; S.split += 1; }
      const rawOut = entry[0];
      if (NBSP_RE.test(rawOut)) S.nbspIntroduced += 1;
      const out = rawOut.replace(NBSP_RE, ' ');
      d.output = rawOut;

      // istutetut virheet
      const spans = it.errors.map((e) => ({ e, span: errorSpan(it.clean, e), result: null }));
      for (const s of spans) {
        const hasWrong = count(out, s.e.wrong) >= 1;
        if (isFixed(out, s.e)) s.result = 'korjattu';
        else if (hasWrong) s.result = 'ei korjattu';
        else s.result = 'muutettu toisin';
        if (s.result === 'korjattu') { S.fixed += 1; S.byType[s.e.type].fixed += 1; g.fixed += 1; }
        else if (s.result === 'ei korjattu') S.unfixed += 1;
        else { S.alteredOtherwise += 1; S.wrong += 1; S.wrongAtPlanted += 1; g.wrong += 1; }
        d.errors.push({ ...s.e, result: s.result });
      }

      // näytettävät muutokset: lähde → vastaus
      d.changes = hunks(it.text, out).map((h) => ({ old: h.oldText, new: h.newText, at: h.aStart }));

      // jäännöserot: virheetön versio → vastaus
      let lineWrong = 0;
      const residual = hunks(it.clean, out).map((h) => {
        const hit = spans.find((s) => s.result !== 'korjattu' && h.aStart <= s.span.end + 1 && h.aEnd >= s.span.start - 1);
        return { ...h, hit: hit || null };
      });
      for (const h of mergeAdjacent(residual, it.clean)) {
        const c = { clean: h.oldText, got: h.newText, at: h.aStart, kind: null };
        if (h.hit) {
          c.kind = 'istutettu:' + h.hit.result;
        } else if (asciiTypo(h.oldText) === asciiTypo(h.newText)) {
          const straightened = /[”’–…]/.test(h.oldText) && !/[”’–…“—]/.test(h.newText);
          c.kind = straightened ? 'typografia:suoristus' : 'typografia:muu';
          if (straightened) S.typoStraightened += 1; else S.typoOther += 1;
        } else {
          const commaOnly = h.oldText.replace(/[,\s]/g, '') === h.newText.replace(/[,\s]/g, '');
          c.kind = commaOnly ? 'väärä:pilkku' : 'väärä:sana';
          if (/⟦/.test(h.oldText + h.newText)) { c.kind = 'väärä:paikkamerkki'; S.placeholderMoved += 1; }
          S.wrong += 1; S.wrongElsewhere += 1; g.wrong += 1; lineWrong += 1;
          if (commaOnly) S.wrongCommaOnly += 1;
        }
        d.residual.push(c);
      }
      d.exact = out === it.clean;
      if (d.exact) S.exactLines += 1;
      if (lineWrong) g.altered += 1;
      if (it.genre === 'vuorosana' && lineWrong) { S.dialogueAltered += 1; S.dialogueChanges += lineWrong; }
      if (it.genre === 'kontrolli' && lineWrong) S.controlAltered += 1;

      for (const mk of marks) if (!out.includes(mk)) S.placeholdersLost += 1;

      d.ratio = Number(changeRatio(it.text, out).toFixed(3));
      S.maxRatio = Math.max(S.maxRatio, d.ratio);
      if (d.ratio > 0.3) { S.rewritten += 1; d.status = d.status === 'ok' ? 'uusiksi' : d.status + '+uusiksi'; }
      S.details.push(d);
    });
  }
  const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  S.fixedShare = S.planted ? S.fixed / S.planted : 0;
  S.rewrittenShare = S.lines ? S.rewritten / S.lines : 0;
  S.secondsMean = Number(mean(S.seconds).toFixed(1));
  S.secondsMax = Number(Math.max(...S.seconds).toFixed(1));
  S.secondsMin = Number(Math.min(...S.seconds).toFixed(1));
  S.outputTokensMean = Math.round(mean(S.outputTokens));
  S.thinkingCharsMean = Math.round(mean(S.thinkingChars));
  S.misaligned = S.lost + S.duplicate + S.split + S.extraNumbers;
  // Päätössääntö (4.4): vähintään puolet korjattu, vääriä vähemmän kuin oikeita, alle viidesosa rivejä uusiksi
  S.rule = {
    halfFixed: S.fixedShare >= 0.5,
    wrongFewerThanRight: S.wrong < S.fixed,
    underFifthRewritten: S.rewrittenShare < 0.2
  };
  S.pass = S.rule.halfFixed && S.rule.wrongFewerThanRight && S.rule.underFifthRewritten;
  return S;
}

// ---------- komentorivi ----------
// run.js:n uusin väliaikaiskansio, jossa on raw/<tunniste>
function latestRunDir(tag) {
  let best = null;
  for (const name of fs.readdirSync(os.tmpdir())) {
    if (!name.startsWith(RUN_DIR_PREFIX)) continue;
    const dir = path.join(os.tmpdir(), name);
    if (!fs.existsSync(path.join(dir, 'raw', tag))) continue;
    const time = fs.statSync(dir).mtimeMs;
    if (!best || time > best.time) best = { dir, time };
  }
  return best ? best.dir : null;
}

function main() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith('--')) { const n = process.argv[i + 1]; if (n && !n.startsWith('--')) { args[a.slice(2)] = n; i++; } else args[a.slice(2)] = true; }
  }
  const TAG = typeof args.tag === 'string' ? args.tag : 'v1';
  const DATA_DIR = path.resolve(typeof args.data === 'string' ? args.data : DEFAULT_DATA_DIR);
  let OUT_DIR = typeof args.out === 'string' ? path.resolve(args.out) : null;

  const hasRaw = (dir) => dir !== null && fs.existsSync(path.join(dir, 'raw', TAG));
  let rawRoot = hasRaw(OUT_DIR) ? OUT_DIR : hasRaw(DATA_DIR) ? DATA_DIR : null;
  if (rawRoot === null && OUT_DIR === null) {
    rawRoot = latestRunDir(TAG);
    OUT_DIR = rawRoot;
  }
  if (rawRoot === null) {
    console.error(`Raakavastauksia ei löydy: raw/${TAG} puuttuu kansiosta ${OUT_DIR || DATA_DIR}. Anna --out <kansio>, johon run.js kirjoitti.`);
    process.exit(2);
  }
  if (OUT_DIR === null) OUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), RUN_DIR_PREFIX));
  const RAW_DIR = path.join(rawRoot, 'raw', TAG);
  const ITEMS = readItems(DATA_DIR);

  // Levy kirjoittaa "._nimi"-tiedostoja oikeiden viereen; niitä ei lueta
  const files = fs.readdirSync(RAW_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('.')).sort();
  const results = files.map((f) => scoreModel(path.join(RAW_DIR, f), { items: ITEMS, tag: TAG }));
  fs.mkdirSync(path.join(OUT_DIR, 'scores'), { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'scores', TAG + '.json'), JSON.stringify(results, null, 2) + '\n');

  const pct = (x) => (100 * x).toFixed(0) + ' %';
  const rows = [
    ['Korjatut istutetut virheet', (s) => `${s.fixed}/${s.planted} (${pct(s.fixedShare)})`],
    ['Väärät korjaukset', (s) => `${s.wrong}`],
    ['– joista pelkkä pilkku', (s) => `${s.wrongCommaOnly}`],
    ['– joista istutetun virheen kohdalla', (s) => `${s.wrongAtPlanted}`],
    ['Typografian suoristukset', (s) => `${s.typoStraightened}`],
    ['Muu typografinen muutos', (s) => `${s.typoOther}`],
    ['Rivit, jotka ovat täsmälleen virheetön versio', (s) => `${s.exactLines}/${s.lines}`],
    ['Uusiksi kirjoitetut rivit (> 0,3)', (s) => `${s.rewritten}/${s.lines} (${pct(s.rewrittenShare)})`],
    ['Suurin muutossuhde', (s) => s.maxRatio.toFixed(2)],
    ['Kadonneet / kahdesti / jaetut / ylimääräiset rivit', (s) => `${s.lost} / ${s.duplicate} / ${s.split} / ${s.extraNumbers}`],
    ['Muutetut vuorosanarivit', (s) => `${s.dialogueAltered}/${s.dialogueLines} (${s.dialogueChanges} muutosta)`],
    ['Muutetut kontrollirivit', (s) => `${s.controlAltered}/${s.controlLines}`],
    ['Kadonneet paikkamerkit', (s) => `${s.placeholdersLost}/${s.placeholders}`],
    ['Puuttuva lopputagi', (s) => `${s.missingCloseTag}/${s.requests}`],
    ['Tekstiä tagien ulkopuolella', (s) => `${s.textOutsideTags}/${s.requests}`],
    ['Sekuntia per erä (ka., vaihtelu)', (s) => `${s.secondsMean} (${s.secondsMin}–${s.secondsMax})`],
    ['Tulostokeneita per erä (ka.)', (s) => `${s.outputTokensMean}`],
    ['Päätössääntö', (s) => s.pass ? 'täyttyy' : 'ei täyty']
  ];
  console.log(`\n## ${TAG}\n`);
  console.log('| Mittari | ' + results.map((s) => s.model).join(' | ') + ' |');
  console.log('|---|' + results.map(() => '---').join('|') + '|');
  for (const [label, fn] of rows) console.log(`| ${label} | ` + results.map(fn).join(' | ') + ' |');

  console.log('\nTyypeittäin (korjattu/istutettu):');
  for (const s of results) console.log(`  ${s.model}: ` + Object.entries(s.byType).map(([t, v]) => `${t} ${v.fixed}/${v.planted}`).join(', '));

  if (args.details) {
    for (const s of results) {
      console.log(`\n===== ${s.model} =====`);
      console.log(`stop: ${JSON.stringify(s.stopReasons)}, lukumuoto väärä ${s.wrongNumberFormat}, koodiaita ${s.codeFence}, think-tagi ${s.thinkTagInText}, sitova väli lisätty ${s.nbspIntroduced} rivillä`);
      for (const d of s.details) {
        const bad = d.errors.filter((e) => e.result !== 'korjattu');
        const other = d.residual.filter((c) => !c.kind.startsWith('istutettu:'));
        if (!bad.length && !other.length && d.status === 'ok') continue;
        console.log(`- ${d.id} [${d.status}, suhde ${d.ratio}]`);
        for (const e of bad) console.log(`    virhe ${e.type}: "${e.wrong}" → "${e.right}": ${e.result}`);
        for (const c of other) console.log(`    oma muutos ${c.kind}: pitäisi olla "${c.clean}", vastauksessa "${c.got}"`);
      }
    }
  }

  console.log(`\nRaakavastaukset: ${RAW_DIR}`);
  console.log(`Pisteet: ${path.join(OUT_DIR, 'scores', TAG + '.json')}`);
}

module.exports = { parseResponse, isFixed, scoreModel };

if (require.main === module) main();
