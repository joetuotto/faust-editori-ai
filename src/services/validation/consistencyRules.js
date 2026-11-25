/**
 * Consistency rules: the pattern rules of the consistency checker
 *
 * Precision before recall: a rule that cannot tell reliably reports nothing,
 * and the checker's model step covers the rest. What each rule takes as a
 * clear case is said at the rule.
 *
 * One form rule for names: the Tarinakansio matcher (codex.matchPrepared over
 * termMatch). A name or an alias matches from the start of a word and any
 * ending is allowed; a stem that changes when the word is inflected is an
 * alias the author gives (Pekka → Peka). Nothing here inflects a word.
 *
 * [TODO: …] notes are not manuscript text: every rule searches the text as
 * stripTodos leaves it, and every reported place is an offset in the real
 * text of the chapter.
 *
 * Pure functions, no DOM (test/services/consistencyRules.test.js). The checker
 * (ConsistencyChecker.js) is a plain script: app.js hands this module to it.
 */

const { compileTerms, findTermMatches, todoRanges } = require('../../editor/termMatch.js');
const { prepareEntries, matchPrepared } = require('../story/codex.js');
const { stripTodos } = require('../ai/contextBuilder.js');
const { splitSentences } = require('../../editor/sentences.js');

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const recordsOf = (value) => (Array.isArray(value) ? value.filter(isRecord) : []);
const asText = (value) => (typeof value === 'string' ? value : '');
const fold = (word) => String(word).normalize('NFC').toLocaleLowerCase('fi');
const letterCount = (word) => (String(word).match(/\p{L}/gu) || []).length;
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A space inside a line; a statement or a date never runs over a line break
const GAP = '[ \\u00A0]+';

// ---------------------------------------------------------------------------
// The text a rule reads
// ---------------------------------------------------------------------------

/**
 * A chapter's text without its notes, and the way back to the real text.
 * toReal(from, to) gives the place of a range of the read text in the real one.
 * @returns {{ text: string, toReal: (from: number, to?: number) => { position: number, length: number } }}
 */
function readable(content) {
  const real = asText(content);
  const notes = todoRanges(real);
  if (notes.length === 0) {
    return { text: real, toReal: (from, to = from) => ({ position: from, length: Math.max(0, to - from) }) };
  }

  // stripTodos only removes: the notes, and white space next to them. So the read text lies in
  // the real one in order, outside the notes.
  const text = stripTodos(real);
  const places = new Array(text.length);
  let at = 0;
  let note = 0;
  for (let index = 0; index < text.length; index++) {
    for (;;) {
      while (note < notes.length && notes[note].end <= at) note++;
      if (note < notes.length && notes[note].start <= at) {
        at = notes[note].end;
        continue;
      }
      if (at >= real.length || real[at] === text[index]) break;
      at++;
    }
    places[index] = Math.min(at, real.length);
    at++;
  }

  const toReal = (from, to = from) => {
    if (text.length === 0) return { position: 0, length: 0 };
    const first = Math.min(Math.max(from, 0), text.length - 1);
    const position = places[first];
    if (to <= from) return { position, length: 0 };
    return { position, length: places[Math.min(to, text.length) - 1] + 1 - position };
  };
  return { text, toReal };
}

// A chapter is read once per content string
const readCache = new WeakMap();

function readChapter(chapter) {
  const content = asText(chapter && chapter.content);
  const cached = isRecord(chapter) ? readCache.get(chapter) : null;
  if (cached && cached.content === content) return cached.read;
  const read = readable(content);
  if (isRecord(chapter)) readCache.set(chapter, { content, read });
  return read;
}

// A chapter's name as the app shows it
const titleOf = (chapter) => asText(chapter && chapter.title).trim() || 'Nimetön luku';

// The chapters with their place in project.structure
function chaptersOf(project) {
  const structure = project && Array.isArray(project.structure) ? project.structure : [];
  return structure
    .map((chapter, chapterIndex) => ({ chapter, chapterIndex }))
    .filter(({ chapter }) => isRecord(chapter) && asText(chapter.content) !== '');
}

// ---------------------------------------------------------------------------
// Names the project knows
// ---------------------------------------------------------------------------

const nameOf = (character) => asText(character && character.name).normalize('NFC').trim();

/** The words of a name that have at least three letters: "Aino Lehto" gives Aino and Lehto. */
function nameWords(name) {
  return [...new Set(String(name).split(/\s+/).filter(word => letterCount(word) >= 3))];
}

// The Tarinakansio entry of the same name carries the character's aliases, stems and exclusions
function codexEntryOf(project, name) {
  const key = fold(name);
  return recordsOf(project && project.codex).find(entry => fold(asText(entry.name).trim()) === key) || null;
}

const stringsOf = (value) => (Array.isArray(value) ? value.filter(item => typeof item === 'string') : []);

/**
 * A character as the Tarinakansio matcher reads an entry: the whole name, each of its words (a
 * novel calls its people by first name) and the aliases and exclusions of the entry of the same
 * name. null for a character without a name of three letters.
 */
function characterEntry(project, character, order = 0) {
  const name = nameOf(character);
  if (letterCount(name) < 3) return null;
  const entry = codexEntryOf(project, name);
  return {
    id: `character:${order}`,
    name,
    aliases: [...nameWords(name), ...stringsOf(entry && entry.aliases)],
    exclude: stringsOf(entry && entry.exclude)
  };
}

const TYPE_PLACE = 'paikka';

/**
 * Every name the project knows, as entries for the matcher: the characters, the Tarinakansio
 * entries and the places. kind is 'character', 'place' or 'entry'.
 */
function knownEntries(project) {
  const entries = [];
  recordsOf(project && project.characters).forEach((character, order) => {
    const entry = characterEntry(project, character, order);
    if (entry) entries.push({ ...entry, kind: 'character' });
  });
  recordsOf(project && project.codex).forEach((entry, order) => {
    const name = asText(entry.name).trim();
    if (!name) return;
    entries.push({
      id: `codex:${order}`,
      name,
      aliases: stringsOf(entry.aliases),
      exclude: stringsOf(entry.exclude),
      kind: entry.type === TYPE_PLACE ? 'place' : 'entry'
    });
  });
  recordsOf(project && project.locations).forEach((location, order) => {
    const name = asText(location.name).trim();
    if (name) entries.push({ id: `location:${order}`, name, aliases: [], exclude: [], kind: 'place' });
  });
  return entries;
}

// ---------------------------------------------------------------------------
// Mentions of a character (what the model step reads)
// ---------------------------------------------------------------------------

/**
 * The sentences that mention a character, per chapter: the first `limit` of each chapter, cut by
 * the app's sentence rule (a date or an abbreviation does not end a sentence), notes left out.
 * @returns {Array<{ chapterIndex: number, chapterTitle: string, sentences: string[] }>}
 */
function mentionSentences(project, character, limit = 5) {
  const entry = characterEntry(project, character);
  if (!entry) return [];
  const prepared = prepareEntries([entry]);

  const mentions = [];
  for (const { chapter, chapterIndex } of chaptersOf(project)) {
    const { text } = readChapter(chapter);
    const starts = matchPrepared(text, prepared).matches.map(match => match.start);
    if (starts.length === 0) continue;

    const sentences = [];
    let next = 0;
    for (const sentence of splitSentences(text)) {
      while (next < starts.length && starts[next] < sentence.from) next++;
      if (next >= starts.length) break;
      if (starts[next] >= sentence.to) continue;
      sentences.push(text.slice(sentence.from, sentence.to));
      if (sentences.length >= limit) break;
    }
    if (sentences.length > 0) mentions.push({ chapterIndex, chapterTitle: titleOf(chapter), sentences });
  }
  return mentions;
}

// ---------------------------------------------------------------------------
// Name variations
// ---------------------------------------------------------------------------

// A capitalised word in the middle of a sentence is a name. At the start of a sentence, and
// after a colon, every word is capitalised ("Kuka siellä?"), so those places say nothing.
const NAME_IN_SENTENCE = /(?<=[\p{Ll},;][ \t\u00A0]+)\p{Lu}\p{Ll}+(?![\p{L}\p{N}]|[-'’:]\p{L})/gu;

/**
 * Are the two spellings the same but for one letter written once in one and twice in the other
 * (Katariina / Katarina, Aino / Ainno)? This is the only difference taken as "the same name
 * spelled two ways": a changed or added letter is as often another name (Maria / Marja,
 * Kirsi / Kirsti), and an ending is an inflected form, which the form rule decides.
 */
function differsByDoubledLetter(a, b) {
  const one = fold(a);
  const other = fold(b);
  const [short, long] = one.length < other.length ? [one, other] : [other, one];
  if (long.length - short.length !== 1) return false;

  let index = 0;
  while (index < short.length && short[index] === long[index]) index++;
  // The extra letter of the longer spelling stands at index, after the common start: it must
  // repeat the letter before it
  return index > 0 && long[index] === long[index - 1] && long.slice(index + 1) === short.slice(index);
}

/**
 * Name variations: a name written in two base spellings.
 *
 * A word is a variation of a name word of a character when it stands capitalised in the middle
 * of a sentence, is no form of any name the project knows (a character, an alias, an entry, a
 * place: the form rule decides, so Ainon, Ainolle and, with the stem as alias, Pekan are forms)
 * and differs from the name word only by one doubled letter. An inflected form whose stem
 * changes without a stem alias (Pekan, Virtasen) is not a form by the rule, and no variation
 * either: it is not the name with one letter doubled.
 *
 * One finding per name word. Its characterName is the spelling to keep, as the fix texts and the
 * auto-fix read it. occurrences: the first place of each variation, in the real text.
 */
function nameFindings(project) {
  const characters = recordsOf(project && project.characters);
  const targets = [];
  const taken = new Set();
  for (const character of characters) {
    const name = nameOf(character);
    if (letterCount(name) < 3) continue;
    nameWords(name).forEach((word, order) => {
      // Two characters of one family share the word: one finding is enough
      if (taken.has(fold(word))) return;
      taken.add(fold(word));
      targets.push({ character, word, order, variants: new Map() });
    });
  }
  if (targets.length === 0) return [];

  const known = prepareEntries(knownEntries(project));
  for (const { chapter } of chaptersOf(project)) {
    const read = readChapter(chapter);
    const mentions = matchPrepared(read.text, known).matches;
    let next = 0;

    NAME_IN_SENTENCE.lastIndex = 0;
    let match;
    while ((match = NAME_IN_SENTENCE.exec(read.text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      while (next < mentions.length && mentions[next].end <= start) next++;
      if (next < mentions.length && mentions[next].start < end) continue; // a form of a known name

      for (const target of targets) {
        if (target.variants.has(match[0]) || !differsByDoubledLetter(match[0], target.word)) continue;
        target.variants.set(match[0], {
          chapterId: chapter.id,
          chapterTitle: titleOf(chapter),
          content: match[0],
          ...read.toReal(start, end)
        });
      }
    }
  }

  const findings = [];
  for (const target of targets) {
    if (target.variants.size === 0) continue;
    const variants = Array.from(target.variants.keys());
    const finding = {
      id: `name-${target.character.id}${target.order > 0 ? `-${target.order}` : ''}`,
      type: 'name_variation',
      severity: 'medium',
      category: 'naming',
      characterId: target.character.id,
      characterName: target.word,
      message: `Possible name variations: ${variants.join(', ')}`,
      variations: [target.word, ...variants],
      occurrences: Array.from(target.variants.values()),
      suggestedFix: `Standardize to "${target.word}"`,
      autoFixable: false
    };
    finding.autoFixable = planNameFix(project, finding).safe;
    findings.push(finding);
  }
  return findings;
}

// A word as the form rule reads one: letters, digits, an apostrophe, a colon ending (EU:n)
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’]*(?::\p{L}+)?/gu;

// Every word of the manuscript, folded, notes left out
function manuscriptWords(project) {
  const words = new Set();
  for (const { chapter } of chaptersOf(project)) {
    for (const word of readChapter(chapter).text.match(WORD) || []) words.add(fold(word));
  }
  return words;
}

const isUpperCase = (text) => text.length > 1 && text === text.toLocaleUpperCase('fi') && text !== text.toLocaleLowerCase('fi');

/**
 * The plan of the auto-fix of a name variation: where each variation is written, and what the
 * place becomes. Only the variation's stem is replaced; the ending stays as written.
 *
 * A place is found by the form rule (the variation at the start of a word, any ending; its
 * word boundaries know ä and ö; the name is escaped), outside notes, and never where a known
 * name starts. An ending is trusted only when the manuscript itself writes the kept spelling
 * with that ending (Katarinan → Katariinan needs a Katariinan somewhere): nothing here knows
 * which letters are an ending, and the kept name may inflect differently (Peka for Pekka: Pekan
 * is right as it stands). One place that cannot be trusted makes the whole plan unsafe, and an
 * unsafe plan changes nothing.
 *
 * @returns {{ safe: boolean, count: number, correctName: string,
 *   chapters: Array<{ id: *, content: string, changes: Array<{ from: number, to: number, insert: string }> }> }}
 */
function planNameFix(project, finding) {
  const variations = stringsOf(finding && finding.variations);
  const correct = asText(finding && finding.characterName) || variations[0] || '';
  const variants = variations.filter(variant => variant && fold(variant) !== fold(correct));
  const unsafe = { safe: false, count: 0, correctName: correct, chapters: [] };
  if (!correct || variants.length === 0) return unsafe;

  const knownTerms = knownEntries(project).flatMap(entry => [entry.name, ...entry.aliases]);
  const known = compileTerms(knownTerms);
  const compiled = variants.map(variant => ({ variant, terms: compileTerms([variant]) }));
  let written = null;

  const chapters = [];
  let count = 0;
  for (const { chapter } of chaptersOf(project)) {
    const content = chapter.content;
    const skip = todoRanges(content);
    const changes = [];

    for (const { variant, terms } of compiled) {
      for (const hit of findTermMatches(content, terms, { exclude: known, skip })) {
        const stem = hit.text.slice(0, variant.length);
        const ending = hit.text.slice(variant.length);
        if (fold(stem) !== fold(variant)) return unsafe; // letters encoded another way: not ours to cut
        if (ending) {
          if (!written) written = manuscriptWords(project);
          if (!written.has(fold(correct + ending))) return unsafe;
        }
        changes.push({
          from: hit.start,
          to: hit.end,
          insert: (isUpperCase(stem) ? correct.toLocaleUpperCase('fi') : correct) + ending
        });
      }
    }
    if (changes.length === 0) continue;

    changes.sort((a, b) => a.from - b.from);
    let text = '';
    let last = 0;
    for (const change of changes) {
      if (change.from < last) return unsafe; // two variations claim the same letters
      text += content.slice(last, change.from) + change.insert;
      last = change.to;
    }
    chapters.push({ id: chapter.id, content: text + content.slice(last), changes });
    count += changes.length;
  }

  return count > 0 ? { safe: true, count, correctName: correct, chapters } : unsafe;
}

// ---------------------------------------------------------------------------
// Dates and the timeline
// ---------------------------------------------------------------------------

const MONTHS = ['tammikuu', 'helmikuu', 'maaliskuu', 'huhtikuu', 'toukokuu', 'kesäkuu',
  'heinäkuu', 'elokuu', 'syyskuu', 'lokakuu', 'marraskuu', 'joulukuu'];

// A date does not touch a letter or a digit, and is no piece of a longer run of numbers
// (1.2.3.2020, 978-952-…): not after "digit and separator", not before "separator and digit".
// A hyphen is a separator only for the form written with hyphens: 1.5.2020-3.5.2020 is two dates.
const alone = (separators) => [
  `(?<![\\p{L}\\p{N}])(?<!\\p{N}[${separators}])`,
  `(?![\\p{L}\\p{N}])(?![${separators}]\\p{N})`
];
const [DOTTED_BEFORE, DOTTED_AFTER] = alone('.\\/');
const [HYPHENED_BEFORE, HYPHENED_AFTER] = alone('.\\/-');

// 1.5.2020 or 1/5/2020 (one separator, the day first), 2020-05-01, 1. toukokuuta 2020
const DATE_NUMERIC = new RegExp(`${DOTTED_BEFORE}(\\d{1,2})([.\\/])(\\d{1,2})\\2(\\d{4})${DOTTED_AFTER}`, 'gu');
const DATE_ISO = new RegExp(`${HYPHENED_BEFORE}(\\d{4})-(\\d{2})-(\\d{2})${HYPHENED_AFTER}`, 'gu');
const DATE_MONTH_NAME = new RegExp(`${DOTTED_BEFORE}(\\d{1,2})\\.?${GAP}(${MONTHS.join('|')})(?:ta)?${GAP}(\\d{4})${DOTTED_AFTER}`, 'giu');

// A day of the calendar in a year written with four digits, or null: 31.2.2020, 12.40.2020 and
// 45.13.2020 are numbers, not dates
function calendarDate(year, month, day) {
  if (year < 1000 || month < 1 || month > 12 || day < 1) return null;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function getContextAround(text, position, length = 50) {
  const start = Math.max(0, position - length);
  const end = Math.min(text.length, position + length);
  return (start > 0 ? '...' : '') + text.substring(start, end) + (end < text.length ? '...' : '');
}

/**
 * The dates of a text, in the order they stand in it.
 * @returns {Array<{ dateText: string, date: Date, position: number, context: string }>}
 */
function extractDates(text) {
  const value = asText(text);
  const dates = [];
  const collect = (pattern, read) => {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(value)) !== null) {
      const date = read(match);
      if (!date) continue;
      dates.push({ dateText: match[0], date, position: match.index, context: getContextAround(value, match.index, 50) });
    }
  };

  collect(DATE_NUMERIC, match => calendarDate(Number(match[4]), Number(match[3]), Number(match[1])));
  collect(DATE_ISO, match => calendarDate(Number(match[1]), Number(match[2]), Number(match[3])));
  collect(DATE_MONTH_NAME, match => calendarDate(Number(match[3]), MONTHS.indexOf(match[2].toLowerCase()) + 1, Number(match[1])));

  return dates.sort((a, b) => a.position - b.position);
}

/**
 * Timeline: a chapter whose latest date is earlier than the latest date of the chapter with
 * dates before it. The latest date stands for the chapter's own time, because a text names
 * earlier days beside its own (a birthday, the date of a letter) far more often than later
 * ones; so a chapter that also names a day after the earlier chapter gives no finding.
 * occurrences: the two dates, each at its place in the real text.
 */
function timelineFindings(project) {
  const dated = [];
  for (const { chapter } of chaptersOf(project)) {
    const read = readChapter(chapter);
    const dates = extractDates(read.text);
    if (dates.length === 0) continue;
    const latest = dates.reduce((a, b) => (b.date > a.date ? b : a));
    dated.push({
      chapter,
      date: latest.date,
      dateText: latest.dateText,
      context: latest.context,
      place: read.toReal(latest.position, latest.position + latest.dateText.length)
    });
  }

  const occurrence = (item) => ({
    chapterId: item.chapter.id,
    chapterTitle: titleOf(item.chapter),
    content: item.dateText,
    context: item.context,
    ...item.place
  });

  const findings = [];
  for (let index = 1; index < dated.length; index++) {
    const prev = dated[index - 1];
    const curr = dated[index];
    if (!(curr.date < prev.date)) continue;
    findings.push({
      id: `timeline-${index}`,
      type: 'timeline_error',
      severity: 'critical',
      category: 'timeline',
      message: 'Timeline contradiction',
      description: `${titleOf(curr.chapter)} (${curr.dateText}) tapahtuu ennen ${titleOf(prev.chapter)} (${prev.dateText})`,
      occurrences: [occurrence(prev), occurrence(curr)],
      suggestedFix: 'Tarkista aikajana – tapahtumat ovat väärässä järjestyksessä.',
      autoFixable: false
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

// A clear statement of where a character is: the character as the subject at the start of a
// sentence, one of these verbs, and the place, with nothing after it in the clause
const BEING = ['on', 'oli', 'asuu', 'asui'];
const ARRIVING = ['saapuu', 'saapui', 'tulee', 'tuli', 'menee', 'meni', 'palaa', 'palasi'];
const BETWEEN = ['jo', 'taas', 'yhä', 'vielä', 'nyt', 'jälleen', 'vihdoin', 'viimein'];

// The local case of the place word. A place the project knows may stand in the inner or the
// outer case (asemalla, asemalle). A capitalised word the project does not know counts only in
// the inner case (Helsingissä, Helsinkiin): the outer one is as often a person (Eerolla, Eerolle).
const AT_KNOWN = /(?:ssa|ssä|lla|llä)$/u;
const TO_KNOWN = /(?:([aeiouyäö])\1n|seen|siin|h[aeiouyäö]n|lle)$/u;
const AT_UNKNOWN = /(?:ssa|ssä)$/u;
const TO_UNKNOWN = /(?:([aeiouyäö])\1n|seen|siin|h[aeiouyäö]n)$/u;
const CAPITALISED_WORD = /^\p{Lu}\p{Ll}+$/u;

// Words that tell of a move. In the later chapter's title or text, or after the statement in
// the earlier chapter, they explain a change of place.
const TRAVEL_WORDS = ['matka', 'matkust', 'saapu', 'lähtö', 'lähti', 'lähte', 'muutto', 'muutt', 'journey', 'arrival', 'departure'];

function hasTravelWords(text) {
  const value = asText(text).toLowerCase();
  return TRAVEL_WORDS.some(word => value.includes(word));
}

// A line of speech: what a person says is a claim, not the narrator's statement
const SPEECH_LINE = /^[ \t\u00A0]*[–—\-"”“»«]/u;

const quotedText = (alias) => alias.replace(/^["”“»]|["”“»]$/g, '').trim();

// The words a character can be the subject by: the whole name, its words and its aliases, as
// written. A word that two characters share names neither of them.
function subjectNames(project, characters) {
  const lists = characters.map(character => {
    const name = nameOf(character);
    if (letterCount(name) < 3) return [];
    const entry = codexEntryOf(project, name);
    const aliases = stringsOf(entry && entry.aliases).map(quotedText);
    return [...new Set([name, ...nameWords(name), ...aliases].filter(word => letterCount(word) >= 3))];
  });

  const owners = new Map();
  for (const list of lists) for (const word of list) owners.set(fold(word), (owners.get(fold(word)) || 0) + 1);
  return lists.map(list => list.filter(word => owners.get(fold(word)) === 1));
}

function statementPattern(names) {
  const subject = names.slice().sort((a, b) => b.length - a.length).map(escapeRegExp).join('|');
  const verbs = [...BEING, ...ARRIVING].join('|');
  return new RegExp(
    `^(?:${subject})${GAP}(${verbs})(?:${GAP}(?:${BETWEEN.join('|')}))?${GAP}(\\p{L}[^.,;:!?…\\n]*?)[ \\u00A0]*(?=[.,;:!?…]|$)`,
    'u'
  );
}

// The place a statement names, or null when the phrase is no clear place
function placeOf(phrase, arriving, places, others) {
  const words = phrase.split(/[ \u00A0]+/);
  const whole = matchPrepared(phrase, places.prepared).matches.find(match => match.start === 0 && match.end === phrase.length);
  if (whole) {
    const local = arriving ? TO_KNOWN : AT_KNOWN;
    if (!words.some(word => local.test(word))) return null;
    return { known: true, key: fold(places.names.get(whole.entryId)), word: phrase };
  }

  if (words.length !== 1 || !CAPITALISED_WORD.test(phrase)) return null;
  if (!(arriving ? TO_UNKNOWN : AT_UNKNOWN).test(phrase)) return null;
  if (matchPrepared(phrase, others).matches.length > 0) return null; // a person or a thing the project knows
  return { known: false, key: fold(phrase), word: phrase };
}

// Two places are clearly two when the project knows both, or when the words do not even start
// alike: Helsingissä and Helsinkiin are one place in two cases, and nothing here can lemmatise
function clearlyDifferent(a, b) {
  if (a.known && b.known) return a.key !== b.key;
  return fold(a.word).slice(0, 3) !== fold(b.word).slice(0, 3);
}

/**
 * Places: a character who is clearly said to be in one place at the end of a chapter and in
 * another at the start of the next one, with no move told.
 *
 * A place is taken only from a clear statement: the character as subject at the start of a
 * sentence of narration, a verb of being or arriving, and a place the project knows or a
 * capitalised word in a local case, alone in its clause ("Aino oli Helsingissä."). A statement
 * of arriving in the later chapter is itself the move, and travel words keep their exemption.
 * occurrences: the two statements, each at its place in the real text.
 */
function locationFindings(project) {
  const characters = recordsOf(project && project.characters);
  if (characters.length === 0) return [];

  const known = knownEntries(project);
  const placeEntries = known.filter(entry => entry.kind === 'place');
  const places = {
    prepared: prepareEntries(placeEntries),
    names: new Map(placeEntries.map(entry => [entry.id, entry.name]))
  };
  const others = prepareEntries(known.filter(entry => entry.kind !== 'place'));
  const subjects = subjectNames(project, characters);
  const chapters = chaptersOf(project);

  const findings = [];
  characters.forEach((character, order) => {
    if (subjects[order].length === 0) return;
    const pattern = statementPattern(subjects[order]);

    const located = [];
    for (const { chapter, chapterIndex } of chapters) {
      const read = readChapter(chapter);
      const statements = [];
      for (const sentence of splitSentences(read.text)) {
        const lineStart = read.text.lastIndexOf('\n', sentence.from - 1) + 1;
        if (SPEECH_LINE.test(read.text.slice(lineStart, sentence.from + 1))) continue;

        const match = pattern.exec(read.text.slice(sentence.from, sentence.to));
        if (!match) continue;
        const arriving = ARRIVING.includes(match[1]);
        const place = placeOf(match[2], arriving, places, others);
        if (!place) continue;
        statements.push({ ...place, arriving, from: sentence.from, to: sentence.from + match[0].length });
      }
      if (statements.length > 0) {
        located.push({ chapter, chapterIndex, read, first: statements[0], last: statements[statements.length - 1] });
      }
    }

    const occurrence = (item, statement) => ({
      chapterId: item.chapter.id,
      chapterTitle: titleOf(item.chapter),
      content: item.read.text.slice(statement.from, statement.to),
      ...item.read.toReal(statement.from, statement.to)
    });

    for (let index = 1; index < located.length; index++) {
      const prev = located[index - 1];
      const curr = located[index];
      if (curr.chapterIndex !== prev.chapterIndex + 1) continue;

      const from = prev.last;
      const to = curr.first;
      if (to.arriving || !clearlyDifferent(from, to)) continue;
      if (hasTravelWords(curr.chapter.title) || hasTravelWords(curr.read.text) || hasTravelWords(prev.read.text.slice(from.to))) continue;

      const name = nameOf(character);
      findings.push({
        id: `location-${character.id}-${index}`,
        type: 'location_inconsistency',
        severity: 'medium',
        category: 'location',
        characterId: character.id,
        characterName: name,
        message: `${name}'s location changes without explanation`,
        description: `${name}: ${from.word} (${titleOf(prev.chapter)}) → ${to.word} (${titleOf(curr.chapter)})`,
        occurrences: [occurrence(prev, from), occurrence(curr, to)],
        suggestedFix: `Lisää kohtaus, jossa ${name} siirtyy paikasta toiseen, tai korjaa sijaintiviittaukset.`,
        autoFixable: false
      });
    }
  });
  return findings;
}

module.exports = {
  readable,
  mentionSentences,
  differsByDoubledLetter,
  nameFindings,
  planNameFix,
  extractDates,
  timelineFindings,
  locationFindings
};
