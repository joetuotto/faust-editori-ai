/**
 * Finnish typography
 *
 * One place for the Finnish quotation mark (”), apostrophe (’) and dash (–):
 * what smart typing does with a typed character, how text that came from a
 * model is brought back to the manuscript's own typography, and the checker
 * behind "Tarkista typografia".
 *
 * Pure functions: no DOM, nothing from CodeMirror, nothing required. Every
 * offset is a UTF-16 offset, ranges are half-open
 * (test/editor/typography.fi.test.js).
 */

const QUOTE = '”';
const APOSTROPHE = '’';
const DASH = '–';

// Same rule as utils/manuscript.js: "---", "* * *", "- - -"
const SCENE_BREAK = /^\s*([-*_])(\s*\1){2,}\s*$/;

// The editor's note and underline patterns; a parity test keeps the copies in step
const TODO_CLOSED = /\[TODO:[^\]\n]*\]/g;
const TODO_OPEN = /\[TODO:[^\]\n]*$/;
const UNDERLINE_TAG = /<\/?u>/g;
const PLACEHOLDER = /⟦\/?\d+⟧/g;

// ---------------------------------------------------------------------------
// Protected text
// ---------------------------------------------------------------------------

/**
 * Ranges of one line that no function here may change and in which smart
 * typing never fires: [TODO: …] notes (an unclosed one runs to the end of the
 * line), the <u> and </u> tags themselves, and mask placeholders.
 * @returns {Array<[number, number]>} sorted, not overlapping
 */
function protectedRanges(line) {
  const text = String(line == null ? '' : line);
  const ranges = [];

  let lastEnd = 0;
  for (const match of text.matchAll(TODO_CLOSED)) {
    ranges.push([match.index, match.index + match[0].length]);
    lastEnd = match.index + match[0].length;
  }
  const open = text.slice(lastEnd).search(TODO_OPEN);
  if (open !== -1) ranges.push([lastEnd + open, text.length]);

  for (const match of text.matchAll(UNDERLINE_TAG)) ranges.push([match.index, match.index + match[0].length]);
  for (const match of text.matchAll(PLACEHOLDER)) ranges.push([match.index, match.index + match[0].length]);

  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  // A tag or a placeholder inside a note is already covered by the note
  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] < last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push(range);
  }
  return merged;
}

// An insertion (from === to) only counts strictly inside a range: text may be
// added right before or right after a note
function touchesRanges(ranges, from, to) {
  if (from === to) return ranges.some(([start, end]) => from > start && from < end);
  return ranges.some(([start, end]) => from < end && to > start);
}

const insideRanges = (ranges, pos) => ranges.some(([start, end]) => pos >= start && pos < end);

/**
 * How a line-start "- " is read by the checker and by Kielenhuolto: the
 * project's own setting, else a list in nonfiction and dialogue elsewhere.
 * @returns {'list'|'dialogue'}
 */
function effectiveLineStartDash(project) {
  const setting = project && project.typography ? project.typography.lineStartDash : null;
  if (setting === 'list' || setting === 'dialogue') return setting;
  return project && project.genre === 'nonfiction' ? 'list' : 'dialogue';
}

// ---------------------------------------------------------------------------
// Smart typing
// ---------------------------------------------------------------------------

// The straight marks, plus the curly ones a system substitution or a foreign
// keyboard layout may deliver in their place
const TRIGGERS = new Set(['"', "'", '-', ' ', '“', '„', '‘']);

/**
 * What to do with a typed character before it is inserted.
 * @param {string} lineBefore the line as it is
 * @param {number} col caret offset in the line
 * @param {string} typed
 * @param {{enabled: boolean}} options
 * @returns {'ignore'|'swallow'|'check'}
 */
function inputAction(lineBefore, col, typed, options) {
  if (!options || !options.enabled) return 'ignore';
  if (typeof typed !== 'string' || typed.length !== 1 || !TRIGGERS.has(typed)) return 'ignore';
  if (typed === ' ') {
    // The dialogue dash brought its own space: "-- Hei" typed in full gives "– Hei"
    const before = String(lineBefore == null ? '' : lineBefore).slice(0, col);
    return /^[ \t]*– $/.test(before) ? 'swallow' : 'ignore';
  }
  return 'check';
}

/**
 * The replacement for the character that was just typed, or null.
 * A single line-start "- " is never changed: it stays a list item.
 * @param {string} line the line with the typed character in it
 * @param {number} col caret offset right after the typed character
 * @param {{enabled: boolean}} options
 * @returns {{from: number, to: number, insert: string, cursor: number, rule: string}|null}
 *   offsets in the line; cursor is measured after the replacement
 */
function smartReplace(line, col, options) {
  if (!options || !options.enabled) return null;
  const text = String(line == null ? '' : line);
  if (!(col >= 1) || col > text.length) return null;
  if (insideRanges(protectedRanges(text), col - 1)) return null;
  // Inside a web address the mark is part of the address, as the checker reads it ("--" or an apostrophe
  // in a path). While it is typed the address has no end yet, so the whole token counts
  if (insideRanges(addressTokens(text), col - 1)) return null;

  const ch = text[col - 1];
  const before = text.slice(0, col);
  const after = text.slice(col);

  // The same mark opens and closes a quotation in Finnish
  if (ch === '"' || ch === '“' || ch === '„') {
    return { from: col - 1, to: col, insert: QUOTE, cursor: col, rule: 'lainausmerkki' };
  }
  if (ch === "'" || ch === '‘') {
    return { from: col - 1, to: col, insert: APOSTROPHE, cursor: col, rule: 'heittomerkki' };
  }

  if (ch === '-') {
    // A third hyphen after a line-start dash: the author is typing "---"
    const scene = /^([ \t]*)– ?-$/.exec(before);
    if (scene && after.trim() === '') {
      const indent = scene[1].length;
      return { from: indent, to: col, insert: '---', cursor: indent + 3, rule: 'kohtauksen-erotin' };
    }
    if (before.endsWith('--') && before[col - 3] !== '-') {
      if (/^[ \t]*--$/.test(before)) {
        const insert = after.startsWith(' ') ? DASH : `${DASH} `;
        return { from: col - 2, to: col, insert, cursor: col, rule: 'vuorosanaviiva' };
      }
      return { from: col - 2, to: col, insert: DASH, cursor: col - 1, rule: 'ajatusviiva' };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Text from a model
// ---------------------------------------------------------------------------

const DOUBLE_MARKS = '"“„‟';
const SINGLE_MARKS = "'‘‚";
const isGap = (ch) => ch === ' ' || ch === '\u00A0';
// An em dash is written with a space on both sides, so for the hyphen next to
// it there is a gap on that side: without this a second pass would change more
const isGapOrEmDash = (ch) => isGap(ch) || ch === '—';

function convertLine(rawLine) {
  // A reply may come with CRLF line ends; the \r is not part of the line
  const cr = rawLine.endsWith('\r') ? '\r' : '';
  const line = cr ? rawLine.slice(0, -1) : rawLine;
  if (!/["“„‟'‘‚—-]/.test(line) || SCENE_BREAK.test(line)) return rawLine;

  const ranges = protectedRanges(line);
  const first = line.search(/\S/);
  let out = '';
  let i = 0;
  let r = 0;

  while (i < line.length) {
    while (r < ranges.length && ranges[r][1] <= i) r += 1;
    if (r < ranges.length && ranges[r][0] <= i) {
      out += line.slice(i, ranges[r][1]);
      i = ranges[r][1];
      continue;
    }
    const limit = r < ranges.length ? ranges[r][0] : line.length;
    const ch = line[i];

    if (DOUBLE_MARKS.includes(ch)) {
      out += QUOTE;
      i += 1;
    } else if (SINGLE_MARKS.includes(ch)) {
      out += APOSTROPHE;
      i += 1;
    } else if (ch === '-') {
      let end = i;
      while (end < limit && line[end] === '-') end += 1;
      const run = end - i;
      if (run === 2 && i === first) {
        // A dialogue dash typed as "--": one space after it, whatever followed
        while (end < limit && isGap(line[end])) end += 1;
        out += `${DASH} `;
      } else if (run === 2) {
        out += DASH;
      } else if (run === 1 && i !== first && i > 0 && isGapOrEmDash(line[i - 1]) && i + 1 < line.length && isGapOrEmDash(line[i + 1])) {
        out += DASH;
      } else {
        out += line.slice(i, end);
      }
      i = end;
    } else if (ch === '—') {
      let end = i + 1;
      if (i === first) {
        while (end < limit && isGap(line[end])) end += 1;
        out += `${DASH} `;
      } else {
        const prev = line[i - 1];
        const next = end < line.length ? line[end] : '';
        out += (/\s/.test(prev) ? '' : ' ') + DASH + (next === '' || /\s/.test(next) ? '' : ' ');
      }
      i = end;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out + cr;
}

/**
 * Finnish quotation marks and dashes for text that has no original to compare
 * with. The line count stays, protected ranges stay, and running it twice
 * changes nothing more. A line-start "- " is a list marker and is left alone.
 */
function toFinnishTypography(text) {
  return String(text == null ? '' : text).split('\n').map(convertLine).join('\n');
}

// Quote, dash and ellipsis forms that count as "the same token"
const canon = (token) => token.normalize('NFC')
  .replace(/["“”„‟»«]/g, '"')
  .replace(/['‘’‚´`]/g, "'")
  .replace(/[-\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-')
  .replace(/…/g, '...');

// Maximal runs of non-whitespace (NBSP and U+202F are whitespace)
function splitTokens(line) {
  const tokens = [];
  const pattern = /\S+/g;
  let match;
  while ((match = pattern.exec(line)) !== null) {
    tokens.push({ text: match[0], from: match.index, to: match.index + match[0].length });
  }
  return tokens;
}

const MAX_ALIGN_CELLS = 4000000;

function normaliseLine(modelLine, originalLine) {
  const original = splitTokens(originalLine);
  const model = splitTokens(modelLine);
  const n = original.length;
  const m = model.length;
  if (n * m > MAX_ALIGN_CELLS) return toFinnishTypography(modelLine);

  const canonOriginal = original.map(token => canon(token.text));
  const canonModel = model.map(token => canon(token.text));

  // Longest common subsequence over canon-equal tokens
  const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = canonOriginal[i] === canonModel[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const pair = new Array(m).fill(-1);
  for (let i = 0, j = 0; i < n && j < m;) {
    if (canonOriginal[i] === canonModel[j]) {
      pair[j] = i;
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }

  const ranges = protectedRanges(modelLine);
  let body = '';
  for (let k = 0; k < m; k++) {
    if (k > 0) {
      // Whitespace of the original (an NBSP, say) survives between tokens that were neighbours there
      const neighbours = pair[k] >= 0 && pair[k - 1] >= 0 && pair[k] === pair[k - 1] + 1;
      body += neighbours
        ? originalLine.slice(original[pair[k - 1]].to, original[pair[k]].from)
        : modelLine.slice(model[k - 1].to, model[k].from);
    }
    const token = model[k];
    if (pair[k] >= 0) {
      // Same token apart from its typography: the manuscript's own form wins
      body += original[pair[k]].text;
    } else if (touchesRanges(ranges, token.from, token.to)) {
      body += token.text;
    } else if (token.text === '-' || token.text === '--' || token.text === '—') {
      body += k === 0 && token.text === '-' ? token.text : DASH;
    } else {
      body += toFinnishTypography(token.text);
    }
  }

  const lead = /^\s*/.exec(originalLine)[0];
  const trail = lead.length === originalLine.length ? '' : /\s*$/.exec(originalLine)[0];
  return lead + body + trail;
}

/**
 * Take the typographic noise out of model output before it is diffed, so the
 * diff shows only what the model really changed. A token that differs from
 * the original only in its quote, dash or ellipsis form is written back as
 * the original; new tokens get Finnish typography. Without an original the
 * whole text goes through toFinnishTypography.
 */
function normaliseModelText(modelText, originalText) {
  const model = String(modelText == null ? '' : modelText).normalize('NFC');
  if (typeof originalText !== 'string') return toFinnishTypography(model);

  if (model.includes('\n') || originalText.includes('\n')) {
    const modelLines = model.split('\n');
    const originalLines = originalText.split('\n');
    if (modelLines.length !== originalLines.length) return toFinnishTypography(model);
    return modelLines.map((line, index) => normaliseLine(line, originalLines[index])).join('\n');
  }
  return normaliseLine(model, originalText);
}

// ---------------------------------------------------------------------------
// The checker
// ---------------------------------------------------------------------------

const OHJEPANKKI = 'https://kielitoimistonohjepankki.fi/ohje/';
const URLS = {
  quotes: 'https://www.kielitoimistonohjepankki.fi/ohje/lainausmerkit/',
  apostrophe: `${OHJEPANKKI}heittomerkki/`,
  dash: `${OHJEPANKKI}ajatusviiva-virkkeen-valimerkkina/`,
  range: `${OHJEPANKKI}ajatusviiva-rajakohdat-ja-osapuolet-20-29-vuotiaat-suomi-ruotsi-maaottelu/`,
  dialogue: `${OHJEPANKKI}lainausmerkit-ja-vuorosanaviiva/`,
  percent: `${OHJEPANKKI}prosentti/`,
  date: `${OHJEPANKKI}ajanilmaukset-paivays-ja-vuosiluku/`,
  time: `${OHJEPANKKI}ajanilmaukset-kellonajat-merkinta-ja-taivutus/`,
  ellipsis: `${OHJEPANKKI}kolme-pistetta/`
};

const rule = (id, level, title, message, url) => ({ id, title, message, url, level });

// Titles and messages are FAUST's own wording; the links point to the norm
const TYPOGRAPHY_RULES = {
  'suora-lainausmerkki': rule('suora-lainausmerkki', 'normi', 'Suora lainausmerkki',
    'Suomenkielisessä tekstissä lainaus alkaa ja päättyy samalla kaarevalla merkillä ”.', URLS.quotes),
  'vieras-lainausmerkki': rule('vieras-lainausmerkki', 'normi', 'Vieraan kielen lainausmerkki',
    'Merkit “ ja „ kuuluvat muiden kielten käytäntöön. Suomessa lainauksen molemmin puolin on ”.', URLS.quotes),
  'suora-heittomerkki': rule('suora-heittomerkki', 'normi', 'Suora heittomerkki',
    'Heittomerkkinä ja puolilainausmerkkinä käytetään kaarevaa merkkiä ’.', URLS.apostrophe),
  'kaksi-yhdysmerkkia': rule('kaksi-yhdysmerkkia', 'normi', 'Kaksi yhdysmerkkiä',
    'Kaksi peräkkäistä yhdysmerkkiä on ajatusviivan korvike. Oikea merkki on –.', URLS.dash),
  'yhdysmerkki-ajatusviivana': rule('yhdysmerkki-ajatusviivana', 'normi', 'Yhdysmerkki ajatusviivan paikalla',
    'Kun viivan molemmin puolin on väli, kyse on ajatusviivasta (–), ei yhdysmerkistä.', URLS.dash),
  'ajatusviivan-valit': rule('ajatusviivan-valit', 'suositus', 'Väli puuttuu ajatusviivan toiselta puolelta',
    'Virkkeen sisällä ajatusviivan molemmin puolin on väli. Rajakohtien välissä (2–3, Helsinki–Tampere) välejä ei ole kummallakaan puolella.', URLS.dash),
  'vuorosanaviivan-vali': rule('vuorosanaviivan-vali', 'normi', 'Väli puuttuu vuorosanaviivan jälkeen',
    'Vuorosanaviivan ja repliikin väliin tulee väli.', URLS.dialogue),
  'lukuvali-yhdysmerkki': rule('lukuvali-yhdysmerkki', 'normi', 'Yhdysmerkki lukujen välissä',
    'Kun ilmaistaan rajakohtia, lukujen väliin kirjoitetaan ajatusviiva ilman välejä: 2–3, 1939–1945.', URLS.range),
  'prosentti-vali': rule('prosentti-vali', 'normi', 'Väli puuttuu ennen prosenttimerkkiä',
    'Luvun ja prosenttimerkin väliin tulee väli: 11 %.', URLS.percent),
  'paivays-muoto': rule('paivays-muoto', 'normi', 'Päiväyksen muoto',
    'Päiväys kirjoitetaan ilman välejä ja ilman etunollia: 3.4.2025.', URLS.date),
  'paivays-jarjestyspiste': rule('paivays-jarjestyspiste', 'normi', 'Piste puuttuu päivän numerosta',
    'Kun kuukausi kirjoitetaan sanana, päivän numeron perään tulee piste: 16. marraskuuta.', URLS.date),
  'kellonaika-kaksoispiste': rule('kellonaika-kaksoispiste', 'suositus', 'Kaksoispiste kellonajassa',
    'Yleiskielisessä tekstissä tuntien ja minuuttien väliin suositellaan pistettä: kello 9.15. Kaksoispiste on digitaalisten näyttöjen tapa.', URLS.time),
  'kolme-pistetta': rule('kolme-pistetta', 'suositus', 'Kolme pistettä erillisinä merkkeinä',
    'Kolme pistettä voi kirjoittaa yhdellä merkillä (…). Painetussa tekstissä se on tavallisin muoto.', URLS.ellipsis),
  'rivin-alun-viiva': rule('rivin-alun-viiva', 'kysymys', 'Luettelo vai vuorosana?',
    'Rivi alkaa yhdysmerkillä ja välillä, joten FAUST käsittelee sen luettelokohtana. Jos rivi on repliikki, sen alkuun kuuluu vuorosanaviiva (– ).', URLS.dialogue)
};

const MONTH_STEMS = 'tammi|helmi|maalis|huhti|touko|kesä|heinä|elo|syys|loka|marras|joulu';
const NUMBER_RANGE = /(?<![\p{L}\d.,\-–])(\d{1,4})-(\d{1,4})(?![\p{L}\d\-–]|[.,]\d)/gu;
const DATE = /(?<![\d.])(0?[1-9]|[12]\d|3[01])\.[ \u00A0]*(0?[1-9]|1[0-2])\.[ \u00A0]*(\d{4})(?!\d)/g;
const DAY_BEFORE_MONTH = new RegExp(`(?<![\\d.])(\\d{1,2}) (?:${MONTH_STEMS})kuuta(?!\\p{L})`, 'gu');
const CLOCK = /(?<=(?<!\p{L})(?:kello|klo)[ \u00A0])(\d{1,2}):(\d{2})(?![\d:])/giu;

const leadingZero = (digits) => digits.length > 1 && digits[0] === '0';

// The whitespace-delimited token around a position
function wordAround(line, pos) {
  let start = pos;
  let end = pos;
  while (start > 0 && !/\s/.test(line[start - 1])) start -= 1;
  while (end < line.length && !/\s/.test(line[end])) end += 1;
  return line.slice(start, end);
}
const replaceAt = (from, to, insert) => ({ from, to, insert });

// A web address is not prose: "--", an apostrophe or a number range inside one
// is part of the address, and a fix there would break it. Quotation marks
// around an address are outside it, and so is the punctuation after it
const ADDRESS = /(?:\b[a-z][a-z0-9+.-]*:\/\/|(?<![\p{L}\p{N}.@/-])www\.)[^\s"”“„‟»«<>]+/giu;

function addressRanges(line) {
  const ranges = [];
  for (const match of line.matchAll(ADDRESS)) {
    const address = match[0].replace(/[.,;:!?)\]'’…]+$/u, '');
    ranges.push([match.index, match.index + address.length]);
  }
  return ranges;
}

// The same addresses with whatever is attached to them: smart typing sees an address while it is being
// typed, when a trailing apostrophe or hyphen may still be followed by more of it
function addressTokens(line) {
  return [...line.matchAll(ADDRESS)].map(match => [match.index, match.index + match[0].length]);
}

// Every rule returns hits as { from, to, fix, convert? } in offsets of the
// line: from/to are the characters to show, fix is the change to propose
const CHECKS = [
  ['suora-lainausmerkki', (line) => [...line.matchAll(/"/g)].map((m) => (
    { from: m.index, to: m.index + 1, fix: replaceAt(m.index, m.index + 1, QUOTE) }
  ))],

  // » and « are an accepted Finnish alternative and are left alone
  ['vieras-lainausmerkki', (line) => [...line.matchAll(/[“„‟]/g)].map((m) => (
    { from: m.index, to: m.index + 1, fix: replaceAt(m.index, m.index + 1, QUOTE) }
  ))],

  // An accent or a backtick is an apostrophe only between two letters
  ['suora-heittomerkki', (line) => [...line.matchAll(/['‘]|(?<=\p{L})[´`](?=\p{L})/gu)].map((m) => (
    { from: m.index, to: m.index + 1, fix: replaceAt(m.index, m.index + 1, APOSTROPHE) }
  ))],

  ['kaksi-yhdysmerkkia', (line) => {
    const first = line.search(/\S/);
    return [...line.matchAll(/(?<!-)--(?!-)/g)].map((m) => {
      const end = m.index + 2;
      if (m.index !== first) return { from: m.index, to: end, fix: replaceAt(m.index, end, DASH) };
      // Line start: a dialogue dash, with exactly one space after it
      let gap = end;
      while (gap < line.length && (isGap(line[gap]) || line[gap] === '\t')) gap += 1;
      return { from: m.index, to: end, fix: replaceAt(m.index, gap, `${DASH} `) };
    });
  }],

  // A bullet, "maa- ja metsätalous" and "New York -tyylinen" do not match
  ['yhdysmerkki-ajatusviivana', (line) => [...line.matchAll(/(?<=\S[ \u00A0])-(?=[ \u00A0]\S|[ \u00A0]*$)/g)].map((m) => (
    { from: m.index, to: m.index + 1, fix: replaceAt(m.index, m.index + 1, DASH) }
  ))],

  ['ajatusviivan-valit', (line) => [
    ...[...line.matchAll(/(?<=\p{L})–(?=[ \u00A0]+\p{L})/gu)].map((m) => (
      { from: m.index, to: m.index + 1, fix: replaceAt(m.index, m.index, ' ') }
    )),
    ...[...line.matchAll(/(?<=\p{L}[ \u00A0])–(?=\p{L})/gu)].map((m) => (
      { from: m.index, to: m.index + 1, fix: replaceAt(m.index + 1, m.index + 1, ' ') }
    ))
  ]],

  // "–5 astetta" is a minus sign, not a line of dialogue
  ['vuorosanaviivan-vali', (line) => {
    const m = /^([ \t]*)–(?=[^\s–\d])/u.exec(line);
    if (!m) return [];
    const at = m[1].length;
    return [{ from: at, to: at + 1, fix: replaceAt(at + 1, at + 1, ' ') }];
  }],

  // 1939-1945, but not a score (3-2), a phone number, an ISBN or an ISO date
  ['lukuvali-yhdysmerkki', (line) => [...line.matchAll(NUMBER_RANGE)]
    .filter((m) => !leadingZero(m[1]) && !leadingZero(m[2]) && Number(m[1]) < Number(m[2]))
    .map((m) => {
      const hyphen = m.index + m[1].length;
      return { from: m.index, to: m.index + m[0].length, fix: replaceAt(hyphen, hyphen + 1, DASH) };
    })],

  ['prosentti-vali', (line) => [...line.matchAll(/\d+(?:[.,]\d+)*[%‰]/g)]
    .filter((m) => {
      // %20 in an address is not a percentage
      const token = wordAround(line, m.index);
      return !token.includes('://') && !token.startsWith('www.');
    })
    .map((m) => {
      const sign = m.index + m[0].length - 1;
      return { from: m.index, to: sign + 1, fix: replaceAt(sign, sign, ' ') };
    })],

  ['paivays-muoto', (line) => [...line.matchAll(DATE)]
    .map((m) => ({ m, normal: `${Number(m[1])}.${Number(m[2])}.${m[3]}` }))
    .filter(({ m, normal }) => m[0] !== normal)
    .map(({ m, normal }) => (
      { from: m.index, to: m.index + m[0].length, fix: replaceAt(m.index, m.index + m[0].length, normal) }
    ))],

  // At the start of a line the full stop would make the line a numbered list item ("16. marraskuuta …"
  // is read, shown and exported as item 1 of a list), so there the finding has no fix
  ['paivays-jarjestyspiste', (line) => [...line.matchAll(DAY_BEFORE_MONTH)].map((m) => {
    const afterNumber = m.index + m[1].length;
    const lineStart = line.slice(0, m.index).trim() === '';
    return { from: m.index, to: m.index + m[0].length, fix: lineStart ? null : replaceAt(afterNumber, afterNumber, '.') };
  })],

  // "Joh. 3:16" and "kello 8:05:30" do not match
  ['kellonaika-kaksoispiste', (line) => [...line.matchAll(CLOCK)]
    .filter((m) => Number(m[1]) <= 23 && Number(m[2]) <= 59)
    .map((m) => {
      const colon = m.index + m[1].length;
      return { from: m.index, to: m.index + m[0].length, fix: replaceAt(colon, colon + 1, '.') };
    })],

  // Four or more dots are left alone
  ['kolme-pistetta', (line) => [...line.matchAll(/(?<!\.)\.\.\.(?!\.)/g)].map((m) => (
    { from: m.index, to: m.index + 3, fix: replaceAt(m.index, m.index + 3, '…') }
  ))],

  // A question, never a fix: only the author knows whether the line is a list item
  ['rivin-alun-viiva', (line, options) => {
    if (options.lineStartDash !== 'dialogue') return [];
    const m = /^[ \t]*-[ \t]+(?=\S)/.exec(line);
    if (!m) return [];
    const from = m[0].indexOf('-');
    return [{ from, to: m[0].length, fix: null, convert: replaceAt(from, m[0].length, `${DASH} `) }];
  }]
];

const RULE_ORDER = new Map(CHECKS.map(([id], index) => [id, index]));

/**
 * Typographic findings of a text, in reading order.
 * @param {string} text
 * @param {{language?: string, lineStartDash?: 'list'|'dialogue'}} [options]
 *   The "Luettelo vai vuorosana?" question is asked only with lineStartDash 'dialogue'.
 * @returns {Array<{id, ruleId, level, line, from, to, quote, message, url, fix, convert?}>}
 */
function checkTypography(text, options = {}) {
  const { language = 'fi', lineStartDash = 'dialogue' } = options || {};
  if (language !== 'fi') return [];
  const value = String(text == null ? '' : text);

  const findings = [];
  let lineStart = 0;
  let lineNumber = 0;

  for (const rawLine of value.split('\n')) {
    lineNumber += 1;
    const offset = lineStart;
    lineStart += rawLine.length + 1;
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (!line.trim() || SCENE_BREAK.test(line)) continue;

    const ranges = protectedRanges(line);
    const addresses = addressRanges(line);
    for (const [ruleId, find] of CHECKS) {
      const info = TYPOGRAPHY_RULES[ruleId];
      for (const hit of find(line, { lineStartDash })) {
        const change = hit.fix || hit.convert;
        if (touchesRanges(ranges, hit.from, hit.to)) continue;
        if (change && touchesRanges(ranges, change.from, change.to)) continue;
        if (touchesRanges(addresses, hit.from, hit.to)) continue;

        const from = offset + hit.from;
        const to = offset + hit.to;
        const finding = {
          id: `${ruleId}@${from}`,
          ruleId,
          level: info.level,
          line: lineNumber,
          from,
          to,
          quote: value.slice(from, to),
          message: info.message,
          url: info.url,
          fix: hit.fix ? replaceAt(offset + hit.fix.from, offset + hit.fix.to, hit.fix.insert) : null
        };
        if (hit.convert) {
          finding.convert = replaceAt(offset + hit.convert.from, offset + hit.convert.to, hit.convert.insert);
        }
        findings.push(finding);
      }
    }
  }

  const byRule = (a, b) => RULE_ORDER.get(a.ruleId) - RULE_ORDER.get(b.ruleId);
  findings.sort((a, b) => a.from - b.from || a.to - b.to || byRule(a, b));

  // Two fixes on the same characters cannot both be proposed: the earlier one stays
  const dropped = new Set();
  let last = null;
  const withFix = findings.filter(finding => finding.fix)
    .sort((a, b) => a.fix.from - b.fix.from || a.fix.to - b.fix.to || byRule(a, b));
  for (const finding of withFix) {
    if (last && fixesCollide(last, finding.fix)) dropped.add(finding);
    else last = finding.fix;
  }
  return dropped.size > 0 ? findings.filter(finding => !dropped.has(finding)) : findings;
}

// Touching ranges are fine (the suggestion layer merges them); two insertions
// at one position are not, because their order would be a guess
function fixesCollide(previous, next) {
  if (next.from < previous.to) return true;
  return next.from === previous.from && next.to === next.from && previous.to === previous.from;
}

const typographyMeta = (ruleId) => ({ source: 'local', action: 'typography', ruleId });

/**
 * The changes that "Ehdota kaikki korjaukset" proposes: norm rules by default.
 * Recommendations come along only when levels lists 'suositus'; a question
 * ('kysymys') never becomes a change here.
 * @returns {Array<{from, to, insert, meta: {source: 'local', action: 'typography', ruleId}}>}
 */
function fixesFor(findings, options = {}) {
  const { levels = ['normi'] } = options || {};
  const allowed = new Set(levels);
  allowed.delete('kysymys');

  const withFix = (findings || [])
    .filter(finding => finding && finding.fix && allowed.has(finding.level))
    .sort((a, b) => a.fix.from - b.fix.from || a.fix.to - b.fix.to);

  const changes = [];
  let last = null;
  for (const finding of withFix) {
    if (last && fixesCollide(last, finding.fix)) continue;
    last = finding.fix;
    changes.push({ ...replaceAt(finding.fix.from, finding.fix.to, finding.fix.insert), meta: typographyMeta(finding.ruleId) });
  }
  return changes;
}

const dashLineFindings = (text) => checkTypography(text, { lineStartDash: 'dialogue' })
  .filter(finding => finding.ruleId === 'rivin-alun-viiva');

/** Every line-start "- " turned into a dialogue dash; indentation stays. */
function dashLineChanges(text) {
  return dashLineFindings(text).map(finding => ({ ...finding.convert, meta: typographyMeta('rivin-alun-viiva') }));
}

/** Lines that start with "- " (scene breaks are not among them). */
function countDashLines(text) {
  return dashLineFindings(text).length;
}

// ---------------------------------------------------------------------------
// Dialogue
// ---------------------------------------------------------------------------

/** A line of dialogue starts with a dash (– or —). */
function isDialogueLine(line) {
  return /^[ \t]*[–—]/.test(String(line == null ? '' : line));
}

/**
 * Quoted stretches of a line, marks included. The first mark opens a span and
 * the next one closes it; an unpaired mark runs to the end of the line.
 * Marks inside a note do not count: a note is not prose.
 * @returns {Array<[number, number]>}
 */
function quoteSpans(line) {
  const text = String(line == null ? '' : line);
  const ranges = protectedRanges(text);
  const spans = [];
  let open = -1;
  for (let i = 0; i < text.length; i++) {
    if (!'”"“»«'.includes(text[i]) || insideRanges(ranges, i)) continue;
    if (open === -1) {
      open = i;
    } else {
      spans.push([open, i + 1]);
      open = -1;
    }
  }
  if (open !== -1) spans.push([open, text.length]);
  return spans;
}

module.exports = {
  QUOTE,
  APOSTROPHE,
  DASH,
  SCENE_BREAK,
  TYPOGRAPHY_RULES,
  protectedRanges,
  effectiveLineStartDash,
  inputAction,
  smartReplace,
  toFinnishTypography,
  normaliseModelText,
  checkTypography,
  fixesFor,
  dashLineChanges,
  countDashLines,
  isDialogueLine,
  quoteSpans
};
