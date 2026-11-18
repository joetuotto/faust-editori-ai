/**
 * @jest-environment node
 */
const { createReviewController, createDefaultReviewController } = require('../../src/services/review/reviewController');
const { BUILTIN_CHECKS } = require('../../src/services/review/reviewChecks');
const { renderReviewRequest } = require('../../src/services/ai/reviewPass');
const { textFingerprint } = require('../../src/services/review/findings');

// ---------------------------------------------------------------------------
// Stand-ins for the modules of other tasks: the text modules, the avoid-list
// matcher, the typography checker, the request layer and the context builder.
// The same shapes, with the rules these tests need.
// ---------------------------------------------------------------------------

function foldText(source) {
  let text = '';
  const starts = [];
  const ends = [];
  for (let i = 0; i < source.length; i++) {
    let ch = source[i];
    if (/\s/.test(ch)) {
      if (text.endsWith(' ')) {
        ends[ends.length - 1] = i + 1;
        continue;
      }
      ch = ' ';
    } else if ('"“”„«»'.includes(ch)) ch = '"';
    else if ('\'‘’'.includes(ch)) ch = '\'';
    else if ('-‐–—'.includes(ch)) ch = '-';
    else if (ch === '…') ch = '...';
    else ch = ch.toLowerCase();
    for (const folded of ch) {
      text += folded;
      starts.push(i);
      ends.push(i + 1);
    }
  }
  return { text, starts, ends };
}

// src/editor/locateQuote.js
function locateQuote(text, quote, options = {}) {
  const from = Number.isFinite(options.from) ? Math.max(0, options.from) : 0;
  const to = Number.isFinite(options.to) ? Math.min(text.length, options.to) : text.length;
  const scope = text.slice(from, Math.max(from, to));
  const wanted = String(quote || '').trim();
  if (!wanted || !scope) return null;

  const all = (hay, needle) => {
    const found = [];
    for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + 1)) found.push(at);
    return found;
  };
  const nearest = (found, near) => found.reduce(
    (best, at) => (Number.isFinite(near) && Math.abs(at - near) < Math.abs(best - near) ? at : best),
    found[0]
  );
  const near = Number.isFinite(options.near) ? options.near - from : NaN;

  const exact = all(scope, wanted);
  if (exact.length > 0) {
    const at = nearest(exact, near);
    return { from: from + at, to: from + at + wanted.length, method: 'exact', count: exact.length, coverage: 1 };
  }

  const folded = foldText(scope);
  const needle = foldText(wanted).text.trim();
  let nearFolded = NaN;
  if (Number.isFinite(near)) {
    nearFolded = folded.starts.findIndex(start => start >= near);
    if (nearFolded === -1) nearFolded = folded.text.length;
  }
  const pick = (found, length, method, coverage) => {
    const at = nearest(found, nearFolded);
    return { from: from + folded.starts[at], to: from + folded.ends[at + length - 1], method, count: found.length, coverage };
  };
  if (needle.length >= 2) {
    const found = all(folded.text, needle);
    if (found.length > 0) return pick(found, needle.length, 'normalized', 1);
  }
  const words = needle.split(' ');
  for (let k = words.length - 1; k >= 3; k--) {
    const prefix = words.slice(0, k).join(' ');
    if (prefix.length < 12) break;
    const found = all(folded.text, prefix);
    if (found.length > 0) return pick(found, prefix.length, 'prefix', prefix.length / needle.length);
  }
  return null;
}

// src/editor/blocks.js
function splitBlocks(text) {
  const blocks = [];
  let from = 0;
  for (const line of String(text).split('\n')) {
    const to = from + line.length;
    let kind = 'paragraph';
    let prefix = '';
    let match;
    if (!line.trim()) kind = 'blank';
    else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) kind = 'break';
    else if ((match = /^#{1,6}\s+/.exec(line))) {
      kind = 'heading';
      prefix = match[0];
    } else if ((match = /^>\s?/.exec(line))) {
      kind = 'quote';
      prefix = match[0];
    } else if ((match = /^\s*(?:[-*+]|\d+[.)])\s+/.exec(line))) {
      kind = 'list';
      prefix = match[0];
    }
    const empty = kind === 'blank' || kind === 'break';
    const rest = empty ? '' : line.slice(prefix.length);
    const body = rest.trim();
    const bodyFrom = empty ? from : from + prefix.length + (rest.length - rest.trimStart().length);
    blocks.push({ n: blocks.length + 1, from, to, kind, text: line, prefix: text.slice(from, bodyFrom), body, bodyFrom, bodyTo: bodyFrom + body.length });
    from = to + 1;
  }
  return blocks;
}

function proseLines(blocks, { quotes = false, from = 0, to = Infinity } = {}) {
  return blocks
    .filter(block => block.body && !(block.to < from || block.from > to))
    .filter(block => block.kind === 'paragraph' || block.kind === 'list' || (block.kind === 'quote' && quotes))
    .map(block => ({ n: block.n, from: block.bodyFrom, to: block.bodyTo, text: block.body, kind: block.kind }));
}

// src/editor/sentences.js
function splitSentences(text) {
  const out = [];
  let lineStart = 0;
  for (const line of String(text).split('\n')) {
    let start = -1;
    let i = 0;
    while (i < line.length) {
      if (start === -1) {
        if (/\s/.test(line[i])) {
          i++;
          continue;
        }
        start = i;
      }
      if (!'.!?…'.includes(line[i])) {
        i++;
        continue;
      }
      let end = i + 1;
      while (end < line.length && '.!?…”"’\')]'.includes(line[end])) end++;
      let next = end;
      while (next < line.length && /\s/.test(line[next])) next++;
      if (next >= line.length || (next > end && !/\p{Ll}/u.test(line[next]))) {
        out.push({ from: lineStart + start, to: lineStart + end, terminated: true });
        start = -1;
      }
      i = end;
    }
    if (start !== -1) out.push({ from: lineStart + start, to: lineStart + line.trimEnd().length, terminated: false });
    lineStart += line.length + 1;
  }
  return out;
}

// src/editor/wordDiff.js
function wordDiff(original, revised) {
  const tokens = (text) => text.match(/[\p{L}\p{N}'’]+|\s+|[^\p{L}\p{N}\s]/gu) || [];
  const a = tokens(original);
  const b = tokens(revised);
  const common = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      common[i][j] = a[i] === b[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
    }
  }
  const changes = [];
  let current = null;
  let pos = 0;
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      current = null;
      pos += a[i].length;
      i++;
      j++;
      continue;
    }
    if (!current) {
      current = { from: pos, to: pos, insert: '' };
      changes.push(current);
    }
    if (j < b.length && (i === a.length || common[i][j + 1] >= common[i + 1][j])) {
      current.insert += b[j];
      j++;
    } else {
      pos += a[i].length;
      current.to = pos;
      i++;
    }
  }
  return changes.map(change => ({ ...change, original: original.slice(change.from, change.to) }));
}

// src/services/ai/batchParagraphs.js
function batchParagraphs(lines, { max, maxLines = 40, lineOverhead = 8 }) {
  const batches = [];
  let current = null;
  const close = () => {
    if (current) batches.push(current);
    current = null;
  };
  for (const line of lines) {
    const cost = line.text.length + lineOverhead;
    if (cost > max) {
      close();
      batches.push({ index: batches.length, lines: [line], size: cost, oversize: true });
      continue;
    }
    if (current && (current.size + cost > max || current.lines.length >= maxLines)) close();
    if (!current) current = { index: batches.length, lines: [], size: 0, oversize: false };
    current.lines.push(line);
    current.size += cost;
  }
  close();
  return batches;
}

const text = { locateQuote, splitBlocks, proseLines, splitSentences, wordDiff, batchParagraphs };

// The avoid-list matcher behind the controller's wrapper (src/editor/termMatch.js): an item
// matches from the start of a word with any ending, an item in quotation marks only the word itself
function matchTerms(value, words) {
  const notes = Array.from(value.matchAll(/\[TODO:[^\]\n]*\]/g), match => [match.index, match.index + match[0].length]);
  const hits = [];
  for (const raw of words) {
    const exact = /^[”"].+[”"]$/.test(raw);
    const term = exact ? raw.slice(1, -1) : raw;
    const source = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${source}${exact ? '' : '[\\p{L}\\p{N}]*'}(?![\\p{L}\\p{N}])`, 'giu');
    for (const match of value.matchAll(pattern)) {
      const end = match.index + match[0].length;
      if (notes.some(([from, to]) => match.index < to && end > from)) continue;
      hits.push({ start: match.index, end, text: match[0], term });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

const DASH_URL = 'https://kielitoimistonohjepankki.fi/ohje/ajatusviiva/';
const DASH_MESSAGE = 'Rivi alkaa yhdysmerkillä ja välillä, joten FAUST käsittelee sen luettelokohtana. Jos rivi on repliikki, sen alkuun kuuluu vuorosanaviiva (– ).';

// The typography checker (src/editor/typography.fi.js), as far as its one question goes
function checkTypography(value, { language = 'fi', lineStartDash = 'dialogue' } = {}) {
  if (language !== 'fi' || lineStartDash !== 'dialogue') return [];
  const findings = [];
  let offset = 0;
  for (const row of value.split('\n')) {
    const dash = /^[ \t]*-[ \t]+(?=\S)/.exec(row);
    if (dash) {
      const from = offset + dash[0].indexOf('-');
      const to = offset + dash[0].length;
      findings.push({
        id: `rivin-alun-viiva@${from}`, ruleId: 'rivin-alun-viiva', level: 'kysymys', from, to, quote: value.slice(from, to),
        message: DASH_MESSAGE, url: DASH_URL, fix: null, convert: { from, to, insert: '– ' }
      });
    }
    offset += row.length + 1;
  }
  return findings;
}

// The project's own setting, else a list in nonfiction and dialogue elsewhere
const effectiveLineStartDash = (project) => {
  const setting = project && project.typography ? project.typography.lineStartDash : null;
  if (setting === 'list' || setting === 'dialogue') return setting;
  return project && project.genre === 'nonfiction' ? 'list' : 'dialogue';
};

const NO_AI = 'Tämä luku on merkitty ”Ei tekoälylle”. Mitään ei lähetetä.';

// ---------------------------------------------------------------------------
// The harness: an in-memory project, a fake editor facade and a fake request layer
// ---------------------------------------------------------------------------

const check = (id) => BUILTIN_CHECKS.find(entry => entry.id === id);

const CHAPTER_1 = 'Aamu oli jotenkin harmaa. Hän vain katsoi merta.\n\nAika tuntui pysähtyvän. Lopuksi hän vain lähti kotiin.';
const CHAPTER_2 = 'Mökissä oli hiljaista. Antti vain istui.';

const FILLER_ANSWER = [
  'LAINAUS: Hän vain katsoi merta.',
  'HUOMIO: Vain on täytesana.',
  'EHDOTUS: Hän katsoi merta.',
  '',
  'LAINAUS: Lopuksi hän vain lähti kotiin.',
  'HUOMIO: Toinen vain.',
  'EHDOTUS: Lopuksi hän lähti kotiin.'
].join('\n');

function makeProject(extra = {}) {
  return {
    title: 'Järven kirja',
    genre: 'fiction',
    language: 'fi',
    keepNote: '',
    avoidWords: ['jotenkin', '”vain”'],
    review: { longSentenceWords: 30 },
    typography: { lineStartDash: null },
    structure: [
      { id: 'c1', title: 'Laituri', content: CHAPTER_1 },
      { id: 'c2', title: 'Mökki', content: CHAPTER_2 }
    ],
    ...extra
  };
}

const answer = (answerText, extra = {}) => ({
  ok: true,
  text: answerText,
  cancelled: false,
  truncated: false,
  refused: false,
  promptTruncated: false,
  sawThinking: false,
  error: null,
  model: 'c91f:deepseek-test',
  logId: 'log-1',
  ...extra
});
const failure = (code, message) => answer('', { ok: false, error: { code, message, status: null } });

// An answer that arrives when the test says so
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { deferred: true, promise, resolve };
}

// One turn of the event loop: every promise of a finished run has settled after it
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

const payloadOf = (options) => /<teksti>\n([\s\S]*)\n<\/teksti>/.exec(options.messages[0].content)[1];

function setup(options = {}) {
  const store = {
    project: options.project || makeProject(),
    chapterId: options.chapterId || 'c1',
    liveText: undefined,
    selection: null,
    visible: true,
    aiOff: false
  };
  const counters = { notify: 0, updateChapter: 0, updateProject: 0 };
  const chapter = (id = store.chapterId) => store.project.structure.find(entry => entry.id === id);

  const editor = {
    selectionStart: 0,
    selectionEnd: 0,
    setSelectionRange: jest.fn(),
    scrollToPos: jest.fn(),
    focus: jest.fn(),
    suggestions: { pending: [], rejected: [] },
    getSuggestions: jest.fn(() => editor.suggestions)
  };

  // Answers are taken from the queue in order; a deferred one stays open until it is resolved or cancelled
  const queue = [];
  const handles = [];
  const ai = {
    request: jest.fn((request) => {
      const next = queue.shift();
      const handle = { id: `req-${handles.length + 1}`, cancel: jest.fn() };
      if (next && next.deferred) {
        handle.result = next.promise;
        handle.cancel = jest.fn(() => next.resolve(answer('', { cancelled: true })));
      } else {
        handle.result = Promise.resolve(typeof next === 'function' ? next(request) : next);
      }
      handles.push(handle);
      return handle;
    }),
    modelFor: jest.fn(() => 'c91f:deepseek-test'),
    modelLabel: (id) => String(id).split(':').pop()
  };

  const context = options.context === null ? null : {
    build: jest.fn(({ task, project, chapterId }) => {
      const target = project.structure.find(entry => entry.id === chapterId);
      if (!target) return { system: '', messages: [], parts: [], blocked: 'no-chapter' };
      if (target.noAI) return { system: '', messages: [], parts: [], blocked: 'noAI' };
      const request = renderReviewRequest(task, task.payload, project.language);
      return {
        ...request,
        parts: [],
        blocked: null,
        overBudget: false,
        dropped: [],
        totalChars: request.system.length + request.messages[0].content.length,
        ...(options.built || {})
      };
    }),
    isBlocked: (project, chapterId) => !!(project.structure.find(entry => entry.id === chapterId) || {}).noAI,
    noAIMessage: NO_AI,
    describeParts: (built) => ({ dropped: built.dropped && built.dropped.length > 0 ? 'Ei mahtunut: tiivistelmät' : '' })
  };

  const propose = jest.fn(() => ({ ok: true, groupId: 'g1', ids: ['s1', 's2'], skipped: [] }));
  const askConfirm = jest.fn(() => Promise.resolve(true));
  const ids = {};
  const controller = createReviewController({
    text,
    matchTerms,
    checkTypography,
    effectiveLineStartDash,
    ai,
    context,
    projectType: (project) => (project && project.genre === 'nonfiction' ? 'nonfiction' : 'fiction'),
    formatTime: (iso) => `<${iso.slice(11, 16)}>`,
    now: () => new Date('2026-11-16T17:02:00.000Z'),
    makeId: (prefix) => {
      ids[prefix] = (ids[prefix] || 0) + 1;
      return `${prefix}-${ids[prefix]}`;
    },
    ...(options.deps || {})
  });

  // One render of the app: the controller gets the state of this moment
  function render() {
    const open = chapter();
    controller.bind({
      project: store.project,
      activeChapterId: store.chapterId,
      liveText: store.liveText !== undefined ? store.liveText : (open ? open.content : ''),
      selection: store.selection,
      getEditor: () => editor,
      getProject: () => store.project,
      updateChapter: (chapterId, fn) => {
        counters.updateChapter += 1;
        store.project = { ...store.project, structure: store.project.structure.map(entry => (entry.id === chapterId ? fn(entry) : entry)) };
        // deferRender: the app has not rendered again yet (two clicks in one frame)
        if (!options.deferRender) render();
      },
      updateProject: (fn) => {
        counters.updateProject += 1;
        store.project = fn(store.project);
        render();
      },
      propose,
      askConfirm,
      visible: store.visible,
      aiOff: store.aiOff,
      notify: () => {
        counters.notify += 1;
      }
    });
  }

  const harness = {
    controller,
    store,
    counters,
    editor,
    ai,
    context,
    queue,
    handles,
    propose,
    askConfirm,
    chapter,
    render,
    view: () => controller.view(),
    // The author types: the open chapter gets a new text and the app renders
    type(next) {
      store.project = { ...store.project, structure: store.project.structure.map(entry => (entry.id === store.chapterId ? { ...entry, content: next } : entry)) };
      render();
    },
    open(chapterId) {
      store.chapterId = chapterId;
      store.selection = null;
      render();
    },
    set(patch) {
      Object.assign(store, patch);
      render();
    },
    // Run the selected model check to its end with these answers
    async runWith(...answers) {
      queue.push(...answers);
      const started = controller.run();
      await settle();
      render();
      return started;
    },
    quotes: () => controller.view().findings.map(finding => finding.quote),
    byQuote: (quote) => controller.view().findings.find(finding => finding.quote === quote)
  };
  render();
  return harness;
}

// A harness with the filler check selected and its two findings stored
async function withFillerFindings(options) {
  const h = setup(options);
  h.controller.selectCheck(check('filler'));
  await h.runWith(answer(FILLER_ANSWER));
  return h;
}

// ---------------------------------------------------------------------------
// Local checks
// ---------------------------------------------------------------------------

describe('local checks', () => {
  test('the first view selects Vältettävät sanat when the project has avoid words, else Pitkät virkkeet', () => {
    expect(setup().view().check).toBe(check('avoid-words'));
    expect(setup({ project: makeProject({ avoidWords: [] }) }).view().check).toBe(check('long-sentences'));
    expect(setup({ project: makeProject({ avoidWords: ['', '  '] }) }).view().check.id).toBe('long-sentences');
    expect(setup({ project: makeProject({ avoidWords: undefined }) }).view().check.id).toBe('long-sentences');

    // The first view decides; a list that is emptied later does not change the selection
    const h = setup();
    expect(h.view().check.id).toBe('avoid-words');
    h.set({ project: { ...h.store.project, avoidWords: [] } });
    expect(h.view().check.id).toBe('avoid-words');
    expect(h.view().localMessage).toBe('Vältettävien sanojen lista on tyhjä. Lisää sanat projektin asetuksissa.');

    // A view before the first bind is empty, not an error
    const bare = createReviewController({ text, matchTerms, ai: { modelFor: () => '', modelLabel: () => '' }, context: null, projectType: () => 'fiction', formatTime: String });
    expect(bare.view()).toMatchObject({ chapterId: null, findings: [], hasText: false, running: null, modelName: '' });
  });

  test('a local check lists hits from the live text without a run', () => {
    const h = setup();
    const view = h.view();

    expect(view).toMatchObject({
      chapterId: 'c1',
      chapterTitle: 'Laituri',
      hasText: true,
      blocked: false,
      scope: 'chapter',
      scopeLocked: false,
      hasSelection: false,
      running: null,
      lastRun: null,
      localMessage: null,
      filter: { status: 'open', onlyCheck: true },
      selectedId: null,
      selectedBy: null,
      position: null,
      notice: null,
      note: '',
      longSentenceWords: 30,
      modelName: 'deepseek-test',
      modelStats: [],
      feedback: null
    });
    expect(h.quotes()).toEqual(['jotenkin', 'vain', 'vain']);
    expect(view.findings.map(finding => finding.from)).toEqual([CHAPTER_1.indexOf('jotenkin'), CHAPTER_1.indexOf('vain'), CHAPTER_1.lastIndexOf('vain')]);
    expect(view.findings[0]).toMatchObject({
      id: `avoid-words@${CHAPTER_1.indexOf('jotenkin')}`, checkId: 'avoid-words', checkLabel: 'Vältettävät sanat', kind: 'local',
      status: 'open', located: true, note: 'Vältettävä sana: jotenkin', data: { term: 'jotenkin' }, model: null
    });
    expect(view.counts).toEqual({ open: 3, done: 0, disagree: 0, invalid: 0, all: 3, unlocated: 0 });

    // No request, no write, no notification: the list is computed when it is read
    expect(h.ai.request).not.toHaveBeenCalled();
    expect(h.counters).toEqual({ notify: 0, updateChapter: 0, updateProject: 0 });
    // Two reads without a change in between are the same object
    expect(h.view()).toBe(view);

    // The other local checks, selected by hand
    h.controller.selectCheck(check('long-sentences'));
    expect(h.quotes()).toEqual([]);
    h.controller.setLongSentenceWords(3);
    expect(h.store.project.review.longSentenceWords).toBe(8);
    h.type(`${CHAPTER_1} Sitten hän käveli hitaasti pitkin rantaa kohti vanhaa punaista mökkiä.`);
    expect(h.view().findings.map(finding => finding.note)).toEqual(['Virkkeessä on 10 sanaa (raja 8).']);
    expect(h.view().longSentenceWords).toBe(8);
  });

  test('typing changes the list on the next view without notify', () => {
    const h = setup();
    expect(h.quotes()).toEqual(['jotenkin', 'vain', 'vain']);
    const before = { ...h.counters };

    h.type(`Jotenkin kaikki alkoi tästä. ${CHAPTER_1}`);
    expect(h.quotes()).toEqual(['Jotenkin', 'jotenkin', 'vain', 'vain']);
    // The hits moved with the text
    expect(h.view().findings[1].from).toBe(CHAPTER_1.indexOf('jotenkin') + 29);

    h.type('Aivan muuta tekstiä.');
    expect(h.quotes()).toEqual([]);
    expect(h.counters).toEqual(before);
    expect(h.chapter().findings).toBeUndefined();

    // The live text wins over the stored content when the two differ
    h.set({ liveText: 'Editorissa on jo vain tämä.' });
    expect(h.quotes()).toEqual(['vain']);
  });

  test('marking a local hit Eri mieltä stores it and the hit is not listed as open again', () => {
    const h = setup();
    const [, first] = h.view().findings;
    expect(first.quote).toBe('vain');

    expect(h.controller.setStatus(first.id, 'disagree')).toBe(true);
    expect(h.counters.updateChapter).toBe(1);
    expect(h.chapter().findings).toEqual([{
      ...first,
      id: 'f-1',
      status: 'disagree',
      statusAt: '2026-11-16T17:02:00.000Z',
      createdAt: '2026-11-16T17:02:00.000Z'
    }]);
    // The other hits of the same word are still open
    expect(h.view().findings.map(finding => [finding.quote, finding.from])).toEqual([
      ['jotenkin', CHAPTER_1.indexOf('jotenkin')],
      ['vain', CHAPTER_1.lastIndexOf('vain')]
    ]);
    expect(h.view().counts).toMatchObject({ open: 2, disagree: 1, all: 3 });

    h.controller.setFilter({ status: 'disagree' });
    expect(h.view().findings.map(finding => finding.id)).toEqual(['f-1']);
    h.controller.setFilter({ status: 'open' });

    // The decision follows its passage through edits and survives a reload of the file
    h.type(`Uusi alku. ${CHAPTER_1}`);
    expect(h.quotes()).toEqual(['jotenkin', 'vain']);
    expect(h.view().findings[1].from).toBe(CHAPTER_1.lastIndexOf('vain') + 11);
    const reloaded = setup({ project: JSON.parse(JSON.stringify(h.store.project)) });
    expect(reloaded.quotes()).toEqual(['jotenkin', 'vain']);
    expect(reloaded.view().counts).toMatchObject({ open: 2, disagree: 1 });

    // Virheellinen is not a status of a local hit
    const [other] = h.view().findings;
    expect(h.controller.setStatus(other.id, 'invalid')).toBe(false);
    expect(h.controller.setStatus('missing', 'done')).toBe(false);
    expect(h.counters.updateChapter).toBe(1);
  });

  test('two decisions on a fresh local hit before the next render store one finding with the last status', () => {
    const h = setup({ deferRender: true });
    const hit = h.view().findings[1];
    expect(h.controller.setStatus(hit.id, 'disagree')).toBe(true);
    expect(h.controller.setStatus(hit.id, 'done')).toBe(true);
    expect(h.chapter().findings.map(finding => [finding.id, finding.status, finding.from])).toEqual([['f-1', 'done', hit.from]]);

    h.render();
    h.controller.setFilter({ status: 'all' });
    expect(h.view().findings.filter(finding => finding.from === hit.from).map(finding => [finding.id, finding.status])).toEqual([['f-1', 'done']]);
  });

  test('setting a stored local finding back to Avoin removes it from the chapter', () => {
    const h = setup();
    const hit = h.view().findings[1];
    h.controller.setStatus(hit.id, 'done');
    expect(h.chapter().findings).toHaveLength(1);
    expect(h.chapter().findings[0]).toMatchObject({ id: 'f-1', status: 'done', kind: 'local' });
    expect(h.quotes()).toEqual(['jotenkin', 'vain']);

    h.controller.setFilter({ status: 'all' });
    expect(h.controller.setStatus('f-1', 'open')).toBe(true);
    expect(h.chapter().findings).toEqual([]);
    // The hit is back as a fresh one, with the id of its position
    h.controller.setFilter({ status: 'open' });
    expect(h.view().findings.map(finding => finding.id)).toEqual([
      `avoid-words@${CHAPTER_1.indexOf('jotenkin')}`, hit.id, `avoid-words@${CHAPTER_1.lastIndexOf('vain')}`
    ]);
  });

  test('open local findings are never written to the chapter', async () => {
    const h = setup();
    const stored = () => h.chapter().findings || [];
    const openLocal = () => stored().filter(finding => finding.kind === 'local' && finding.status === 'open');

    // Reading, selecting and deciding on one hit: only the decided one is stored
    h.controller.select(h.view().findings[0].id);
    h.controller.setStatus(h.view().findings[2].id, 'done');
    expect(stored().map(finding => [finding.kind, finding.status])).toEqual([['local', 'done']]);

    // A model run writes its findings next to it; the open hits of the local check stay in memory
    h.controller.selectCheck(check('filler'));
    await h.runWith(answer(FILLER_ANSWER));
    expect(stored().map(finding => [finding.kind, finding.status])).toEqual([['local', 'done'], ['model', 'open'], ['model', 'open']]);
    h.controller.setStatus(stored()[1].id, 'invalid');
    expect(openLocal()).toEqual([]);

    // An open local finding left in an old file is dropped by the next write and never shown twice
    const old = { id: 'old-1', checkId: 'avoid-words', checkLabel: 'Vältettävät sanat', kind: 'local', quote: 'jotenkin', from: 9, to: 17, status: 'open' };
    const legacy = setup({ project: makeProject({ structure: [{ id: 'c1', title: 'Laituri', content: CHAPTER_1, findings: [old] }] }) });
    expect(legacy.quotes()).toEqual(['jotenkin', 'vain', 'vain']);
    legacy.controller.setStatus(legacy.view().findings[1].id, 'disagree');
    expect(legacy.chapter().findings.map(finding => finding.id)).toEqual(['f-1']);
  });

  test('typography questions follow the project\'s line-start setting', () => {
    const content = 'Alku.\n- Tuletko sinä jo?\n- Tulen.\nLoppu.';
    const project = (extra) => makeProject({ structure: [{ id: 'c1', title: 'Laituri', content }], ...extra });

    const fiction = setup({ project: project() });
    fiction.controller.selectCheck(check('typography-questions'));
    expect(fiction.quotes()).toEqual(['- Tuletko sinä jo?', '- Tulen.']);
    expect(fiction.view().localMessage).toBeNull();

    // In a project whose line-start dash is a list nobody asks
    for (const extra of [{ typography: { lineStartDash: 'list' } }, { genre: 'nonfiction' }]) {
      const listed = setup({ project: project(extra) });
      listed.controller.selectCheck(check('typography-questions'));
      expect(listed.quotes()).toEqual([]);
      expect(listed.view().localMessage).toBe('Projektin asetuksissa rivin alun viiva on luettelo, joten kysyttävää ei ole.');
    }
    // Without the setting's reader the lines are taken as dialogue
    const plain = setup({ project: project({ genre: 'nonfiction' }), deps: { effectiveLineStartDash: undefined } });
    plain.controller.selectCheck(check('typography-questions'));
    expect(plain.quotes()).toHaveLength(2);

    const english = setup({ project: project({ language: 'en' }) });
    english.controller.selectCheck(check('typography-questions'));
    expect(english.view().localMessage).toBe('Typografian tarkistus on tehty suomenkieliselle tekstille.');
  });

  // I-08 review fixes (live-6): a local hit's id holds its place, so typing above it gives it a new
  // id; the author's selection stays on the same hit
  test('the selected hit of a local check stays selected when text is typed above it', () => {
    const h = setup();
    const second = h.view().findings[1];
    h.controller.select(second.id);
    expect(h.view().position).toEqual({ index: 2, total: 3 });

    h.type(`Yö. ${CHAPTER_1}`);
    const view = h.view();
    expect(view.findings[1].id).toBe(`avoid-words@${second.from + 4}`);
    expect(view.selectedId).toBe(view.findings[1].id);
    expect(view.position).toEqual({ index: 2, total: 3 });
    expect(h.controller.highlightProps().activeId).toBe(view.findings[1].id);

    // Typing after it changes nothing; a deletion above it moves it back
    h.type(`Yö. ${CHAPTER_1} Loppu.`);
    expect(h.view().selectedId).toBe(view.findings[1].id);
    h.type(`${CHAPTER_1} Loppu.`);
    expect(h.view().selectedId).toBe(second.id);

    // A hit that is gone (vaino is not on the list) leaves nothing selected in the list
    h.type(CHAPTER_1.replace('vain katsoi', 'vaino katsoi'));
    expect(h.view().findings.some(finding => finding.id === h.view().selectedId)).toBe(false);
    expect(h.view().position).toBeNull();
  });

  // I-08 review fixes (conformance-2): leaving the Raja field without a change is no change of the project
  test('setLongSentenceWords writes only a limit that differs from the project\'s', () => {
    const h = setup();
    h.controller.selectCheck(check('long-sentences'));
    h.controller.setLongSentenceWords(30);
    h.controller.setLongSentenceWords('30');
    expect(h.counters.updateProject).toBe(0);

    h.controller.setLongSentenceWords(12);
    expect(h.counters.updateProject).toBe(1);
    expect(h.store.project.review.longSentenceWords).toBe(12);
    // A value that clamps to the limit already set is no change either
    h.controller.setLongSentenceWords(8);
    h.controller.setLongSentenceWords(3);
    expect(h.counters.updateProject).toBe(2);
  });

  test('a local check with the scope Valinta lists the hits of the selection of this render', () => {
    const h = setup();
    h.controller.setScope('selection');
    // Without a selection the whole chapter is listed
    expect(h.quotes()).toHaveLength(3);
    expect(h.view().hasSelection).toBe(false);

    const from = CHAPTER_1.indexOf('Aika');
    h.set({ selection: { from, to: CHAPTER_1.length } });
    expect(h.view()).toMatchObject({ scope: 'selection', hasSelection: true });
    expect(h.view().findings.map(finding => finding.from)).toEqual([CHAPTER_1.lastIndexOf('vain')]);

    h.controller.setScope('chapter');
    expect(h.quotes()).toHaveLength(3);
    h.controller.setScope('book');
    expect(h.view().scope).toBe('chapter');
  });
});

// ---------------------------------------------------------------------------
// Model checks: run
// ---------------------------------------------------------------------------

describe('running a model check', () => {
  test('run is refused with a notice while another run is active', async () => {
    const h = setup();
    h.controller.selectCheck(check('filler'));
    const pending = deferred();
    h.queue.push(pending);

    expect(h.controller.run()).toBe(true);
    expect(h.view().running).toEqual({ here: true, chapterId: 'c1', chapterTitle: 'Laituri', checkLabel: 'Täytesanat', batch: 1, batches: 1, found: 0 });

    const notified = h.counters.notify;
    expect(h.controller.run()).toBe(false);
    expect(h.view().notice).toBe('Edellinen tarkistus on vielä käynnissä.');
    expect(h.counters.notify).toBe(notified + 1);
    expect(h.ai.request).toHaveBeenCalledTimes(1);

    // Also for another check and from another chapter: one run at a time
    h.controller.selectCheck(check('cliche'));
    h.open('c2');
    expect(h.controller.run()).toBe(false);
    expect(h.view().notice).toBe('Edellinen tarkistus on vielä käynnissä.');
    h.controller.dismissNotice();
    expect(h.view().notice).toBeNull();

    pending.resolve(answer('EI HAVAINTOJA'));
    await settle();
    expect(h.view().running).toBeNull();
    // A new check can start at once
    h.queue.push(answer('EI HAVAINTOJA'));
    expect(h.controller.run()).toBe(true);
    await settle();
  });

  test('run is refused in a chapter marked Ei tekoälylle and sends nothing', async () => {
    const project = makeProject();
    project.structure[0].noAI = true;
    const h = setup({ project });
    h.controller.selectCheck(check('filler'));

    expect(h.view().blocked).toBe(true);
    expect(h.controller.run()).toBe(false);
    await settle();
    expect(h.view().notice).toBe(NO_AI);
    expect(h.ai.request).not.toHaveBeenCalled();
    expect(h.context.build).not.toHaveBeenCalled();
    expect(h.counters.updateChapter).toBe(0);
    expect(h.view().running).toBeNull();

    // The local checks still list their hits there
    h.controller.selectCheck(check('avoid-words'));
    expect(h.quotes()).toHaveLength(3);
    // and the preview says why nothing would be sent
    h.controller.selectCheck(check('filler'));
    expect(h.controller.preview()).toMatchObject({ batches: 0, payload: '', blocked: NO_AI });

    // Without a context builder the chapter's own flag is still obeyed
    const bare = setup({ project, context: null });
    bare.controller.selectCheck(check('filler'));
    expect(bare.controller.run()).toBe(false);
    expect(bare.view().notice).toBe(NO_AI);
    expect(bare.ai.request).not.toHaveBeenCalled();

    // The other chapter is free
    h.open('c2');
    expect(h.view().blocked).toBe(false);
  });

  test('run with scope Valinta reads the selection from the editor at that moment', async () => {
    const h = setup();
    h.controller.selectCheck(check('filler'));
    h.controller.setScope('selection');
    // The render knew another selection: the first paragraph
    h.set({ selection: { from: 0, to: 10 } });
    // Since then the author selected a few words of the second one
    const from = CHAPTER_1.indexOf('tuntui');
    h.editor.selectionStart = from + 6;
    h.editor.selectionEnd = from;

    h.queue.push(answer('LAINAUS: Lopuksi hän vain lähti kotiin.\nHUOMIO: Täytesana.\nEHDOTUS: Lopuksi hän lähti kotiin.'));
    expect(h.controller.run()).toBe(true);
    await settle();

    expect(h.ai.request).toHaveBeenCalledTimes(1);
    // Widened to the whole line; the first paragraph was not sent
    expect(payloadOf(h.ai.request.mock.calls[0][0])).toBe('Aika tuntui pysähtyvän. Lopuksi hän vain lähti kotiin.');
    expect(h.chapter().reviewRuns.filler).toMatchObject({ scope: 'selection', outcome: 'ok', found: 1 });
    expect(h.chapter().findings.map(finding => finding.quote)).toEqual(['Lopuksi hän vain lähti kotiin.']);
  });

  test('run with an empty selection gives the notice and sends nothing', async () => {
    const h = setup();
    h.controller.selectCheck(check('filler'));
    h.controller.setScope('selection');
    // The render still had a selection; the editor has only a caret now
    h.set({ selection: { from: 0, to: 10 } });
    h.editor.selectionStart = 12;
    h.editor.selectionEnd = 12;

    expect(h.controller.run()).toBe(false);
    await settle();
    expect(h.view().notice).toBe('Valitse ensin tekstiä tai vaihda laajuudeksi Luku.');
    expect(h.ai.request).not.toHaveBeenCalled();
    expect(h.counters.updateChapter).toBe(0);

    // An empty chapter has nothing to check either
    h.controller.setScope('chapter');
    h.type('  \n ');
    expect(h.controller.run()).toBe(false);
    expect(h.view().notice).toBe('Luvussa ei ole tekstiä.');
    expect(h.view().hasText).toBe(false);
    expect(h.ai.request).not.toHaveBeenCalled();
  });

  test('a finished run writes findings and the run record with one updateChapter call', async () => {
    const h = setup();
    h.controller.selectCheck(check('filler'));
    expect(h.view().lastRun).toEqual({ kind: 'none', lines: ['Tätä tarkistusta ei ole vielä ajettu tässä luvussa.'], outcome: null, failed: [] });

    const projectAtStart = h.store.project;
    h.queue.push(answer(FILLER_ANSWER));
    expect(h.controller.run()).toBe(true);
    await settle();

    expect(h.counters.updateChapter).toBe(1);
    const first = CHAPTER_1.indexOf('Hän vain');
    const second = CHAPTER_1.indexOf('Lopuksi');
    expect(h.chapter().findings).toEqual([
      {
        id: 'f-1', checkId: 'filler', checkLabel: 'Täytesanat', kind: 'model',
        quote: 'Hän vain katsoi merta.', from: first, to: first + 22, located: true, approx: false,
        before: 'Aamu oli jotenkin harmaa. ', after: '\n\nAika tuntui pysähtyvän. Lopuks',
        note: 'Vain on täytesana.', suggestion: 'Hän katsoi merta.', ref: null, data: null,
        status: 'open', statusAt: null, createdAt: '2026-11-16T17:02:00.000Z',
        // The display name of the model, not its gateway id
        runId: 'r-1', model: 'deepseek-test', logId: 'log-1'
      },
      {
        id: 'f-2', checkId: 'filler', checkLabel: 'Täytesanat', kind: 'model',
        quote: 'Lopuksi hän vain lähti kotiin.', from: second, to: CHAPTER_1.length, located: true, approx: false,
        before: 'merta.\n\nAika tuntui pysähtyvän. ', after: '',
        note: 'Toinen vain.', suggestion: 'Lopuksi hän lähti kotiin.', ref: null, data: null,
        status: 'open', statusAt: null, createdAt: '2026-11-16T17:02:00.000Z',
        runId: 'r-1', model: 'deepseek-test', logId: 'log-1'
      }
    ]);
    expect(h.chapter().reviewRuns).toEqual({
      filler: {
        at: '2026-11-16T17:02:00.000Z', model: 'deepseek-test', scope: 'chapter', outcome: 'ok', batches: 1, failedBatches: 0,
        found: 2, unlocated: 0, suppressed: 0, message: null, dropped: null, fingerprint: textFingerprint(CHAPTER_1)
      }
    });

    h.render();
    const view = h.view();
    expect(view.running).toBeNull();
    expect(view.findings.map(finding => finding.id)).toEqual(['f-1', 'f-2']);
    expect(view.lastRun).toEqual({ kind: 'ok', lines: ['Tarkistettu <17:02>. 2 havaintoa.'], outcome: 'ok', failed: [] });
    expect(view.modelStats).toEqual([{ model: 'deepseek-test', total: 2, invalid: 0 }]);

    // The request: role analysis, the builder's two strings, the answer budget and the log meta
    expect(h.ai.request).toHaveBeenCalledTimes(1);
    const sent = h.ai.request.mock.calls[0][0];
    // retryOnEmpty: the request layer's one resend when reasoning used the whole limit (I-08 review fixes)
    expect(Object.keys(sent).sort()).toEqual(['maxTokens', 'messages', 'meta', 'retryOnEmpty', 'role', 'system']);
    expect(sent).toMatchObject({
      role: 'analysis',
      maxTokens: 1500,
      meta: { action: 'review', actionLabel: 'Tarkistus: Täytesanat', instruction: '', chapterId: 'c1', runId: 'r-1' }
    });
    expect(payloadOf(sent)).toBe(CHAPTER_1);
    const builderCall = h.context.build.mock.calls[1][0];
    expect(builderCall).toMatchObject({ chapterId: 'c1', text: CHAPTER_1, role: 'analysis', answerTokens: 1500, exclude: undefined, include: undefined });
    expect(builderCall.task).toMatchObject({ id: 'review', payload: CHAPTER_1, payloadTag: 'teksti', parts: ['style', 'brief'] });
    // The project as it was when the batch was built
    expect(builderCall.project).toBe(projectAtStart);
  });

  test('a second run replaces the open findings, keeps the decided ones and leaves a decided passage out', async () => {
    const h = await withFillerFindings();
    h.controller.setStatus('f-1', 'invalid');
    expect(h.counters.updateChapter).toBe(2);

    // The model reports the same two passages again, and a new one
    await h.runWith(answer(`${FILLER_ANSWER}\n\nLAINAUS: Aamu oli jotenkin harmaa.\nHUOMIO: Jotenkin on täytesana.\nEHDOTUS: Aamu oli harmaa.`));

    expect(h.chapter().findings.map(finding => [finding.id, finding.status, finding.quote])).toEqual([
      ['f-1', 'invalid', 'Hän vain katsoi merta.'],
      ['f-4', 'open', 'Lopuksi hän vain lähti kotiin.'],
      ['f-5', 'open', 'Aamu oli jotenkin harmaa.']
    ]);
    expect(h.chapter().reviewRuns.filler).toMatchObject({ outcome: 'ok', found: 2, suppressed: 1 });
    expect(h.view().lastRun.lines).toEqual(['Tarkistettu <17:02>. 2 havaintoa.', '1 aiemmin käsitelty havainto jätettiin pois.']);
    expect(h.view().modelStats).toEqual([{ model: 'deepseek-test', total: 3, invalid: 1 }]);
  });

  test('a failed run writes only the run record and leaves earlier findings alone', async () => {
    const h = await withFillerFindings();
    const before = h.chapter().findings;
    expect(before).toHaveLength(2);

    await h.runWith(failure('http_502', 'Yhdyskäytävä ei vastannut (502).'));

    expect(h.counters.updateChapter).toBe(2);
    // The very same array: not even rewritten
    expect(h.chapter().findings).toBe(before);
    expect(h.chapter().reviewRuns.filler).toMatchObject({
      outcome: 'failed', batches: 1, failedBatches: 1, found: 0, suppressed: 0, message: 'Yhdyskäytävä ei vastannut (502).'
    });

    const view = h.view();
    expect(view.findings.map(finding => finding.id)).toEqual(['f-1', 'f-2']);
    expect(view.lastRun).toEqual({
      kind: 'error',
      lines: ['Tarkistus epäonnistui <17:02>.', 'Yhdyskäytävä ei vastannut (502).'],
      outcome: 'failed',
      failed: [{ index: 0, message: 'Yhdyskäytävä ei vastannut (502).' }]
    });
    // A failure never reads as "no findings"
    expect(view.lastRun.lines.join(' ')).not.toContain('Ei havaintoja');

    // An answer that cannot be read is a failure too, and its beginning is kept for the author
    await h.runWith(answer('Teksti on oikein hyvää, en muuttaisi siinä mitään.'));
    expect(h.chapter().findings).toBe(before);
    expect(h.view().lastRun).toMatchObject({
      kind: 'error',
      failed: [{ index: 0, message: 'Mallin vastausta ei voitu tulkita. Se ei ollut pyydetyssä muodossa.', answer: 'Teksti on oikein hyvää, en muuttaisi siinä mitään.' }]
    });

    // The next good run clears the failure details
    await h.runWith(answer('EI HAVAINTOJA'));
    expect(h.view().lastRun).toEqual({ kind: 'ok', lines: ['Tarkistettu <17:02>. Ei havaintoja.'], outcome: 'ok', failed: [] });
    expect(h.chapter().findings).toEqual([]);
  });

  test('a run finishes into its own chapter after the author moved to another one', async () => {
    const h = setup();
    h.controller.selectCheck(check('filler'));
    const pending = deferred();
    h.queue.push(pending);
    h.controller.run();

    h.open('c2');
    expect(h.view().running).toMatchObject({ here: false, chapterId: 'c1', chapterTitle: 'Laituri', checkLabel: 'Täytesanat' });
    expect(h.view().chapterId).toBe('c2');

    pending.resolve(answer(FILLER_ANSWER));
    await settle();

    expect(h.counters.updateChapter).toBe(1);
    expect(h.chapter('c1').findings.map(finding => finding.quote)).toEqual(['Hän vain katsoi merta.', 'Lopuksi hän vain lähti kotiin.']);
    expect(h.chapter('c1').reviewRuns.filler.outcome).toBe('ok');
    expect(h.chapter('c2').findings).toBeUndefined();
    expect(h.chapter('c2').reviewRuns).toBeUndefined();
    // The open chapter shows nothing of it
    expect(h.view().findings).toEqual([]);
    expect(h.view().running).toBeNull();
    h.open('c1');
    expect(h.view().findings).toHaveLength(2);
  });

  test('findings are re-anchored onto the text the chapter has when the run ends', async () => {
    const h = setup();
    h.controller.selectCheck(check('filler'));
    const pending = deferred();
    h.queue.push(pending);
    h.controller.run();

    // The author goes on writing while the model reads
    const edited = `Uusi alku. ${CHAPTER_1.replace('Lopuksi hän vain lähti kotiin.', 'Lopuksi hän käveli pois.')}`;
    h.type(edited);
    pending.resolve(answer(FILLER_ANSWER));
    await settle();

    const [first, second] = h.chapter().findings;
    expect(first).toMatchObject({ quote: 'Hän vain katsoi merta.', located: true, from: edited.indexOf('Hän vain') });
    expect(edited.slice(first.from, first.to)).toBe(first.quote);
    // 32 characters of the text as it is now
    expect(first.before).toBe('alku. Aamu oli jotenkin harmaa. ');
    expect(first.before).toBe(edited.slice(first.from - 32, first.from));
    // The passage that was rewritten meanwhile is kept, without a place
    expect(second).toMatchObject({ quote: 'Lopuksi hän vain lähti kotiin.', located: false, from: null, to: null });
    expect(h.chapter().reviewRuns.filler).toMatchObject({ found: 2, unlocated: 1, fingerprint: textFingerprint(CHAPTER_1) });

    // The record belongs to the text the model read, so the chapter counts as changed since
    h.render();
    expect(h.view().lastRun.lines).toEqual(['Tarkistettu <17:02>. 2 havaintoa. 1 ilman sijaintia.', 'Luku on muuttunut tarkistuksen jälkeen.']);
    expect(h.view().counts).toMatchObject({ open: 2, unlocated: 1 });
  });

  test('a stopped run keeps the findings of the batches that finished', async () => {
    const long = (start, word) => `${start} ${Array.from({ length: 110 }, (_unused, index) => `${word}${index}`).join(' ')}.`;
    const content = [long('Hän vain katsoi merta.', 'alku'), long('Aika tuntui pysähtyvän.', 'loppu')].join('\n\n');
    // A window so small that each paragraph is its own batch
    const h = setup({
      project: makeProject({ structure: [{ id: 'c1', title: 'Laituri', content }] }),
      built: { budgetTokens: 400, charsPerToken: 3 }
    });
    h.controller.selectCheck(check('filler'));
    const pending = deferred();
    h.queue.push(answer('LAINAUS: Hän vain katsoi merta.\nHUOMIO: Täytesana.\nEHDOTUS: Hän katsoi merta.'), pending);

    h.controller.run();
    await settle();
    expect(h.view().running).toMatchObject({ batch: 2, batches: 2, found: 1 });
    expect(h.ai.request).toHaveBeenCalledTimes(2);

    h.controller.stop();
    await settle();
    expect(h.handles[1].cancel).toHaveBeenCalledTimes(1);
    expect(h.chapter().findings.map(finding => finding.quote)).toEqual(['Hän vain katsoi merta.']);
    expect(h.chapter().reviewRuns.filler).toMatchObject({ outcome: 'stopped', batches: 2, found: 1 });
    h.render();
    expect(h.view().lastRun).toMatchObject({ kind: 'warn', lines: ['Tarkistus pysäytettiin <17:02>. Havaintoja voi puuttua.'] });
    expect(h.view().running).toBeNull();

    // Only the first batch was read: an open finding in the second part would have stayed
    // (the covered ranges, not the whole chapter, decide what a stopped run replaces)
    const kept = { ...h.chapter().findings[0], id: 'old-2', quote: 'Aika tuntui pysähtyvän.', from: content.indexOf('Aika'), to: content.indexOf('Aika') + 23 };
    h.set({ project: { ...h.store.project, structure: [{ ...h.chapter(), findings: [...h.chapter().findings, kept] }] } });
    const again = deferred();
    h.queue.push(answer('EI HAVAINTOJA'), again);
    h.controller.run();
    await settle();
    h.controller.stop();
    await settle();
    expect(h.chapter().findings.map(finding => finding.id)).toEqual(['old-2']);
  });

  test('the note of the project goes into the request and setNote writes project.keepNote', async () => {
    const h = setup();
    h.controller.selectCheck(check('dialogue'));

    h.controller.setNote(`Liisan repliikit ovat murretta.${'x'.repeat(1200)}`);
    expect(h.counters.updateProject).toBe(1);
    // One field of the project, shared with Kielenhuolto, at most 1 000 characters
    expect(h.store.project.keepNote).toHaveLength(1000);
    expect(h.store.project.review).toEqual({ longSentenceWords: 30 });
    h.controller.setNote('Liisan repliikit ovat murretta.');
    expect(h.store.project.keepNote).toBe('Liisan repliikit ovat murretta.');
    expect(h.view().note).toBe('Liisan repliikit ovat murretta.');
    h.controller.setNote(null);
    expect(h.store.project.keepNote).toBe('');
    h.controller.setNote('Liisan repliikit ovat murretta.');

    // The preview shows what a run would send, and sends nothing
    const preview = h.controller.preview();
    expect(preview).toMatchObject({ batches: 1, payload: CHAPTER_1, blocked: null });
    expect(preview.task.instruction.endsWith('\n\nTahallista: Liisan repliikit ovat murretta.')).toBe(true);
    expect(h.controller.preview()).toBe(preview);
    expect(h.ai.request).not.toHaveBeenCalled();

    await h.runWith(answer('EI HAVAINTOJA'));
    const content = h.ai.request.mock.calls[0][0].messages[0].content;
    expect(content.endsWith('Tahallista: Liisan repliikit ovat murretta.\n</ohje>')).toBe(true);

    // The choices of the "Mitä malli näkee" row go to the builder with the run
    h.queue.push(answer('EI HAVAINTOJA'));
    h.controller.run({ exclude: ['style'], include: ['cx-1'] });
    await settle();
    const last = h.context.build.mock.calls[h.context.build.mock.calls.length - 1][0];
    expect(last).toMatchObject({ exclude: ['style'], include: ['cx-1'] });

    // A local check has no preview
    h.controller.selectCheck(check('avoid-words'));
    expect(h.controller.preview()).toBeNull();
  });

  test('an own check runs like a built-in one and its instruction goes to the log meta', async () => {
    const own = {
      id: 'custom:pov', kind: 'model', types: ['fiction', 'nonfiction'], builtin: false, suggest: false, label: 'Näkökulma',
      instruction: 'Etsi kohdat, joissa näkökulma vaihtuu kesken kappaleen.', description: 'Etsi kohdat, joissa näkökulma vaihtuu kesken kappaleen.'
    };
    const h = setup();
    h.controller.selectCheck(own);
    await h.runWith(answer('LAINAUS: Aika tuntui pysähtyvän.\nHUOMIO: Näkökulma vaihtuu.'));

    expect(h.ai.request.mock.calls[0][0].meta).toEqual({
      action: 'review', actionLabel: 'Tarkistus: Näkökulma', instruction: own.instruction, chapterId: 'c1', runId: 'r-1'
    });
    expect(h.chapter().findings[0]).toMatchObject({ checkId: 'custom:pov', checkLabel: 'Näkökulma', kind: 'model', suggestion: null });
    expect(h.chapter().reviewRuns['custom:pov'].outcome).toBe('ok');
    expect(h.view().findings).toHaveLength(1);
  });

  test('continuity without anything to compare with writes a blocked record and sends nothing', async () => {
    const h = setup();
    h.controller.selectCheck(check('continuity'));
    expect(h.controller.run()).toBe(true);
    await settle();

    expect(h.ai.request).not.toHaveBeenCalled();
    expect(h.chapter().reviewRuns.continuity).toMatchObject({
      outcome: 'blocked',
      message: 'Ei vertailtavaa: Tarinakansiossa ei ole tähän tekstiin liittyviä kohteita eikä aiemmilla luvuilla ole tiivistelmiä.'
    });
    h.render();
    // The panel tells a refusal from a failure by the outcome: no Yritä uudelleen for it
    expect(h.view().lastRun).toMatchObject({ kind: 'error', outcome: 'blocked', lines: [h.chapter().reviewRuns.continuity.message] });

    // A nonfiction project calls the folder by its other name
    const nonfiction = setup({ project: makeProject({ genre: 'nonfiction' }) });
    nonfiction.controller.selectCheck(check('continuity'));
    nonfiction.controller.run();
    await settle();
    expect(nonfiction.chapter().reviewRuns.continuity.message).toContain('Käsikirjoituksen kansiossa ei ole');
  });

  // I-08 review fixes (conformance-4, live-2, live-3): the panel knows before a run that Jatkuvuus
  // has nothing to compare with, and offers no Tarkista that would only be refused
  test('preview says Ei vertailtavaa for Jatkuvuus when no part has anything to compare with', () => {
    const h = setup();
    h.controller.selectCheck(check('continuity'));
    expect(h.controller.preview()).toMatchObject({
      batches: 1,
      blocked: 'Ei vertailtavaa: Tarinakansiossa ei ole tähän tekstiin liittyviä kohteita eikä aiemmilla luvuilla ole tiivistelmiä.'
    });
    expect(h.ai.request).not.toHaveBeenCalled();
    expect(h.counters.updateChapter).toBe(0);

    // An entry the text mentions: something to compare with, and nothing refused
    const withEntry = setup({
      built: { parts: [{ id: 'codexMentioned', state: 'sent', items: [{ key: 'codex:liisa', label: 'Liisa', text: 'Liisa: siniset silmät.' }] }] }
    });
    withEntry.controller.selectCheck(check('continuity'));
    expect(withEntry.controller.preview()).toMatchObject({ batches: 1, blocked: null });

    // Another check is never refused for this
    h.controller.selectCheck(check('filler'));
    expect(h.controller.preview().blocked).toBeNull();
    // A nonfiction project names its folder
    const nonfiction = setup({ project: makeProject({ genre: 'nonfiction' }) });
    nonfiction.controller.selectCheck(check('continuity'));
    expect(nonfiction.controller.preview().blocked).toContain('Käsikirjoituksen kansiossa ei ole');
  });

  // I-08 review fixes (live-1): a reasoning model that spends the whole limit before its first word
  // gets one resend with a doubled limit from the request layer (CLIENT_CONSTANTS.RETRY_ON_REASONING_EXHAUSTED)
  test('a model check asks the request layer for its one resend when reasoning used the whole limit', async () => {
    const h = setup();
    h.controller.selectCheck(check('filler'));
    await h.runWith(answer(FILLER_ANSWER));
    expect(h.ai.request.mock.calls[0][0]).toMatchObject({ role: 'analysis', maxTokens: 1500, retryOnEmpty: true });
  });

  // I-08 review fixes (live-5): a check of a deleted chapter is not left running
  test('a run whose chapter is deleted is cancelled at the next render', async () => {
    const h = setup();
    h.controller.selectCheck(check('filler'));
    const pending = deferred();
    h.queue.push(pending);
    expect(h.controller.run()).toBe(true);
    await settle();
    expect(h.view().running).toMatchObject({ chapterId: 'c1' });

    // Another chapter is open and the checked one is deleted
    h.open('c2');
    expect(h.handles[0].cancel).not.toHaveBeenCalled();
    h.set({ project: { ...h.store.project, structure: h.store.project.structure.filter(entry => entry.id !== 'c1') } });
    expect(h.handles[0].cancel).toHaveBeenCalledTimes(1);
    // Later renders do not cancel it again
    h.render();
    expect(h.handles[0].cancel).toHaveBeenCalledTimes(1);

    await settle();
    h.render();
    expect(h.view().running).toBeNull();
    // Nothing was written to the chapter that is left
    expect(h.chapter('c2').findings).toBeUndefined();
    expect(h.chapter('c2').reviewRuns).toBeUndefined();
    // A new check can start at once
    h.queue.push(answer('EI HAVAINTOJA'));
    expect(h.controller.run()).toBe(true);
  });

  test('without a context builder the plain layout is used', async () => {
    const h = setup({ context: null, project: makeProject({ language: 'en' }) });
    h.controller.selectCheck(check('cliche'));
    await h.runWith(answer('LAINAUS: Aika tuntui pysähtyvän.\nHUOMIO: Kulunut kuva.'));

    const sent = h.ai.request.mock.calls[0][0];
    expect(sent.system.split('\n')[1]).toBe('Write and answer in English.');
    expect(payloadOf(sent)).toBe(CHAPTER_1);
    expect(h.chapter().findings.map(finding => finding.quote)).toEqual(['Aika tuntui pysähtyvän.']);
  });
});

// ---------------------------------------------------------------------------
// Reading feedback
// ---------------------------------------------------------------------------

describe('reading feedback', () => {
  const FEEDBACK_ANSWER = [
    'LAINAUS: Lopuksi hän vain lähti kotiin.',
    'HUOMIO: Loppu jää ilmaan.',
    'VAKAVUUS: pieni',
    '',
    'LAINAUS: Aamu oli jotenkin harmaa.',
    'HUOMIO: Alku asettaa sävyn.',
    'VAKAVUUS: toimii',
    '',
    'LAINAUS: Aika tuntui pysähtyvän.',
    'HUOMIO: Kulunut kuva katkaisee lukemisen.',
    'VAKAVUUS: suuri',
    'EHDOTUS: Hetki venyi.',
    '',
    'LAINAUS: Hän vain katsoi merta.',
    'HUOMIO: Lukija ei tiedä miksi.',
    'VAKAVUUS: jokin muu'
  ].join('\n');

  test('while the reading feedback is selected the scope is the chapter and it is locked', async () => {
    const h = setup();
    h.controller.setScope('selection');
    h.set({ selection: { from: 0, to: 10 } });
    h.controller.selectCheck(check('reading-feedback'));

    expect(h.view()).toMatchObject({ scope: 'chapter', scopeLocked: true, feedback: { works: [], concerns: [] } });
    // The editor has a selection; the whole chapter is sent all the same
    h.editor.selectionStart = 0;
    h.editor.selectionEnd = 10;
    await h.runWith(answer(FEEDBACK_ANSWER));

    expect(h.ai.request).toHaveBeenCalledTimes(1);
    expect(payloadOf(h.ai.request.mock.calls[0][0])).toBe(CHAPTER_1);
    expect(h.ai.request.mock.calls[0][0]).toMatchObject({ maxTokens: 2000, meta: { actionLabel: 'Tarkistus: Lukupalaute', instruction: '' } });
    expect(h.chapter().reviewRuns['reading-feedback']).toMatchObject({ scope: 'chapter', outcome: 'ok', found: 4 });

    // With another check the author's own choice of scope is back
    h.controller.selectCheck(check('filler'));
    expect(h.view()).toMatchObject({ scope: 'selection', scopeLocked: false, feedback: null });
  });

  test('a reading-feedback finding stores its severity in data and has no suggestion', async () => {
    const h = setup();
    h.controller.selectCheck(check('reading-feedback'));
    await h.runWith(answer(FEEDBACK_ANSWER));

    expect(h.chapter().findings.map(finding => [finding.quote, finding.data, finding.suggestion])).toEqual([
      ['Lopuksi hän vain lähti kotiin.', { severity: 'low' }, null],
      ['Aamu oli jotenkin harmaa.', { severity: 'works' }, null],
      // An EHDOTUS that came although none was asked is not kept
      ['Aika tuntui pysähtyvän.', { severity: 'high' }, null],
      // A severity word that could not be read
      ['Hän vain katsoi merta.', { severity: null }, null]
    ]);
    expect(h.chapter().findings.every(finding => finding.kind === 'model' && finding.checkLabel === 'Lukupalaute')).toBe(true);

    // The panel's two groups: what works, then the concerns from suuri to pieni, the unreadable one last
    const view = h.view();
    expect(view.feedback.works.map(finding => finding.quote)).toEqual(['Aamu oli jotenkin harmaa.']);
    expect(view.feedback.concerns.map(finding => finding.quote)).toEqual(['Aika tuntui pysähtyvän.', 'Lopuksi hän vain lähti kotiin.', 'Hän vain katsoi merta.']);
    // The list itself stays in reading order, and nothing in the view is a number about the text
    expect(view.findings.map(finding => finding.from)).toEqual([...view.findings.map(finding => finding.from)].sort((a, b) => a - b));
    expect(Object.keys(view.feedback)).toEqual(['works', 'concerns', 'others']);
    expect(view.feedback.others).toEqual([]);

    // "Näytä ehdotus" has nothing to show for these
    expect(h.controller.showFix(view.findings[0].id)).toBe(false);
    expect(h.propose).not.toHaveBeenCalled();
    // The groups follow the filter: a concern marked Eri mieltä leaves the open list
    h.controller.setStatus(view.feedback.concerns[0].id, 'disagree');
    expect(h.view().feedback.concerns.map(finding => finding.quote)).toEqual(['Lopuksi hän vain lähti kotiin.', 'Hän vain katsoi merta.']);
  });

  // I-08 review fixes (conformance-3): with Vain valittu tarkistus off the other checks' findings are
  // not drawn as concerns (where they would also offer Näytä ehdotus)
  test('the reading feedback groups hold its own findings and the other checks\' findings follow', async () => {
    const h = await withFillerFindings();
    h.controller.selectCheck(check('reading-feedback'));
    await h.runWith(answer(FEEDBACK_ANSWER));
    h.controller.setFilter({ onlyCheck: false });

    const view = h.view();
    expect(view.feedback.works.map(finding => finding.checkId)).toEqual(['reading-feedback']);
    expect(view.feedback.concerns.map(finding => finding.checkId)).toEqual(['reading-feedback', 'reading-feedback', 'reading-feedback']);
    expect(view.feedback.others.map(finding => [finding.checkId, finding.quote])).toEqual([
      ['filler', 'Hän vain katsoi merta.'],
      ['filler', 'Lopuksi hän vain lähti kotiin.']
    ]);
    // Nothing is lost: the groups and the rest are the listed findings
    expect(view.feedback.works.length + view.feedback.concerns.length + view.feedback.others.length).toBe(view.findings.length);

    h.controller.setFilter({ onlyCheck: true });
    expect(h.view().feedback.others).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Selecting and highlighting
// ---------------------------------------------------------------------------

describe('selection and highlights', () => {
  test('select places the caret at the passage, scrolls to it and focuses the editor', async () => {
    const h = await withFillerFindings();
    const second = CHAPTER_1.indexOf('Lopuksi');
    const notified = h.counters.notify;

    h.controller.select('f-2');
    // A caret, not a selection: a key press cannot replace the passage
    expect(h.editor.setSelectionRange).toHaveBeenCalledTimes(1);
    expect(h.editor.setSelectionRange).toHaveBeenCalledWith(second, second);
    expect(h.editor.scrollToPos).toHaveBeenCalledWith(second);
    expect(h.editor.focus).toHaveBeenCalledTimes(1);
    expect(h.view()).toMatchObject({ selectedId: 'f-2', selectedBy: 'list', position: { index: 2, total: 2 } });
    expect(h.counters.notify).toBe(notified + 1);

    // The place is the one the passage has now
    h.type(`Uusi alku. ${CHAPTER_1}`);
    h.controller.select('f-1');
    expect(h.editor.setSelectionRange).toHaveBeenLastCalledWith(CHAPTER_1.indexOf('Hän vain') + 11, CHAPTER_1.indexOf('Hän vain') + 11);

    // The stepper: next and previous finding with a place, wrapping
    h.controller.step(1);
    expect(h.view().selectedId).toBe('f-2');
    h.controller.step(1);
    expect(h.view().selectedId).toBe('f-1');
    h.controller.step(-1);
    expect(h.view().selectedId).toBe('f-2');
    h.controller.step('previous');
    expect(h.view().selectedId).toBe('f-1');
    expect(h.editor.focus).toHaveBeenCalledTimes(6);

    // Another chapter: the selection does not carry over
    h.open('c2');
    expect(h.view()).toMatchObject({ selectedId: null, selectedBy: null, position: null });
    h.controller.step(1);
    expect(h.view().selectedId).toBeNull();
  });

  test('select of a finding without a place does not touch the editor', async () => {
    const h = setup();
    h.controller.selectCheck(check('filler'));
    await h.runWith(answer(`LAINAUS: Tätä virkettä ei ole luvussa lainkaan.\nHUOMIO: Malli keksi lainauksen.\n\n${FILLER_ANSWER}`));
    const lost = h.view().findings.find(finding => !finding.located);
    expect(lost).toMatchObject({ quote: 'Tätä virkettä ei ole luvussa lainkaan.', from: null });
    // Findings without a place come last and stay in the list
    expect(h.view().findings.map(finding => finding.located)).toEqual([true, true, false]);
    expect(h.view().counts).toMatchObject({ open: 3, unlocated: 1 });

    h.controller.select(lost.id);
    expect(h.editor.setSelectionRange).not.toHaveBeenCalled();
    expect(h.editor.scrollToPos).not.toHaveBeenCalled();
    expect(h.editor.focus).not.toHaveBeenCalled();
    expect(h.view()).toMatchObject({ selectedId: lost.id, selectedBy: 'list', position: { index: 3, total: 3 } });

    // The stepper passes over it
    h.controller.step(1);
    expect(h.view().selectedId).toBe(h.view().findings[0].id);
    h.controller.step(-1);
    expect(h.view().selectedId).toBe(h.view().findings[1].id);
    // It is never searched for elsewhere in the chapter, even when the same words appear there later
    h.type(`${CHAPTER_1} Tätä virkettä ei ole luvussa lainkaan.`);
    expect(h.view().findings.find(finding => finding.id === lost.id).located).toBe(false);
  });

  test('onFindingClick selects without scrolling the text', async () => {
    const h = await withFillerFindings();
    const notified = h.counters.notify;

    h.controller.onFindingClick('f-2');
    expect(h.view()).toMatchObject({ selectedId: 'f-2', selectedBy: 'editor', position: { index: 2, total: 2 } });
    expect(h.counters.notify).toBe(notified + 1);
    // The caret is already where the author clicked
    expect(h.editor.setSelectionRange).not.toHaveBeenCalled();
    expect(h.editor.scrollToPos).not.toHaveBeenCalled();
    expect(h.editor.focus).not.toHaveBeenCalled();
    expect(h.controller.highlightProps().activeId).toBe('f-2');
  });

  test('highlightProps is null when the tab is not visible', async () => {
    const h = await withFillerFindings();
    expect(h.controller.highlightProps()).toEqual({
      version: expect.any(Number),
      items: [
        { id: 'f-1', from: CHAPTER_1.indexOf('Hän vain'), to: CHAPTER_1.indexOf('Hän vain') + 22 },
        { id: 'f-2', from: CHAPTER_1.indexOf('Lopuksi'), to: CHAPTER_1.length }
      ],
      activeId: null
    });

    h.set({ visible: false });
    expect(h.controller.highlightProps()).toBeNull();
    h.set({ visible: true });
    expect(h.controller.highlightProps().items).toHaveLength(2);

    // Only open findings of the list are underlined
    h.controller.setStatus('f-1', 'done');
    expect(h.controller.highlightProps().items.map(item => item.id)).toEqual(['f-2']);
    // Local hits are underlined the same way
    h.controller.selectCheck(check('avoid-words'));
    expect(h.controller.highlightProps().items.map(item => [item.from, item.to])).toEqual([
      [CHAPTER_1.indexOf('jotenkin'), CHAPTER_1.indexOf('jotenkin') + 8],
      [CHAPTER_1.indexOf('vain'), CHAPTER_1.indexOf('vain') + 4],
      [CHAPTER_1.lastIndexOf('vain'), CHAPTER_1.lastIndexOf('vain') + 4]
    ]);
    // Before the first bind there is nothing to show
    expect(createReviewController({ text, matchTerms, ai: h.ai, context: null, projectType: () => 'fiction', formatTime: String }).highlightProps()).toBeNull();
  });

  test('highlightProps keeps its version while the author types and raises it on select, status and filter changes', async () => {
    const h = await withFillerFindings();
    const first = h.controller.highlightProps();
    const again = h.controller.highlightProps();
    // A new object on every call, the same version
    expect(again).not.toBe(first);
    expect(again).toEqual(first);

    // Typing after, between and in front of the findings: the editor moves its marks by itself
    h.type(`${CHAPTER_1} Ja vielä yksi virke.`);
    expect(h.controller.highlightProps().version).toBe(first.version);
    h.type(`Uusi alku. ${CHAPTER_1} Ja vielä yksi virke.`);
    const typed = h.controller.highlightProps();
    expect(typed.version).toBe(first.version);
    // The items handed out are those of the text of this render
    expect(typed.items[0].from).toBe(first.items[0].from + 11);

    let last = typed.version;
    const raised = () => {
      const version = h.controller.highlightProps().version;
      const grew = version > last;
      last = version;
      return grew;
    };
    h.controller.select('f-2');
    expect(raised()).toBe(true);
    h.controller.onFindingClick('f-1');
    expect(raised()).toBe(true);
    h.controller.setStatus('f-1', 'done');
    expect(raised()).toBe(true);
    h.controller.setFilter({ status: 'all' });
    expect(raised()).toBe(true);
    h.controller.setFilter({ onlyCheck: false });
    expect(raised()).toBe(true);
    h.controller.setScope('selection');
    expect(raised()).toBe(true);
    h.controller.selectCheck(check('cliche'));
    expect(raised()).toBe(true);
    h.controller.selectCheck(check('filler'));
    expect(raised()).toBe(true);
    expect(raised()).toBe(false);

    // An edit that takes a finding's passage away changes the set of marks
    h.type(h.chapter().content.replace('Lopuksi hän vain lähti kotiin.', 'Lopuksi hän jäi.'));
    expect(h.controller.highlightProps().items).toEqual([]);
    expect(raised()).toBe(true);
    // and the passage coming back changes it again
    h.type(`Uusi alku. ${CHAPTER_1}`);
    expect(raised()).toBe(true);
    expect(raised()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// "Näytä ehdotus"
// ---------------------------------------------------------------------------

describe('showing a fix', () => {
  test('showFix proposes the changes through propose with baseText and the model meta', async () => {
    const h = await withFillerFindings();
    const before = h.chapter();

    expect(h.controller.showFix('f-1')).toBe(true);
    expect(h.propose).toHaveBeenCalledTimes(1);
    const [chapterId, changes, options] = h.propose.mock.calls[0];
    expect(chapterId).toBe('c1');
    expect(changes).toEqual([{ from: CHAPTER_1.indexOf('vain '), to: CHAPTER_1.indexOf('katsoi'), insert: '', original: 'vain ' }]);
    // The offsets are those of the text named in the same call
    expect(options).toEqual({
      baseText: CHAPTER_1,
      meta: {
        source: 'faust',
        action: 'review-fix',
        actionLabel: 'Tarkistus: Täytesanat',
        instruction: '',
        provider: null,
        model: 'deepseek-test',
        requestLogId: 'log-1'
      }
    });
    expect(options.meta).not.toHaveProperty('requestId');

    // Nothing was written: the change is a pending suggestion, the finding is still open
    expect(h.chapter()).toBe(before);
    expect(h.view().findings[0].status).toBe('open');
    // The finding is selected and its passage shown
    expect(h.view()).toMatchObject({ selectedId: 'f-1', selectedBy: 'list', notice: null });
    expect(h.editor.scrollToPos).toHaveBeenCalledWith(CHAPTER_1.indexOf('Hän vain'));

    // With the typography module's helper the model's straight marks do not become changes
    const normalise = jest.fn((modelText) => modelText.replace(/"/g, '”'));
    const quoted = setup({
      project: makeProject({ structure: [{ id: 'c1', title: 'Laituri', content: 'Hän sanoi vain: ”Tule jo.”' }] }),
      deps: { normaliseModelText: normalise }
    });
    quoted.controller.selectCheck(check('filler'));
    await quoted.runWith(answer('LAINAUS: Hän sanoi vain: ”Tule jo.”\nHUOMIO: Täytesana.\nEHDOTUS: Hän sanoi: "Tule jo."'));
    expect(quoted.controller.showFix('f-1')).toBe(true);
    expect(normalise).toHaveBeenCalledWith('Hän sanoi: "Tule jo."', 'Hän sanoi vain: ”Tule jo.”');
    expect(quoted.propose.mock.calls[0][1]).toEqual([{ from: 9, to: 14, insert: '', original: ' vain' }]);
  });

  test('showFix of a typography question proposes – for - with source local', () => {
    const content = 'Alku.\n  - Tuletko sinä jo?\nLoppu.';
    const h = setup({ project: makeProject({ structure: [{ id: 'c1', title: 'Laituri', content }] }) });
    h.controller.selectCheck(check('typography-questions'));
    const [question] = h.view().findings;
    expect(question).toMatchObject({ quote: '  - Tuletko sinä jo?', kind: 'local', note: DASH_MESSAGE, data: { ruleId: 'rivin-alun-viiva', url: DASH_URL } });

    expect(h.controller.showFix(question.id)).toBe(true);
    const dash = content.indexOf('- Tuletko');
    expect(h.propose).toHaveBeenCalledWith('c1', [{ from: dash, to: dash + 2, insert: '– ', original: '- ' }], {
      baseText: content,
      meta: { source: 'local', action: 'typography', actionLabel: '', instruction: '', provider: null, model: null, requestLogId: null }
    });
    expect(h.counters.updateChapter).toBe(0);

    // A question that was decided earlier is stored with the offsets of that moment; the change
    // is taken from the line as it is now
    h.controller.setStatus(question.id, 'disagree');
    const moved = `Uusi rivi alkuun.\n${content}`;
    h.type(moved);
    h.controller.setFilter({ status: 'disagree' });
    expect(h.view().findings.map(finding => finding.id)).toEqual(['f-1']);
    expect(h.controller.showFix('f-1')).toBe(true);
    const movedDash = moved.indexOf('- Tuletko');
    expect(h.propose).toHaveBeenLastCalledWith('c1', [{ from: movedDash, to: movedDash + 2, insert: '– ', original: '- ' }], expect.objectContaining({ baseText: moved }));

    // The other local hits have nothing to propose
    const avoid = setup();
    expect(avoid.controller.showFix(avoid.view().findings[0].id)).toBe(false);
    expect(avoid.propose).not.toHaveBeenCalled();
    expect(avoid.view().notice).toBeNull();
  });

  test('showFix gives a notice and proposes nothing for a protected, approximate or changed passage', async () => {
    const content = 'Hän vain käveli <u>hitaasti</u> rantaa kohti. Hän oli ajanut mökille omalla autollaan jo edellisenä iltana. Lopuksi hän vain lähti kotiin. Sitten satoi.';
    const h = setup({ project: makeProject({ structure: [{ id: 'c1', title: 'Laituri', content }] }) });
    h.controller.selectCheck(check('filler'));
    await h.runWith(answer([
      // The suggestion rewrites across the opening tag
      'LAINAUS: Hän vain käveli hitaasti rantaa kohti.',
      'HUOMIO: Täytesana.',
      'EHDOTUS: Hän asteli rantaa kohti.',
      '',
      // The model wrote the name where the text has "Hän": found by its tail only
      'LAINAUS: Antti oli ajanut mökille omalla autollaan jo edellisenä iltana.',
      'HUOMIO: Pitkä.',
      'EHDOTUS: Antti oli ajanut mökille jo illalla.',
      '',
      'LAINAUS: Lopuksi hän vain lähti kotiin.',
      'HUOMIO: Täytesana.',
      'EHDOTUS: Lopuksi hän lähti kotiin.',
      '',
      // The same words with tags of the model's own
      'LAINAUS: Sitten satoi.',
      'HUOMIO: Lyhyt.',
      'EHDOTUS: <u>Sitten</u> satoi.'
    ].join('\n')));
    const [tagged, approximate, plain, same] = h.view().findings;
    expect(approximate).toMatchObject({ approx: true, modelQuote: 'Antti oli ajanut mökille omalla autollaan jo edellisenä iltana.' });

    const notices = [];
    const refused = (id) => {
      expect(h.controller.showFix(id)).toBe(false);
      notices.push(h.view().notice);
      h.controller.dismissNotice();
    };
    refused(tagged.id);
    refused(approximate.id);
    refused(same.id);
    // The author rewrites the third passage: its finding has no place any more
    h.type(content.replace('Lopuksi hän vain lähti kotiin.', 'Lopuksi hän käveli pois.'));
    refused(plain.id);
    // The suggestion layer refuses: something is already pending at that place
    h.type(content);
    h.propose.mockReturnValueOnce({ ok: false, groupId: null, ids: [], skipped: [{ index: 0, reason: 'conflict' }] });
    refused(plain.id);
    h.propose.mockReturnValueOnce({ ok: true, groupId: 'g9', ids: [], skipped: [{ index: 0, reason: 'target-changed' }] });
    refused(plain.id);

    expect(notices).toEqual([
      'Ehdotusta ei voi näyttää muutoksena, koska se osuisi muistutukseen tai alleviivaukseen. Tee muutos käsin.',
      'Sijainti on likimääräinen, joten ehdotusta ei voi näyttää muutoksena. Tee muutos käsin.',
      'Ehdotus ei muuta tekstiä.',
      'Ehdotusta ei voi näyttää, koska kohtaa ei löytynyt tekstistä.',
      'Ehdotusta ei voitu avata. Kohdassa on jo käsittelemätön ehdotus tai teksti on muuttunut.',
      'Ehdotusta ei voitu avata. Kohdassa on jo käsittelemätön ehdotus tai teksti on muuttunut.'
    ]);
    // Only the two calls that the suggestion layer itself refused
    expect(h.propose).toHaveBeenCalledTimes(2);
    expect(h.view().selectedId).toBeNull();
    expect(h.chapter().findings.every(finding => finding.status === 'open')).toBe(true);
    // A finding without a suggestion, or an unknown one: nothing happens and nothing is said
    expect(h.controller.showFix('missing')).toBe(false);
    expect(h.view().notice).toBeNull();
  });

  const pendingOf = (...ids) => ids.map(id => ({ id, groupId: 'g1', state: 'pending' }));

  test('reconcileFixes marks the finding Tehty when its suggestion group was accepted', async () => {
    const h = await withFillerFindings();
    h.controller.showFix('f-1');
    const writes = h.counters.updateChapter;

    // Both suggestions are still waiting: nothing changes
    h.editor.suggestions = { pending: pendingOf('s1', 's2'), rejected: [] };
    h.controller.reconcileFixes();
    expect(h.chapter().findings[0].status).toBe('open');
    // One accepted, one waiting: still open
    h.editor.suggestions = { pending: pendingOf('s2'), rejected: [] };
    h.controller.reconcileFixes();
    expect(h.counters.updateChapter).toBe(writes);

    // Accepted suggestions are in neither list
    h.editor.suggestions = { pending: [], rejected: [] };
    h.controller.reconcileFixes();
    expect(h.chapter().findings[0]).toMatchObject({ id: 'f-1', status: 'done', statusAt: '2026-11-16T17:02:00.000Z' });
    expect(h.chapter().findings[1].status).toBe('open');
    expect(h.counters.updateChapter).toBe(writes + 1);
    // Once is enough
    h.controller.reconcileFixes();
    expect(h.counters.updateChapter).toBe(writes + 1);

    // The app does not call it: every render schedules it in a microtask, never during the render
    const auto = await withFillerFindings();
    auto.controller.showFix('f-2');
    auto.editor.suggestions = { pending: [], rejected: [] };
    auto.render();
    expect(auto.chapter().findings[1].status).toBe('open');
    await Promise.resolve();
    expect(auto.chapter().findings[1].status).toBe('done');

    // Suggestions of another group do not count
    const other = await withFillerFindings();
    other.controller.showFix('f-1');
    other.editor.suggestions = { pending: [...pendingOf('s1', 's2'), { id: 's7', groupId: 'g7', state: 'pending' }], rejected: [] };
    other.controller.reconcileFixes();
    expect(other.chapter().findings[0].status).toBe('open');
    // In another chapter the open editor's snapshot says nothing about this fix
    other.open('c2');
    other.editor.suggestions = { pending: [], rejected: [] };
    other.controller.reconcileFixes();
    expect(other.chapter('c1').findings[0].status).toBe('open');
  });

  test('reconcileFixes puts it back to Avoin when the acceptance was undone', async () => {
    const h = await withFillerFindings();
    h.controller.showFix('f-1');
    h.editor.suggestions = { pending: [], rejected: [] };
    h.controller.reconcileFixes();
    expect(h.chapter().findings[0].status).toBe('done');

    // Undo: the text and the pending suggestions are back
    h.editor.suggestions = { pending: pendingOf('s1', 's2'), rejected: [] };
    h.controller.reconcileFixes();
    expect(h.chapter().findings[0].status).toBe('open');
    // Redo: accepted again
    h.editor.suggestions = { pending: [], rejected: [] };
    h.controller.reconcileFixes();
    expect(h.chapter().findings[0].status).toBe('done');

    // A status the author set by hand is not overruled: only the automatic Tehty is taken back
    const manual = await withFillerFindings();
    manual.controller.showFix('f-1');
    manual.controller.setStatus('f-1', 'done');
    manual.editor.suggestions = { pending: pendingOf('s1', 's2'), rejected: [] };
    manual.controller.reconcileFixes();
    expect(manual.chapter().findings[0].status).toBe('done');
    // and an automatic Tehty the author set back to Avoin stays open
    h.controller.setFilter({ status: 'all' });
    h.controller.setStatus('f-1', 'open');
    h.controller.reconcileFixes();
    expect(h.chapter().findings[0].status).toBe('open');
  });

  test('reconcileFixes leaves the finding open when the suggestion was rejected', async () => {
    const h = await withFillerFindings();
    h.controller.showFix('f-1');
    const writes = h.counters.updateChapter;

    h.editor.suggestions = { pending: [], rejected: [{ id: 's1', groupId: 'g1', state: 'rejected' }, { id: 's2', groupId: 'g1', state: 'rejected' }] };
    h.controller.reconcileFixes();
    expect(h.chapter().findings[0].status).toBe('open');
    expect(h.counters.updateChapter).toBe(writes);

    // The link is gone: whatever the snapshot says later, this finding is not touched
    h.editor.suggestions = { pending: [], rejected: [] };
    h.controller.reconcileFixes();
    expect(h.chapter().findings[0].status).toBe('open');
    expect(h.counters.updateChapter).toBe(writes);

    // One accepted and one rejected is an accepted fix
    const mixed = await withFillerFindings();
    mixed.controller.showFix('f-1');
    mixed.editor.suggestions = { pending: [], rejected: [{ id: 's2', groupId: 'g1', state: 'rejected' }] };
    mixed.controller.reconcileFixes();
    expect(mixed.chapter().findings[0].status).toBe('done');

    // An editor without the suggestion layer: nothing to read, nothing changes
    const bare = await withFillerFindings();
    bare.controller.showFix('f-1');
    bare.editor.getSuggestions = undefined;
    expect(() => bare.controller.reconcileFixes()).not.toThrow();
    expect(bare.chapter().findings[0].status).toBe('open');
  });
});

// ---------------------------------------------------------------------------
// The session
// ---------------------------------------------------------------------------

describe('the session', () => {
  test('aiOff moves the selection to a local check', async () => {
    const h = await withFillerFindings();
    h.controller.select('f-1');
    expect(h.view().check.id).toBe('filler');
    const notified = h.counters.notify;

    h.set({ aiOff: true });
    // Already in the view of the same render, without a notification of its own
    expect(h.view().check).toBe(check('avoid-words'));
    expect(h.view().check.kind).toBe('local');
    expect(h.view().selectedId).toBeNull();
    expect(h.counters.notify).toBe(notified);
    expect(h.quotes()).toEqual(['jotenkin', 'vain', 'vain']);
    // The stored model findings are still there for the "all checks" list
    h.controller.setFilter({ onlyCheck: false });
    expect(h.view().findings.map(finding => finding.kind)).toEqual(['local', 'model', 'local', 'model', 'local']);

    // A model check cannot be started while the switch is on
    h.controller.selectCheck(check('filler'));
    h.render();
    expect(h.view().check.kind).toBe('local');
    h.controller.selectCheck(check('filler'));
    expect(h.controller.run()).toBe(false);
    expect(h.view().notice).toBe('Tekoäly pois -asetus on päällä.');
    expect(h.ai.request).toHaveBeenCalledTimes(1);

    // A local check that was selected stays selected
    const local = setup();
    local.controller.selectCheck(check('long-sentences'));
    local.set({ aiOff: true });
    expect(local.view().check.id).toBe('long-sentences');
  });

  test('clearCheck asks first and removes the check\'s findings and run record', async () => {
    const h = await withFillerFindings();
    // A decided local finding and another check's record stay
    h.controller.selectCheck(check('avoid-words'));
    h.controller.setStatus(h.view().findings[0].id, 'disagree');
    h.controller.selectCheck(check('cliche'));
    await h.runWith(answer('LAINAUS: Aika tuntui pysähtyvän.\nHUOMIO: Kulunut kuva.'));
    h.controller.selectCheck(check('filler'));
    h.controller.setStatus('f-1', 'done');
    h.controller.select('f-2');
    expect(h.chapter().findings.map(finding => finding.checkId)).toEqual(['filler', 'filler', 'avoid-words', 'cliche']);

    // "Peruuta": nothing happens
    h.askConfirm.mockResolvedValueOnce(false);
    const writes = h.counters.updateChapter;
    await expect(h.controller.clearCheck()).resolves.toBe(false);
    expect(h.askConfirm).toHaveBeenCalledWith(
      'Tyhjennetäänkö havainnot?',
      'Tarkistuksen ”Täytesanat” kaikki havainnot tästä luvusta poistetaan, myös käsitellyt. Poistoa ei voi kumota.',
      'Tyhjennä havainnot',
      'Peruuta'
    );
    expect(h.counters.updateChapter).toBe(writes);
    expect(h.chapter().findings).toHaveLength(4);

    await expect(h.controller.clearCheck()).resolves.toBe(true);
    expect(h.counters.updateChapter).toBe(writes + 1);
    // Decided findings of the check go too; the other checks keep theirs
    expect(h.chapter().findings.map(finding => finding.checkId)).toEqual(['avoid-words', 'cliche']);
    expect(Object.keys(h.chapter().reviewRuns)).toEqual(['cliche']);
    expect(h.view()).toMatchObject({ findings: [], selectedId: null });
    expect(h.view().lastRun).toEqual({ kind: 'none', lines: ['Tätä tarkistusta ei ole vielä ajettu tässä luvussa.'], outcome: null, failed: [] });
  });

  test('reset cancels a run and forgets the session', async () => {
    const h = await withFillerFindings();
    h.controller.setScope('selection');
    h.controller.setFilter({ status: 'all', onlyCheck: false });
    h.controller.select('f-1');
    h.controller.showFix('f-1');
    const pending = deferred();
    h.queue.push(pending);
    h.set({ selection: { from: 0, to: 30 } });
    h.editor.selectionStart = 0;
    h.editor.selectionEnd = 30;
    expect(h.controller.run()).toBe(true);
    expect(h.controller.run()).toBe(false);
    expect(h.view().notice).not.toBeNull();
    const versionBefore = h.controller.highlightProps().version;
    const writes = h.counters.updateChapter;

    h.controller.reset();
    expect(h.handles[h.handles.length - 1].cancel).toHaveBeenCalledTimes(1);

    // Another project opens: the same chapter id, another book
    const next = makeProject({ title: 'Toinen kirja', avoidWords: [] });
    h.set({ project: next, selection: null });
    expect(h.view()).toMatchObject({
      running: null,
      notice: null,
      scope: 'chapter',
      filter: { status: 'open', onlyCheck: true },
      selectedId: null,
      selectedBy: null
    });
    // The default check is chosen again, for the new project
    expect(h.view().check.id).toBe('long-sentences');
    expect(h.controller.highlightProps().version).toBeGreaterThan(versionBefore);

    // The cancelled run ends later: nothing of it reaches the new project
    await settle();
    expect(h.counters.updateChapter).toBe(writes);
    expect(h.chapter().findings).toBeUndefined();
    expect(h.chapter().reviewRuns).toBeUndefined();
    // The link from the old finding to its suggestion is gone as well
    h.editor.suggestions = { pending: [], rejected: [] };
    h.controller.reconcileFixes();
    expect(h.counters.updateChapter).toBe(writes);
    // A new run can start
    h.controller.selectCheck(check('filler'));
    h.queue.push(answer('EI HAVAINTOJA'));
    expect(h.controller.run()).toBe(true);
    await settle();
    expect(h.chapter().reviewRuns.filler.outcome).toBe('ok');
  });

  test('the filter and the counts follow the selected check', async () => {
    const h = await withFillerFindings();
    h.controller.setStatus('f-1', 'disagree');
    expect(h.view().counts).toEqual({ open: 1, done: 0, disagree: 1, invalid: 0, all: 2, unlocated: 0 });
    expect(h.view().findings.map(finding => finding.id)).toEqual(['f-2']);

    h.controller.setFilter({ status: 'all' });
    expect(h.view().findings.map(finding => finding.id)).toEqual(['f-1', 'f-2']);
    // Every check: the stored findings of all of them (open local hits belong to their own check's list)
    h.controller.selectCheck(check('cliche'));
    expect(h.view().findings).toEqual([]);
    h.controller.setFilter({ onlyCheck: false });
    expect(h.view().findings.map(finding => finding.id)).toEqual(['f-1', 'f-2']);
    expect(h.view().counts.all).toBe(2);
    // A value that is not a filter changes nothing
    h.controller.setFilter({ status: 'kaikki', onlyCheck: 'ehkä' });
    expect(h.view().filter).toEqual({ status: 'all', onlyCheck: false });
  });
});

// ---------------------------------------------------------------------------
// The default controller
// ---------------------------------------------------------------------------

describe('createDefaultReviewController', () => {
  // The modules of the other tasks are required inside the function. When they are all in the
  // tree, the controller is built over them; while one is missing, this case is skipped.
  const REQUIRED = [
    '../../src/editor/locateQuote.js', '../../src/editor/blocks.js', '../../src/editor/sentences.js', '../../src/editor/wordDiff.js',
    '../../src/services/ai/batchParagraphs.js', '../../src/editor/termMatch.js', '../../src/editor/typography.fi.js',
    '../../src/services/ai/aiClient.js', '../../src/services/format.fi.js', '../../src/services/ai/contextSession.js',
    '../../src/services/ai/contextBuilder.js', '../../src/services/story/codex.js'
  ];
  const present = REQUIRED.every((file) => {
    try {
      require.resolve(file);
      return true;
    } catch (error) {
      return false;
    }
  });
  const withAllModules = present ? test : test.skip;

  test('requiring the module loads none of the other tasks\' modules', () => {
    const fs = require('fs');
    const path = require('path');
    const root = path.join(__dirname, '../..');
    const source = fs.readFileSync(path.join(root, 'src/services/review/reviewController.js'), 'utf8');
    const requiresOf = (code) => Array.from(code.matchAll(/require\('([^']+)'\)/g), match => match[1]);

    // At module load: only this feature's own files
    const [head, body] = source.split('function createDefaultReviewController()');
    expect(requiresOf(head).sort()).toEqual(['../ai/reviewPass.js', './findings.js', './localChecks.js', './reviewChecks.js']);
    // Inside the function: the modules of the other tasks, each by the path the contract names
    expect(requiresOf(body).map(file => path.join('src/services/review', file).replace(/\\/g, '/')).sort())
      .toEqual(REQUIRED.map(file => file.replace('../../', '')).sort());
    expect(typeof createDefaultReviewController).toBe('function');

    // None of this feature's modules loads CodeMirror or React, and the pure ones load only plainView
    const files = {
      'src/editor/plainView.js': [],
      'src/editor/reviewHighlightsCore.js': [],
      'src/services/review/reviewChecks.js': [],
      'src/services/review/findings.js': [],
      'src/services/review/localChecks.js': ['../../editor/plainView.js'],
      'src/services/ai/reviewPass.js': ['../../editor/plainView.js']
    };
    for (const [file, allowed] of Object.entries(files)) {
      const code = fs.readFileSync(path.join(root, file), 'utf8');
      expect([file, requiresOf(code)]).toEqual([file, allowed]);
      expect(code).not.toMatch(/@codemirror|@lezer|\breact\b/i);
      expect(code).not.toMatch(/^\s*(import|export)\s/m);
    }
    expect(source).not.toMatch(/@codemirror|@lezer|require\('react/i);
  });

  withAllModules('the default controller compiles the avoid list once while only the text changes', () => {
    const termMatch = '../../src/editor/termMatch.js';
    let compileTerms;
    jest.isolateModules(() => {
      const real = jest.requireActual(termMatch);
      compileTerms = jest.fn(real.compileTerms);
      jest.doMock(termMatch, () => ({ ...real, compileTerms }));
      const { createDefaultReviewController: makeController } = require('../../src/services/review/reviewController');
      const controller = makeController();
      const bindTo = (project, liveText) => controller.bind({
        project,
        activeChapterId: 'c1',
        liveText,
        selection: null,
        getEditor: () => null,
        getProject: () => project,
        updateChapter: jest.fn(),
        updateProject: jest.fn(),
        propose: jest.fn(),
        askConfirm: jest.fn(),
        visible: true,
        aiOff: true,
        notify: jest.fn()
      });

      const project = makeProject();
      bindTo(project, CHAPTER_1);
      expect(controller.view().findings).toHaveLength(3);
      bindTo(project, `${CHAPTER_1} Hän vain istui.`);
      expect(controller.view().findings).toHaveLength(4);
      expect(compileTerms).toHaveBeenCalledTimes(1);

      // Another list is compiled again
      const other = { ...project, avoidWords: ['harmaa'] };
      bindTo(other, CHAPTER_1);
      expect(controller.view().findings.map(finding => finding.quote)).toEqual(['harmaa']);
      expect(compileTerms).toHaveBeenCalledTimes(2);
    });
    jest.dontMock(termMatch);
  });

  withAllModules('the default controller runs the local checks over the real modules', () => {
    const controller = createDefaultReviewController();
    const project = makeProject();
    const notify = jest.fn();
    controller.bind({
      project,
      activeChapterId: 'c1',
      liveText: CHAPTER_1,
      selection: null,
      getEditor: () => null,
      getProject: () => project,
      updateChapter: jest.fn(),
      updateProject: jest.fn(),
      propose: jest.fn(),
      askConfirm: jest.fn(),
      visible: true,
      aiOff: true,
      notify
    });

    const view = controller.view();
    expect(view.check.id).toBe('avoid-words');
    expect(view.findings.map(finding => [finding.quote, finding.note])).toEqual([
      ['jotenkin', 'Vältettävä sana: jotenkin'],
      ['vain', 'Vältettävä sana: vain'],
      ['vain', 'Vältettävä sana: vain']
    ]);
    expect(view.blocked).toBe(false);
    expect(controller.highlightProps().items).toHaveLength(3);

    controller.selectCheck(check('long-sentences'));
    expect(controller.view().findings).toEqual([]);
    controller.selectCheck(check('typography-questions'));
    expect(controller.view().localMessage).toBeNull();
  });
});
