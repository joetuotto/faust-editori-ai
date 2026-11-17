/**
 * Protecting notes and formatting from a model
 *
 * maskSpans() replaces [TODO: …] notes, <u> tags, emphasis markers and
 * escapes with numbered placeholders before a text is sent; unmaskSpans() puts
 * them back into the reply before the diff is computed. A placeholder the
 * model dropped goes back to its place, so no suggestion can delete a note.
 * Pure functions (test/services/maskSpans.test.js).
 */
const { rawHunks } = require('../../editor/wordDiff.js');
const { splitBlocks } = require('../../editor/blocks.js');

// ⟦3⟧ stands for one protected span; ⟦4⟧ … ⟦/4⟧ for a pair of markers around text.
// The brackets are U+27E6 and U+27E7: they cannot occur in a manuscript by accident.
const placeholder = (id, role) => (role === 'close' ? `⟦/${id}⟧` : `⟦${id}⟧`);
// Global: use it with replace and matchAll only, never with test or exec
const PLACEHOLDER = /⟦(\/?)(\d+)⟧/g;
// What models turn ⟦7⟧ into: spaces inside, look-alike brackets, doubled ASCII brackets
// (a few spaces at most: unbounded \s* was quadratic on a long run of blank lines after "[")
const LOOSE_PLACEHOLDER = /[⟦〚【[]{1,2}[^\S\n]{0,3}(\/?)[^\S\n]{0,3}(\d+)[^\S\n]{0,3}[⟧〛】\]]{1,2}/g;
// Half a placeholder, as at the end of a cut reply: "⟦3", "⟦/", a lone "⟧", an empty "⟦⟧".
// Group 1 is a whole placeholder, which the replacer keeps
const PLACEHOLDER_DEBRIS = /(⟦\/?\d+⟧)|⟦\/?\d*⟧?|⟧/g;
// A note the model put before one of these lost the space that stood before it
const CLOSING_PUNCTUATION = /^[.,;:!?…”’)»]$/u;

// Own copies of the note and escape rules (contracts section 0, rule 9)
const LITERAL = /⟦\/?\d+⟧/g;
const TODO = /\[TODO:[^\]\n]*\]/g;
const QUOTED = /”[^”\n]*”|"[^"\n]*"|»[^»\n]*»|“[^”\n]*”/g;
const ESCAPE = /\\[*_#~>\\]/g;
const STRAY_TAG = /<\/?u>/g;
// Spans that stay where the author put them; the others travel with the text they belong to
const PINNED = new Set(['todo', 'line', 'prefix', 'literal']);

// Same spans as parseInline in utils/manuscript.js (kept in step by a parity test)
const SPAN_WORD = 'A-Za-z0-9À-ÖØ-öø-ÿ';
const INLINE_SPAN = new RegExp(
  [
    '(\\*\\*|__)(?=\\S)([\\s\\S]+?)(?<=\\S)\\1',                                    // 1,2 bold
    `(?<![${SPAN_WORD}_])_(?=\\S)([^_]+?)(?<=\\S)_(?![${SPAN_WORD}_])`,              // 3 italic _
    '(?<!\\*)\\*(?=[^\\s*])([^*]+?)(?<=[^\\s*])\\*(?!\\*)',                           // 4 italic *
    '~~(?=\\S)([\\s\\S]+?)(?<=\\S)~~',                                               // 5 strike
    '<u>([\\s\\S]+?)</u>'                                                             // 6 underline
  ].join('|')
);

// Spans that are lines, or the start of one, in the author's text
const LINE_KINDS = new Set(['line', 'prefix']);

// The horizontal whitespace next to a line break that is added goes: "sana ⟦2⟧" → "sana\n⟦2⟧"
function keepOnOwnLine(text, span) {
  const at = text.indexOf(span.token);
  if (at === -1) return text;
  let start = at;
  while (start > 0 && /[^\S\n]/u.test(text[start - 1])) start -= 1;
  const needBefore = start > 0 && text[start - 1] !== '\n';
  const head = needBefore ? `${text.slice(0, start)}\n` : text.slice(0, at);
  const tokenEnd = at + span.token.length;
  if (span.kind !== 'line') return head + text.slice(at);
  let end = tokenEnd;
  while (end < text.length && /[^\S\n]/u.test(text[end])) end += 1;
  const needAfter = end < text.length && text[end] !== '\n';
  const tail = needAfter ? `\n${text.slice(end)}` : text.slice(tokenEnd);
  return head + span.token + tail;
}

const asText = (value) => (value == null ? '' : String(value));
const keyOf = (id, role) => (role === 'close' ? `${id}/` : `${id}`);
const isBlank = (text) => text.trim() === '';

// The opening and closing markers of every inline span of one line, nested ones included
function inlineMarkers(line, base, out) {
  // Escaped markers must not open a span: blank them out, keeping the length
  const safe = line.replace(/\\[*_#~>\\]/g, '\ue000\ue000');
  const walk = (text, offset) => {
    let rest = text;
    let at = offset;
    while (rest.length > 0) {
      const match = INLINE_SPAN.exec(rest);
      if (!match) break;
      const start = at + match.index;
      let open;
      let inner;
      let kind = 'marker';
      if (match[2] !== undefined) { open = match[1].length; inner = match[2]; }
      else if (match[3] !== undefined) { open = 1; inner = match[3]; }
      else if (match[4] !== undefined) { open = 1; inner = match[4]; }
      else if (match[5] !== undefined) { open = 2; inner = match[5]; }
      else { open = 3; inner = match[6]; kind = 'tag'; }
      const close = match[0].length - open - inner.length;
      const innerStart = start + open;
      const closeStart = innerStart + inner.length;
      out.push({ from: base + start, to: base + innerStart, kind, role: 'open', partner: base + closeStart });
      out.push({ from: base + closeStart, to: base + closeStart + close, kind, role: 'close', partner: base + start });
      // The same way parseInline does it: search, slice, search again; nested spans by recursion
      walk(inner, innerStart);
      rest = rest.slice(match.index + match[0].length);
      at = start + match[0].length;
    }
  };
  walk(safe, 0);
}

function collect(regex, text, kind, out) {
  if (!regex || typeof regex.source !== 'string') return;
  const pattern = new RegExp(regex.source, `${regex.flags.replace(/[gy]/g, '')}g`);
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match[0].length === 0) {
      pattern.lastIndex += 1;
      continue;
    }
    out.push({ from: match.index, to: match.index + match[0].length, kind });
  }
}

/**
 * Replace everything a model must not touch with numbered placeholders.
 * @param {string} text
 * @param {{quoted?: boolean, structure?: boolean, quotes?: boolean, extra?: RegExp[]}} [options]
 *   quoted: protect speech in quotation marks; structure: protect headings, scene
 *   breaks, quote lines and list markers (for multi-line selections); quotes: with
 *   structure, leave the text of quote lines editable; extra: more patterns to protect
 * @returns {{text: string, source: string, hasProse: boolean,
 *   spans: Array<{id: number, role: null|'open'|'close', kind: string, text: string, token: string, from: number, to: number, at: number}>}}
 */
function maskSpans(text, options) {
  const source = asText(text);
  const { quoted = false, structure = false, quotes = false, extra = [] } = options || {};
  const extraPatterns = Array.isArray(extra) ? extra : [extra];

  // Candidate groups in priority order
  const groups = [];
  const add = (fill) => {
    const list = [];
    fill(list);
    groups.push(list);
  };

  add((list) => collect(LITERAL, source, 'literal', list));
  if (structure) {
    add((list) => {
      for (const block of splitBlocks(source)) {
        if (block.kind === 'heading' || block.kind === 'break' || (block.kind === 'quote' && !quotes)) {
          if (block.to > block.from) list.push({ from: block.from, to: block.to, kind: 'line' });
        } else if ((block.kind === 'list' || block.kind === 'quote') && block.bodyFrom > block.from) {
          list.push({ from: block.from, to: block.bodyFrom, kind: 'prefix' });
        }
      }
    });
  }
  add((list) => collect(TODO, source, 'todo', list));
  if (quoted) add((list) => collect(QUOTED, source, 'quoted', list));
  for (const pattern of extraPatterns) add((list) => collect(pattern, source, 'extra', list));
  add((list) => collect(ESCAPE, source, 'escape', list));
  add((list) => {
    let lineStart = 0;
    for (const line of source.split('\n')) {
      inlineMarkers(line, lineStart, list);
      lineStart += line.length + 1;
    }
  });
  add((list) => collect(STRAY_TAG, source, 'tag', list));

  // A candidate that overlaps accepted spans is dropped, with its partner. The exception
  // is a whole span (not half a pair) that contains them completely: it replaces them,
  // so a quotation swallows a note inside it.
  let accepted = [];
  for (const list of groups) {
    const lostPartner = new Set();
    for (const candidate of list) {
      const overlapping = accepted.filter(span => span.from < candidate.to && span.to > candidate.from);
      if (overlapping.length === 0) continue;
      const swallows = candidate.role === undefined && overlapping.every(span =>
        span.from >= candidate.from && span.to <= candidate.to && !(span.from === candidate.from && span.to === candidate.to));
      if (swallows) {
        const partners = new Set(overlapping.filter(span => span.partner !== undefined).map(span => span.partner));
        accepted = accepted.filter(span => !overlapping.includes(span) && !(span.role !== undefined && partners.has(span.from)));
      } else {
        candidate.skip = true;
        if (candidate.partner !== undefined) lostPartner.add(candidate.partner);
      }
    }
    for (const candidate of list) {
      if (!candidate.skip && !lostPartner.has(candidate.from)) accepted.push(candidate);
    }
  }
  accepted.sort((a, b) => a.from - b.from);

  // Numbers run from 1 in text order; a pair takes the number at its opening marker
  const idAt = new Map();
  let nextId = 1;
  for (const span of accepted) {
    if (span.role !== 'close') idAt.set(span.from, nextId++);
  }

  let masked = '';
  let cursor = 0;
  const spans = accepted.map((span) => {
    const id = span.role === 'close' ? idAt.get(span.partner) : idAt.get(span.from);
    const role = span.role || null;
    const token = placeholder(id, role);
    masked += source.slice(cursor, span.from);
    const at = masked.length;
    masked += token;
    cursor = span.to;
    return { id, role, kind: span.kind, text: source.slice(span.from, span.to), token, from: span.from, to: span.to, at };
  });
  masked += source.slice(cursor);

  // A line that is only a note has nothing for a model
  const hasProse = /[\p{L}\p{N}]/u.test(masked.replace(PLACEHOLDER, ' '));
  return { text: masked, source, spans, hasProse };
}

/**
 * Put the protected spans back into a model's version of a masked text.
 * The lists hold placeholder numbers, sorted and without repeats.
 * @param {string} output the model's text
 * @param {object} mask what maskSpans returned
 * @returns {{text: string, restored: number[], repositioned: number[], displaced: number[],
 *   duplicates: number[], dropped: number[], unknown: number}}
 */
function unmaskSpans(output, mask) {
  const spans = mask && Array.isArray(mask.spans) ? mask.spans : [];
  const source = mask ? asText(mask.source) : '';
  const maskedText = mask ? asText(mask.text) : '';
  const byKey = new Map(spans.map(span => [keyOf(span.id, span.role), span]));
  const report = { restored: [], repositioned: [], displaced: [], duplicates: [], dropped: [], unknown: 0 };

  // 1. Line breaks
  let out = asText(output).replace(/\r\n?/g, '\n');

  // 2. Read the placeholders. Exact forms first: unknown ones and repeats go
  const seen = new Set();
  out = out.replace(PLACEHOLDER, (match, slash, digits) => {
    const id = Number(digits);
    const role = slash ? 'close' : null;
    const key = keyOf(id, role);
    if (!byKey.has(key)) { report.unknown += 1; return ''; }
    if (seen.has(key)) { report.duplicates.push(id); return ''; }
    seen.add(key);
    // "⟦01⟧" is read as ⟦1⟧ and written that way, so the later steps find it
    return placeholder(id, role);
  });
  // Then look-alikes, only for placeholders that are still missing
  out = out.replace(LOOSE_PLACEHOLDER, (match, slash, digits) => {
    const id = Number(digits);
    const role = slash ? 'close' : null;
    const key = keyOf(id, role);
    if (match === placeholder(id, role)) return match;
    if (!byKey.has(key) || seen.has(key)) return match; // "[12]" is a footnote, not ours
    if (source.includes(match)) return match; // was in the text all along
    seen.add(key);
    return placeholder(id, role);
  });
  // Last, debris of ours, unless the author's text uses these brackets
  if (!/[⟦⟧]/.test(source)) {
    // Exact placeholders stay; every other bracket of ours goes ("⟦3", "⟦⟧", "⟦/⟧", a lone "⟧")
    out = out.replace(PLACEHOLDER_DEBRIS, (match, exact) => {
      if (exact) return exact;
      report.unknown += 1;
      return '';
    });
  }

  // 3. Align the reply with the masked text. Placeholders are single tokens and not
  // fixed points: the diff has to show which ones moved
  const align = () => rawHunks(maskedText, out, { atomic: PLACEHOLDER, anchor: false });
  const hunkOf = (hunks, span) => hunks.find(hunk => hunk.from <= span.at && span.at + span.token.length <= hunk.to);
  let hunks = align();

  // 4. A pinned span the model moved is taken out again; step 5 puts it back in its place.
  // A travelling one stays where the model put it. Taking one out changes the alignment,
  // and a pinned span that was in place before can now be out of place: repeat until a
  // round removes nothing (each round removes one or more, so this ends)
  let removedAny = true;
  while (removedAny) {
    removedAny = false;
    for (const span of spans) {
      const key = keyOf(span.id, span.role);
      if (!PINNED.has(span.kind) || !seen.has(key) || !hunkOf(hunks, span)) continue;
      const at = out.indexOf(span.token);
      if (at === -1) continue;
      const before = at > 0 ? out[at - 1] : '';
      const after = at + span.token.length < out.length ? out[at + span.token.length] : '';
      // "sana ⟦5⟧ sana" becomes "sana sana", not "sana  sana"; "sana ⟦5⟧." becomes "sana."
      const dropSpace = before !== '' && /[^\S\n]/u.test(before) &&
        (after === '' || /\s/u.test(after) || CLOSING_PUNCTUATION.test(after));
      // A line span the model put on a line of its own takes that line with it:
      // "Kappale.\n⟦1⟧" becomes "Kappale.", not "Kappale.\n"
      const ownLine = LINE_KINDS.has(span.kind) && (before === '' || before === '\n') &&
        (after === '' || after === '\n');
      const cutBefore = dropSpace || (ownLine && before === '\n') ? 1 : 0;
      const cutAfter = ownLine && before === '' && after === '\n' ? 1 : 0;
      out = out.slice(0, at - cutBefore) + out.slice(at + span.token.length + cutAfter);
      seen.delete(key);
      report.repositioned.push(span.id);
      removedAny = true;
    }
    if (removedAny) hunks = align();
  }
  // Travelling spans are judged against the final alignment
  for (const span of spans) {
    if (!PINNED.has(span.kind) && seen.has(keyOf(span.id, span.role)) && hunkOf(hunks, span)) {
      report.displaced.push(span.id);
    }
  }

  // 5. Missing placeholders go back to where they were, mapped through the diff
  const missing = spans.filter(span => !seen.has(keyOf(span.id, span.role)));
  if (missing.length > 0) {
    const inserts = [];
    const handled = new Set();
    const noteRestored = (id) => { if (!report.repositioned.includes(id)) report.restored.push(id); };

    for (const span of missing) {
      const key = keyOf(span.id, span.role);
      if (handled.has(key)) continue;
      handled.add(key);

      const hunk = hunkOf(hunks, span);
      if (!hunk) {
        // Cannot happen with a minimal diff; keep the placeholder near its old place
        inserts.push({ at: Math.min(span.at, out.length), text: span.token, order: span.at });
        noteRestored(span.id);
        continue;
      }

      const removed = maskedText.slice(hunk.from, hunk.to);
      if (hunk.rFrom === hunk.rTo && /^(?:\s|⟦\/?\d+⟧)*$/u.test(removed)) {
        // Only placeholders and spaces were cut: the whole piece goes back as it was,
        // without the placeholders the model kept somewhere else
        const piece = removed.replace(PLACEHOLDER, (match, slash, digits) => {
          const id = Number(digits);
          const pieceKey = keyOf(id, slash ? 'close' : null);
          if (seen.has(pieceKey)) return '';
          if (pieceKey === key || !handled.has(pieceKey)) {
            handled.add(pieceKey);
            noteRestored(id);
          }
          return match;
        });
        inserts.push({ at: hunk.rFrom, text: piece, order: span.at });
        continue;
      }

      // The end of the change it was closer to
      const p = span.at;
      const q = p + span.token.length;
      const at = p - hunk.from <= hunk.to - q ? hunk.rFrom : hunk.rTo;
      let piece = span.token;
      if (!span.role && span.kind !== 'escape' && !LINE_KINDS.has(span.kind)) {
        // A note keeps the spaces it had around it (line breaks of structure: step 5b)
        const spaceBefore = p > 0 && /\s/u.test(maskedText[p - 1]);
        const spaceAfter = q < maskedText.length && /\s/u.test(maskedText[q]);
        if (spaceBefore && at > 0 && !/\s/u.test(out[at - 1])) piece = ` ${piece}`;
        if (spaceAfter && at < out.length && !/\s/u.test(out[at])) piece += ' ';
      }
      inserts.push({ at, text: piece, order: p });
      noteRestored(span.id);
    }

    // Several insertions at one position keep their original order
    inserts.sort((a, b) => a.at - b.at || a.order - b.order);
    let rebuilt = '';
    let cursor = 0;
    for (const insert of inserts) {
      rebuilt += out.slice(cursor, insert.at) + insert.text;
      cursor = insert.at;
    }
    out = rebuilt + out.slice(cursor);
  }

  // 5b. With structure, a heading, scene break or quote line stays on a line of its own
  // and a list marker at the start of a line, wherever the model left text around them
  for (const span of spans) {
    if (LINE_KINDS.has(span.kind)) out = keepOnOwnLine(out, span);
  }

  // 6. Pairs: a closing marker before its opening one is swapped; a pair left empty
  // goes with the word it marked. Inner pairs first, so that a pair around an empty
  // pair is empty too
  const openers = spans.filter(span => span.role === 'open');
  for (let i = openers.length - 1; i >= 0; i--) {
    const opener = openers[i];
    const closer = byKey.get(keyOf(opener.id, 'close'));
    if (!closer) continue;
    const open = opener.token;
    const close = closer.token;
    const openAt = out.indexOf(open);
    const closeAt = out.indexOf(close);
    if (openAt === -1 || closeAt === -1) continue;
    if (closeAt < openAt) {
      out = out.slice(0, closeAt) + open + out.slice(closeAt + close.length, openAt) + close + out.slice(openAt + open.length);
    }
    const start = out.indexOf(open);
    const between = out.slice(start + open.length, out.indexOf(close));
    // A pair that was empty in the author's text (<u> </u>) lost nothing
    const wasBlank = isBlank(maskedText.slice(opener.at + open.length, closer.at));
    if (isBlank(between) && !wasBlank) {
      out = out.slice(0, start) + between + out.slice(start + open.length + between.length + close.length);
      report.dropped.push(opener.id);
    }
  }

  // 7. Placeholders become the original spans again
  out = out.replace(PLACEHOLDER, (match, slash, digits) => {
    const span = byKey.get(keyOf(Number(digits), slash ? 'close' : null));
    return span ? span.text : '';
  });

  const unique = (list) => [...new Set(list)].sort((a, b) => a - b);
  const dropped = unique(report.dropped);
  return {
    text: out,
    restored: unique(report.restored).filter(id => !dropped.includes(id)),
    repositioned: unique(report.repositioned),
    displaced: unique(report.displaced).filter(id => !dropped.includes(id)),
    duplicates: unique(report.duplicates),
    dropped,
    unknown: report.unknown
  };
}

const PLACEHOLDER_INSTRUCTION = {
  fi: 'Tekstissä on paikkamerkkejä: yksittäisiä muotoa ⟦1⟧ ja pareja muotoa ⟦2⟧…⟦/2⟧, jotka ympäröivät sanaa tai sanoja. Ne suojaavat muotoiluja ja muistiinpanoja. Säilytä jokainen paikkamerkki täsmälleen sellaisenaan. Yksittäinen paikkamerkki pysyy samassa kohdassa, ja pari pysyy saman tekstin ympärillä. Älä lisää, poista tai numeroi paikkamerkkejä uudelleen.',
  en: 'The text contains placeholders: single ones like ⟦1⟧ and pairs like ⟦2⟧…⟦/2⟧ that wrap a word or words. They protect formatting and notes. Keep every placeholder exactly as it is. A single placeholder stays in the same place, and a pair stays around the same text. Do not add, remove or renumber placeholders.'
};

/** The sentence every request that sends masked text must include. 'en' gives English, anything else Finnish. */
function placeholderInstruction(language) {
  return PLACEHOLDER_INSTRUCTION[language === 'en' ? 'en' : 'fi'];
}

module.exports = { maskSpans, unmaskSpans, placeholder, placeholderInstruction, PLACEHOLDER };
