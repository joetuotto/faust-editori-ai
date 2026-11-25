/**
 * Cleaning a model's reply
 *
 * Edit requests ask for the text inside <teksti> tags. cleanModelOutput() takes
 * the reply apart: reasoning blocks, tags, code fences, prefaces and closing
 * remarks go, the text stays. `complete` says whether the closing tag arrived,
 * which is how a cut-off or refused reply is told from a finished one.
 * Pure function (test/services/cleanModelOutput.test.js).
 */

const DEFAULT_TAG = 'teksti';
const THINK_TAGS = ['think', 'thinking', 'thought', 'reasoning', 'reflection'];
const PREFACE_MAX_LENGTH = 120;

// How a line that announces the text begins, and how a line that comments on it begins
const PREFACE_START = /^(?:\*\*|#+\s*)?(?:tässä|tassa|alla|ohessa|korjattu|muokattu|tiivistetty|selkeytetty|paranneltu|uusi|toki|selvä|totta kai|hyvä on|here|sure|okay|ok|certainly|of course)(?![\p{L}\p{N}])/iu;
const REMARK_START = /^(?:\*\*|#+\s*|[-*]\s+)?(?:(?:muutokset|korjaukset|huomautus|huomautukset|huomioita|huom|selitys|perustelu|perustelut|note|notes|changes|explanation)\s*[:：!.]|(?:muutin|korjasin|lisäsin|poistin|säilytin|tein seuraavat|en muuttanut|toivottavasti|kerro,? jos|halutessasi|voin myös|let me know|hope this|i (?:changed|made|fixed|corrected|have)|i've)(?![\p{L}\p{N}]))/iu;
const SEPARATOR_LINE = /^(?:-{3,}|\*{3,}|_{3,})$/;
// A fence is a line of three backticks or three tildes, optionally followed by a language name
const FENCE_LINE = /^(```|~~~)[ \t]*[^\s`~]*[ \t]*$/;
const BARE_FENCE_LINE = /^(```|~~~)[ \t]*$/;
const QUOTE_PAIRS = [['"', '"'], ['”', '”'], ['“', '”'], ['«', '»'], ['»', '»']];

// Any quotation mark at an end of the original makes the reply's mark at that end the author's
const QUOTE_MARK = /^["”“„«»'’‘‚]$/u;

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Reasoning a model wrote into the visible reply
function stripThinking(text, notes) {
  let out = text;
  for (const tag of THINK_TAGS) {
    const closed = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi');
    const open = new RegExp(`<${tag}\\b[^>]*>`, 'i');
    const close = new RegExp(`<\\/${tag}\\s*>`, 'i');

    const without = out.replace(closed, '');
    if (without !== out) {
      out = without;
      notes.add('thinking');
    }
    // A closing tag with no opening one: the reply started in the middle of the reasoning
    let match;
    while ((match = close.exec(out)) !== null && !open.test(out.slice(0, match.index))) {
      out = out.slice(match.index + match[0].length);
      notes.add('thinking');
    }
    // An opening tag that never closes: everything after it is reasoning
    match = open.exec(out);
    if (match) {
      out = out.slice(0, match.index);
      notes.add('thinking');
    }
  }
  return out;
}

// One fence around the whole text, or an opening fence that never closes
function stripFence(text, notes) {
  const lines = text.trim().split('\n');
  const open = FENCE_LINE.exec(lines[0]);
  if (!open) return text;

  const closes = (line) => {
    const bare = BARE_FENCE_LINE.exec(line);
    return bare !== null && bare[1] === open[1];
  };
  const inner = lines.slice(1);
  const firstClose = inner.findIndex(closes);
  if (firstClose === -1) {
    notes.add('fence');
    return inner.join('\n');
  }
  if (firstClose === inner.length - 1) {
    notes.add('fence');
    return inner.slice(0, -1).join('\n');
  }
  return text;
}

// A fence run the model left at one end of the text without its pair: "…laiturille. ```",
// a last line that is only a fence although no fence opened before it, "``` Hän veti…" at the
// very start. A run that has a pair inside the text (a code block, "``` a ```") stays, and
// so does a run the text that was sent for editing had at that end.
const FENCE_RUN_END = /[ \t]*(`{3,}|~{3,})[ \t]*$/;
const FENCE_RUN_START = /^(`{3,}|~{3,})(?:(?:text|txt|plaintext|markdown|md)(?=[ \t]))?[ \t]+(?=\S)/i;

function stripDanglingFence(text, original, notes) {
  const source = typeof original === 'string' ? original.trim() : '';
  const body = text.trim();
  if (body === '') return text;

  const end = FENCE_RUN_END.exec(body);
  const start = FENCE_RUN_START.exec(body);
  const runsOf = (value, char) => (value.match(char === '`' ? /`{3,}/g : /~{3,}/g) || []).length;
  const inner = body.slice(start ? start[0].length : 0, end ? end.index : body.length);
  // A run stands alone when the rest of the text holds an even number of its kind
  // (none, or blocks that open and close); the run at the other end is not counted
  const alone = (match) => runsOf(inner, match[1][0]) % 2 === 0;

  let from = 0;
  let to = body.length;
  if (end && end.index > 0 && alone(end) && !/(?:`{3,}|~{3,})$/.test(source)) to = end.index;
  if (start && alone(start) && !/^(?:`{3,}|~{3,})/.test(source)) from = start[0].length;
  if (from === 0 && to === body.length) return text;

  notes.add('fence');
  return body.slice(from, to);
}

// The block inside the one closed backtick fence of a reply, or null
function singleFencedBlock(text) {
  const lines = text.split('\n');
  const blocks = [];
  let openAt = -1;
  lines.forEach((line, index) => {
    const fence = FENCE_LINE.exec(line);
    if (!fence || fence[1] !== '```') return;
    if (openAt === -1) {
      openAt = index;
    } else if (BARE_FENCE_LINE.test(line)) {
      blocks.push(lines.slice(openAt + 1, index).join('\n'));
      openAt = -1;
    }
  });
  return blocks.length === 1 ? blocks[0] : null;
}

// A line the author wrote is never chatter, however it begins
function inOriginal(line, original) {
  return typeof original === 'string' && line.trim() !== '' && original.includes(line.trim());
}

// "Tässä korjattu teksti:" before the text
function stripPreface(text, original, notes) {
  const body = text.replace(/^\s*\n/, '');
  const lineEnd = body.indexOf('\n');
  if (lineEnd === -1) return text;
  const first = body.slice(0, lineEnd).trim();
  const rest = body.slice(lineEnd + 1);
  if (
    rest.trim() !== '' && first.length <= PREFACE_MAX_LENGTH && /[:：](?:\*\*)?$/.test(first) &&
    PREFACE_START.test(first) && !inOriginal(first, original)
  ) {
    notes.add('preface');
    return rest;
  }
  return text;
}

// "Muutin vain pilkut." after the text
function stripTrailingRemarks(text, original, notes) {
  // Blocks and the blank lines between them, so that what stays is not rewritten
  const parts = text.trimEnd().split(/(\n[ \t]*\n)/);
  let kept = parts.length;
  while (kept > 1) {
    const firstLine = parts[kept - 1].trim().split('\n')[0].trim();
    const remark = SEPARATOR_LINE.test(firstLine) || REMARK_START.test(firstLine);
    if (!remark || inOriginal(firstLine, original)) break;
    kept -= 2;
    notes.add('trailing');
  }
  return kept === parts.length ? text : parts.slice(0, kept).join('');
}

// Quotation marks the model wrapped the whole text in; the author's own stay, also
// when the model changed their style ("…" became ”…”)
function stripWrappingQuotes(text, original, notes) {
  const source = original.trim();
  const startsQuoted = QUOTE_MARK.test(source.slice(0, 1));
  const endsQuoted = QUOTE_MARK.test(source.slice(-1));
  for (const [open, close] of QUOTE_PAIRS) {
    if (text.length < 2 || !text.startsWith(open) || !text.endsWith(close)) continue;
    const inner = text.slice(open.length, text.length - close.length);
    if (inner.includes(open) || inner.includes(close)) return text;
    // The pair is the author's when removing it would take a mark from an end that had one
    const body = inner.trim();
    if ((startsQuoted && !QUOTE_MARK.test(body.slice(0, 1))) || (endsQuoted && !QUOTE_MARK.test(body.slice(-1)))) {
      return text;
    }
    notes.add('quotes');
    return inner;
  }
  return text;
}

/**
 * The text a model was asked to return, without the things models add around it.
 * @param {string} raw the reply
 * @param {{tag?: string|null, original?: string, stripChatter?: boolean}} [options]
 *   tag: 'teksti' by default, null when the request did not ask for tags;
 *   original: the text that was sent for editing, as it was sent
 * @returns {{text: string, complete: boolean, hadOpenTag: boolean, hadCloseTag: boolean, notes: string[]}}
 *   complete is the only signal an edit task may use to turn a reply into suggestions
 */
function cleanModelOutput(raw, options) {
  const given = options || {};
  const tag = given.tag === undefined ? DEFAULT_TAG : given.tag;
  const original = typeof given.original === 'string' ? given.original : null;
  const stripChatter = given.stripChatter !== false;
  const notes = new Set();

  // 1. Byte-order mark and line breaks
  let text = (raw == null ? '' : String(raw)).replace(/^\ufeff/, '').replace(/\r\n?/g, '\n');

  // 2. Reasoning
  text = stripThinking(text, notes);

  // 3. Tags: the last closing tag, and the last opening tag before it. A model that
  // first shows the format, or drafts in visible text, puts its real answer last.
  let hadOpenTag = false;
  let hadCloseTag = false;
  let strayTag = false;
  let unclosedAnswer = false;
  if (tag) {
    const name = escapeRegExp(String(tag));
    const openTag = new RegExp(`<\\s*${name}\\s*>`, 'gi');
    const closeTag = new RegExp(`<\\s*\\/\\s*${name}\\s*>`, 'gi');
    let close = null;
    for (const match of text.matchAll(closeTag)) close = match;
    const head = close ? text.slice(0, close.index) : text;
    let open = null;
    for (const match of head.matchAll(openTag)) open = match;

    hadCloseTag = close !== null;
    hadOpenTag = open !== null;
    if (close) {
      const anyTag = new RegExp(`<\\s*\\/?\\s*${name}\\s*>`, 'gi');
      const inside = open ? head.slice(open.index + open[0].length) : head;
      const tagsIn = (value) => (value.match(anyTag) || []).length;
      const allowed = original === null ? 0 : tagsIn(original);
      strayTag = tagsIn(inside) > allowed;
      // An opening tag after the last closing tag that starts a line (or follows the closing
      // tag directly) and has text after it is an answer that never closed: what was taken
      // is a format example or draft. A mention inside a sentence ("<teksti>-tagien") is not
      const tail = text.slice(close.index + close[0].length);
      for (const match of tail.matchAll(openTag)) {
        const lineStart = tail.slice(0, match.index).split('\n').pop();
        const rest = tail.slice(match.index + match[0].length);
        if (/^[^\S\n]*$/u.test(lineStart) && rest.trim() !== '' && !rest.startsWith('-')) {
          unclosedAnswer = true;
        }
      }
    }
    if (open) {
      text = head.slice(open.index + open[0].length);
      notes.add('tags');
    } else if (close) {
      text = head;
      notes.add('tags');
    }
    if (!close) {
      // A reply cut in the middle of the closing tag: "</tek", "<". While a reply is
      // streaming the opening tag arrives in pieces too ("<tek"), and a preview must not show them.
      const lower = text.toLowerCase();
      const fragments = [`</${tag}>`.toLowerCase()];
      if (!open) fragments.push(`<${tag}>`.toLowerCase());
      let cut = 0;
      for (const fragment of fragments) {
        for (let length = fragment.length - 1; length > cut; length--) {
          if (lower.endsWith(fragment.slice(0, length))) {
            cut = length;
            break;
          }
        }
      }
      if (cut > 0) text = text.slice(0, text.length - cut);
    }
  }

  // 4. Fences, and 5. chatter. Inside tags nothing is guessed: only a fence around
  // the whole text and a fence run left alone at one end of it go. An untagged reply never becomes a suggestion, so the
  // keyword heuristics may run there. A reply with only the closing tag is complete
  // and can become suggestions, so it is not guessed at either
  if (hadOpenTag || hadCloseTag) {
    text = stripFence(text, notes);
    text = stripDanglingFence(text, original, notes);
  } else {
    const fenced = singleFencedBlock(text);
    if (fenced !== null) {
      text = fenced;
      notes.add('fence');
    } else {
      text = stripFence(text, notes);
      if (stripChatter) {
        text = stripPreface(text, original, notes);
        text = stripTrailingRemarks(text, original, notes);
      }
      text = stripDanglingFence(text, original, notes);
    }
  }

  // 6. Whitespace at both ends
  text = text.trim();

  if (original !== null) {
    // 7. Wrapping quotation marks
    text = stripWrappingQuotes(text, original, notes);
    // 8. A model cannot change the spaces or line breaks at the ends of a selection
    if (text !== '') {
      // trimStart/trimEnd, not /\s*$/: that expression is quadratic on a long run of spaces
      const lead = original.slice(0, original.length - original.trimStart().length);
      const body = original.slice(lead.length);
      const trail = body.slice(body.trimEnd().length);
      text = lead + text + trail;
    }
  }

  // A tag left inside the text (more than the original had) means the reply was not one
  // clean answer: rather no suggestion than a tag in the manuscript. Nor is a reply whose
  // last answer never closed
  const complete = hadCloseTag && text.trim() !== '' && !strayTag && !unclosedAnswer;
  return { text, complete, hadOpenTag, hadCloseTag, notes: [...notes] };
}

module.exports = { cleanModelOutput };
