/**
 * @jest-environment node
 */
const {
  PASTE_WARN_RATIO,
  PROTECTED_PATTERN,
  paragraphBreakStyle,
  normalizeClipboard,
  preparePasteEdits,
  PASTE_TEXT,
  pasteDialogText
} = require('../../src/editor/pasteEdits');

const SAMPLE = 'Hän sanoi: ”Älä mene.” – Enkä mennyt, vaikka åkerö [TODO: tarkista] oli <u>kypsä</u>.';

// Stand-in for the word diff of another module: words and the gaps between them
function wordDiff(a, b) {
  const ta = a.match(/\s+|\S+/g) || [];
  const tb = b.match(/\s+|\S+/g) || [];
  const lcs = Array.from({ length: ta.length + 1 }, () => new Array(tb.length + 1).fill(0));
  for (let i = ta.length - 1; i >= 0; i--) {
    for (let j = tb.length - 1; j >= 0; j--) {
      lcs[i][j] = ta[i] === tb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const changes = [];
  let i = 0, j = 0, pos = 0, open = null;
  const edit = () => (open || (open = { from: pos, to: pos, insert: '' }));
  const close = () => { if (open) { changes.push({ ...open, original: a.slice(open.from, open.to) }); open = null; } };
  while (i < ta.length || j < tb.length) {
    if (i < ta.length && j < tb.length && ta[i] === tb[j]) {
      close();
      pos += ta[i].length; i++; j++;
    } else if (j < tb.length && (i === ta.length || lcs[i][j + 1] >= lcs[i + 1][j])) {
      edit().insert += tb[j]; j++;
    } else {
      edit().to += ta[i].length; pos += ta[i].length; i++;
    }
  }
  close();
  return changes;
}

const deps = (ratio = 0.1) => ({ wordDiff: jest.fn(wordDiff), changeRatio: jest.fn(() => ratio) });

function applyChanges(text, changes) {
  let out = '';
  let pos = 0;
  for (const change of changes) {
    out += text.slice(pos, change.from) + change.insert;
    pos = change.to;
  }
  return out + text.slice(pos);
}

describe('paragraphBreakStyle', () => {
  test('paragraphBreakStyle tells none, single, double and mixed apart', () => {
    expect(paragraphBreakStyle('')).toBe('none');
    expect(paragraphBreakStyle('Yksi kappale ilman rivinvaihtoa.')).toBe('none');
    expect(paragraphBreakStyle('\n\nYksi kappale.\n\n')).toBe('none');      // breaks around the text do not count
    expect(paragraphBreakStyle('Eka.\nToka.\nKolmas.')).toBe('single');
    expect(paragraphBreakStyle('Eka.\n\nToka.\n\nKolmas.')).toBe('double');
    expect(paragraphBreakStyle('Eka.\n \t\nToka.')).toBe('double');          // a blank line may hold spaces
    expect(paragraphBreakStyle('Eka.\nToka.\n\nKolmas.')).toBe('mixed');
    expect(paragraphBreakStyle('Eka.\n\n\nToka.')).toBe('mixed');            // two blank lines are neither
    expect(paragraphBreakStyle('Eka.\r\n\r\nToka.')).toBe('double');
    expect(paragraphBreakStyle(undefined)).toBe('none');
  });
});

describe('normalizeClipboard', () => {
  test('CRLF and CR in the clipboard become LF', () => {
    expect(normalizeClipboard('Eka.\nToka.', 'Eka.\r\nToka muutettu.')).toBe('Eka.\nToka muutettu.');
    expect(normalizeClipboard('Eka.\nToka.', 'Eka.\rToka muutettu.')).toBe('Eka.\nToka muutettu.');
    expect(normalizeClipboard('Eka.\n\nToka.', 'Eka.\r\n\r\nToka.')).toBe('Eka.\n\nToka.');
    expect(normalizeClipboard('Eka.', 'Eka.\r\n')).not.toMatch(/\r/);
  });

  test('a trailing line break copied from another program is dropped when the target has none', () => {
    expect(normalizeClipboard('Hän sanoi niin.', 'Hän kuiskasi niin.\n')).toBe('Hän kuiskasi niin.');
    expect(normalizeClipboard('Hän sanoi niin.', '\n  Hän kuiskasi niin.\r\n\r\n')).toBe('Hän kuiskasi niin.');
    // And the other way round: what the target has around it stays around the new text
    expect(normalizeClipboard(' Hän sanoi niin.\n', 'Hän kuiskasi niin.')).toBe(' Hän kuiskasi niin.\n');
    expect(normalizeClipboard('\n\nHän sanoi niin.\n\n', 'Hän kuiskasi niin.\n')).toBe('\n\nHän kuiskasi niin.\n\n');
    // An empty target (an empty chapter) takes the text as it is
    expect(normalizeClipboard('', 'Uusi teksti.\n')).toBe('Uusi teksti.');
  });

  test('single breaks become blank lines when the target uses blank lines, and the reverse', () => {
    const blank = 'Eka kappale.\n\nToka kappale.\n\nKolmas.';
    const tight = 'Eka kappale.\nToka kappale.\nKolmas.';
    expect(normalizeClipboard(blank, 'Eka kappale.\nToka kappale, muutettu.\nKolmas.')).toBe('Eka kappale.\n\nToka kappale, muutettu.\n\nKolmas.');
    expect(normalizeClipboard(tight, 'Eka kappale.\n\nToka kappale, muutettu.\n \nKolmas.')).toBe('Eka kappale.\nToka kappale, muutettu.\nKolmas.');
    // Already in the target's style: untouched
    expect(normalizeClipboard(blank, blank.replace('Toka', 'Toinen'))).toBe(blank.replace('Toka', 'Toinen'));
    // A single paragraph has no style to follow
    expect(normalizeClipboard('Yksi kappale.', 'Yksi.\n\nKaksi.')).toBe('Yksi.\n\nKaksi.');
  });

  test('a mixed style is left alone', () => {
    const blank = 'Eka.\n\nToka.\n\nKolmas.';
    const mixed = 'Eka.\nToka muutettu.\n\nKolmas.';
    expect(normalizeClipboard(blank, mixed)).toBe(mixed);
    expect(normalizeClipboard('Eka.\nToka.\n\nKolmas.', 'Eka.\n\nToka.\n\nKolmas.')).toBe('Eka.\n\nToka.\n\nKolmas.');
  });
});

describe('preparePasteEdits', () => {
  test('an empty or whitespace-only clipboard gives status empty', () => {
    for (const clipboard of ['', '  \n\t ', '\r\n', undefined, null]) {
      const d = deps();
      const result = preparePasteEdits(SAMPLE, clipboard, d);
      expect(result).toMatchObject({ status: 'empty', changes: [], protectedChanges: [], protectedCount: 0, ratio: 0, warn: false });
      expect(result.stats).toEqual({ targetWords: 13, clipboardWords: 0, changeCount: 0 });
      expect(d.wordDiff).not.toHaveBeenCalled();
    }
  });

  test('text equal to the target after normalising gives status identical and no changes', () => {
    const d = deps();
    const result = preparePasteEdits(SAMPLE, '\r\n' + SAMPLE + '\r\n', d);
    expect(result).toMatchObject({ status: 'identical', revised: SAMPLE, changes: [], ratio: 0, warn: false });
    expect(result.stats).toEqual({ targetWords: 13, clipboardWords: 13, changeCount: 0 });
    expect(d.wordDiff).not.toHaveBeenCalled();
    expect(d.changeRatio).not.toHaveBeenCalled();

    const paragraphs = 'Eka kappale.\n\nToka kappale.';
    expect(preparePasteEdits(paragraphs, 'Eka kappale.\r\nToka kappale.\r\n', deps()).status).toBe('identical');
  });

  test('status ok carries the changes of the injected wordDiff and the counts', () => {
    const d = deps(0.25);
    const clipboard = SAMPLE.replace('sanoi', 'kuiskasi').replace('mennyt,', 'lähtenyt,') + '\n';
    const result = preparePasteEdits(SAMPLE, clipboard, d);
    expect(d.wordDiff).toHaveBeenCalledTimes(1);
    expect(d.wordDiff).toHaveBeenCalledWith(SAMPLE, clipboard.trim());
    expect(d.changeRatio).toHaveBeenCalledWith(SAMPLE, clipboard.trim());

    expect(result.status).toBe('ok');
    expect(result.revised).toBe(clipboard.trim());
    expect(result.changes).toEqual([
      { from: 4, to: 10, insert: 'kuiskasi:', original: 'sanoi:' },
      { from: 30, to: 37, insert: 'lähtenyt,', original: 'mennyt,' }
    ]);
    expect(result.changes).toEqual(d.wordDiff.mock.results[0].value);
    expect(applyChanges(SAMPLE, result.changes)).toBe(result.revised);
    expect(result.stats).toEqual({ targetWords: 13, clipboardWords: 13, changeCount: 2 });
    expect(result.ratio).toBe(0.25);
    expect(result.protectedChanges).toEqual([]);
    expect(result.protectedCount).toBe(0);
  });

  test('warn is false at ratio 0.6 and true above it', () => {
    expect(PASTE_WARN_RATIO).toBe(0.6);
    const clipboard = SAMPLE.replace('sanoi', 'kuiskasi');
    expect(preparePasteEdits(SAMPLE, clipboard, deps(0.6))).toMatchObject({ status: 'ok', ratio: 0.6, warn: false });
    expect(preparePasteEdits(SAMPLE, clipboard, deps(0.61))).toMatchObject({ status: 'ok', ratio: 0.61, warn: true });
    expect(preparePasteEdits(SAMPLE, 'Aivan toinen teksti leikepöydällä.', deps(1)).warn).toBe(true);
    expect(preparePasteEdits(SAMPLE, clipboard, deps(0)).warn).toBe(false);
  });

  test('straight quotes against ” and a hyphen against – are passed to wordDiff unchanged', () => {
    const d = deps();
    const clipboard = 'Hän sanoi: "Älä mene." - Enkä mennyt, vaikka åkerö [TODO: tarkista] oli <u>kypsä</u>.';
    const result = preparePasteEdits(SAMPLE, clipboard, d);
    // Nothing was turned into Finnish typography on the way
    expect(d.wordDiff).toHaveBeenCalledWith(SAMPLE, clipboard);
    expect(result.revised).toBe(clipboard);
    expect(result.status).toBe('ok');
    // The differences are real and show up as suggestions
    expect(result.changes.map(change => [change.original, change.insert])).toEqual([
      ['”Älä', '"Älä'],
      ['mene.”', 'mene."'],
      ['–', '-']
    ]);
  });

  test('[TODO: tarkista] and <u>kypsä</u> in the target are passed to wordDiff unchanged', () => {
    const d = deps();
    const clipboard = SAMPLE.replace('sanoi', 'kuiskasi');
    const result = preparePasteEdits(SAMPLE, clipboard, d);
    const [target, revised] = d.wordDiff.mock.calls[0];
    expect(target).toBe(SAMPLE);
    expect(target).toContain('[TODO: tarkista]');
    expect(target).toContain('<u>kypsä</u>');
    expect(revised).toContain('[TODO: tarkista]');
    expect(revised).toContain('<u>kypsä</u>');
    expect(result.changes).toHaveLength(1);
    expect(result.protectedCount).toBe(0);
  });

  test('a clipboard without the target\'s [TODO: …] note does not propose deleting it', () => {
    const clipboard = 'Hän kuiskasi: ”Älä mene.” – Enkä mennyt, vaikka åkerö oli <u>kypsä</u>.';
    const result = preparePasteEdits(SAMPLE, clipboard, deps());
    expect(result.status).toBe('ok');
    expect(result.changes.map(change => change.original)).toEqual(['sanoi:']);
    expect(result.protectedChanges).toHaveLength(1);
    expect(result.protectedChanges[0].original).toContain('[TODO: tarkista]');
    expect(result.protectedCount).toBe(1);
    expect(result.stats.changeCount).toBe(1);
    // Accepting everything that is proposed leaves the note in the manuscript
    expect(applyChanges(SAMPLE, result.changes)).toContain('[TODO: tarkista]');
    expect(result.changes.some(change => /\[TODO:/.test(change.original))).toBe(false);
  });

  test('a clipboard without the <u> tags does not propose deleting them', () => {
    const clipboard = 'Hän sanoi: ”Älä mene.” – Enkä lähtenyt, vaikka åkerö [TODO: tarkista] oli kypsä.';
    const result = preparePasteEdits(SAMPLE, clipboard, deps());
    expect(result.status).toBe('ok');
    expect(result.changes.map(change => [change.original, change.insert])).toEqual([['mennyt,', 'lähtenyt,']]);
    expect(result.protectedCount).toBe(1);
    expect(result.protectedChanges[0]).toMatchObject({ original: '<u>kypsä</u>.', insert: 'kypsä.' });
    expect(applyChanges(SAMPLE, result.changes)).toContain('<u>kypsä</u>');

    // Half a pair counts as well
    const half = preparePasteEdits('Sana <u>toinen</u> kolmas.', 'Sana <u>toinen kolmas.', deps());
    expect(half.changes).toEqual([]);
    expect(half.protectedCount).toBe(1);
  });

  test('a note that the clipboard keeps is not protected away', () => {
    // The word next to the note changed and the diff reports them together
    const joined = { wordDiff: () => [{ from: 45, to: 71, insert: 'Åkerö [TODO: tarkista] on', original: 'åkerö [TODO: tarkista] oli' }], changeRatio: () => 0.1 };
    const clipboard = SAMPLE.replace('åkerö', 'Åkerö').replace('oli', 'on');
    const result = preparePasteEdits(SAMPLE, clipboard, joined);
    expect(result.status).toBe('ok');
    expect(result.changes).toHaveLength(1);
    expect(result.protectedCount).toBe(0);

    // The same for the underline: the tags stay, the word inside them changes
    const underline = preparePasteEdits(SAMPLE, SAMPLE.replace('kypsä', 'raaka'), deps());
    expect(underline.changes.map(change => [change.original, change.insert])).toEqual([['<u>kypsä</u>.', '<u>raaka</u>.']]);
    expect(underline.protectedCount).toBe(0);

    // A note whose own text changed: the note that was there would be gone. The stand-in
    // diff cuts the note into words, and the change is still judged by the whole note.
    const rewritten = preparePasteEdits(SAMPLE, SAMPLE.replace('[TODO: tarkista]', '[TODO: tehty]'), deps());
    expect(rewritten.protectedChanges).toEqual([{ from: 58, to: 67, insert: 'tehty]', original: 'tarkista]' }]);
    expect(rewritten.status).toBe('protected-only');
    // A tag cut in half by the diff is a deleted tag as well
    const cut = { wordDiff: () => [{ from: 5, to: 7, insert: '' }], changeRatio: () => 0.1 };
    expect(preparePasteEdits('Sana <u>toinen</u>.', 'Sana >toinen</u>.', cut).protectedCount).toBe(1);

    // The same note twice: each one counts
    const two = '[TODO: a] [TODO: a] loppu';
    const report = (changes) => ({ wordDiff: () => changes, changeRatio: () => 0.1 });
    expect(preparePasteEdits(two, '[TODO: a] loppu', report([{ from: 9, to: 19, insert: '', original: ' [TODO: a]' }])).protectedCount).toBe(1);
    expect(preparePasteEdits(two, '[TODO: a] loppu', report([{ from: 0, to: 19, insert: '[TODO: a]', original: '[TODO: a] [TODO: a]' }])).protectedCount).toBe(1);
    expect(preparePasteEdits(two, '[TODO: a]  [TODO: a] loppu', report([{ from: 0, to: 19, insert: '[TODO: a]  [TODO: a]', original: '[TODO: a] [TODO: a]' }])).protectedCount).toBe(0);
  });

  test('when every change is protected the status is protected-only', () => {
    const clipboard = 'Hän sanoi: ”Älä mene.” – Enkä mennyt, vaikka åkerö oli kypsä.';
    const d = deps(0.9);
    const result = preparePasteEdits(SAMPLE, clipboard, d);
    expect(result.status).toBe('protected-only');
    expect(result.changes).toEqual([]);
    expect(result.protectedCount).toBe(2);
    expect(result.protectedChanges).toHaveLength(2);
    expect(result.stats.changeCount).toBe(0);
    // Nothing to propose: no ratio, no warning
    expect(result.ratio).toBe(0);
    expect(result.warn).toBe(false);
    expect(d.changeRatio).not.toHaveBeenCalled();
  });

  test('a change without original is checked against the target text', () => {
    const bare = { wordDiff: () => [{ from: 51, to: 68, insert: '' }], changeRatio: () => 0.1 };
    const result = preparePasteEdits(SAMPLE, SAMPLE.replace('[TODO: tarkista] ', ''), bare);
    expect(result.status).toBe('protected-only');
    expect(result.protectedCount).toBe(1);
  });

  test('a change that reaches into the part of a note the target edge cut is protected', () => {
    // The selection ended inside the note: "[TODO: tarkista" alone does not look like a note
    const target = 'Omena oli kypsä [TODO: tarkista';
    const cut = [{ from: target.indexOf('['), to: target.length }];
    const unguarded = preparePasteEdits(target, 'Omena oli raaka', deps());
    expect(unguarded.protectedCount).toBe(0);

    const guarded = preparePasteEdits(target, 'Omena oli raaka', deps(), cut);
    expect(guarded.status).toBe('protected-only');
    expect(guarded.protectedCount).toBe(1);
    // A change that stays outside the cut part is proposed as before
    const outside = preparePasteEdits(target, 'Omena on kypsä [TODO: tarkista', deps(), cut);
    expect(outside).toMatchObject({ status: 'ok', protectedCount: 0 });
    expect(outside.changes.map(change => target.slice(change.from, change.to))).toEqual(['oli']);
  });

  test('with CRLF in the target the changes are offsets into the target itself', () => {
    const target = 'Eka rivi.\r\nToka rivi.\r\nHän sanoi jotain.';
    const result = preparePasteEdits(target, 'Eka rivi.\nToka rivi.\nHän kuiskasi jotain.', deps());
    expect(result.status).toBe('ok');
    expect(result.changes).toHaveLength(1);
    const [change] = result.changes;
    expect(target.slice(change.from, change.to)).toBe('sanoi');
    expect(change).toMatchObject({ insert: 'kuiskasi', original: 'sanoi' });
  });

  test('the protected pattern matches notes and underline tags only', () => {
    const found = (text) => text.match(PROTECTED_PATTERN) || [];
    expect(found('a [TODO: tarkista "lainaus"] b <u>sana</u> [muu: x]')).toEqual(['[TODO: tarkista "lainaus"]', '<u>', '</u>']);
    expect(found('[TODO: auki')).toEqual([]);
    expect(found('[TODO: a\nb]')).toEqual([]);
    expect(PROTECTED_PATTERN.global).toBe(true);
  });
});

// Stage I-04, scenario X-27: the merged diff of the app joins a changed word with a lost tag nearby
describe('a merged change that would delete a note or a tag is taken apart', () => {
  const real = require('../../src/editor/wordDiff');
  const realDeps = () => ({ wordDiff: (a, b, o) => real.wordDiff(a, b, o), changeRatio: real.changeRatio });
  const TARGET = 'Isä osti talon keväällä 1972 [TODO: tarkista vuosi] ja korjasi sen katon omin <u>käsin</u> ennen talvea.';
  const CLIPBOARD = 'Isä osti talon syksyllä 1972 ja korjasi sen katon omin käsin ennen joulua.\n';

  test('a word changed one word away from a lost underline is still proposed, and the underline counts once (X-27)', () => {
    // The app's merged diff joins <u>, </u> and talvea → joulua into one change
    expect(real.wordDiff(TARGET, CLIPBOARD.trim()).map(change => change.original)).toContain('<u>käsin</u> ennen talvea');

    const result = preparePasteEdits(TARGET, CLIPBOARD, realDeps());
    expect(result.status).toBe('ok');
    expect(result.changes.map(change => [change.original, change.insert])).toEqual([['keväällä', 'syksyllä'], ['talvea', 'joulua']]);
    expect(result.stats.changeCount).toBe(2);
    expect(result.protectedCount).toBe(2);
    expect(result.protectedChanges.map(change => [change.original, change.insert])).toEqual([['[TODO: tarkista vuosi] ', ''], ['<u>käsin</u>', 'käsin']]);
    // Accepting everything that is proposed changes the two words and keeps the note and the underline
    expect(applyChanges(TARGET, result.changes)).toBe('Isä osti talon syksyllä 1972 [TODO: tarkista vuosi] ja korjasi sen katon omin <u>käsin</u> ennen joulua.');
  });

  test('the finest diff comes from deps.rawDiff when it is given', () => {
    const rawDiff = jest.fn((a, b) => real.wordDiff(a, b, { raw: true }));
    const result = preparePasteEdits(TARGET, CLIPBOARD, { wordDiff: (a, b) => real.wordDiff(a, b), changeRatio: real.changeRatio, rawDiff });
    // It compares the change's text without the lost tags with the clipboard's text
    expect(rawDiff).toHaveBeenCalledWith('käsin ennen talvea', 'käsin ennen joulua');
    expect(result.stats.changeCount).toBe(2);
  });

  test('a word right after a lost note, and a word inside a lost underline, go alone; note and tags stay', () => {
    // The finest diff of the whole change pairs the note with "on"; without the note it pairs oli → on
    const after = preparePasteEdits(SAMPLE, 'Hän kuiskasi: ”Älä mene.” – Enkä mennyt, vaikka åkerö on kypsä.', realDeps());
    expect(after.changes.map(change => [change.original, change.insert])).toEqual([['sanoi', 'kuiskasi'], ['oli', 'on']]);
    expect(after.protectedChanges.map(change => change.original)).toEqual(['[TODO: tarkista] ', '<u>kypsä</u>']);
    expect(after.protectedCount).toBe(2);
    expect(applyChanges(SAMPLE, after.changes)).toBe('Hän kuiskasi: ”Älä mene.” – Enkä mennyt, vaikka åkerö [TODO: tarkista] on <u>kypsä</u>.');

    const inside = preparePasteEdits(SAMPLE, SAMPLE.replace('<u>kypsä</u>', 'raaka'), realDeps());
    expect(inside.changes.map(change => [change.original, change.insert])).toEqual([['kypsä', 'raaka']]);
    expect(inside.protectedCount).toBe(1);
    expect(applyChanges(SAMPLE, inside.changes)).toContain('<u>raaka</u>.');
  });

  test('a lost note takes the whitespace of its place with it: no line break or space is proposed for deletion', () => {
    const after = (target, clipboard) => {
      const result = preparePasteEdits(target, clipboard, realDeps());
      return [result.status, result.changes.map(change => [change.original, change.insert]), applyChanges(target, result.changes)];
    };
    // A note on a line of its own: its blank line goes with it, so nothing joins two paragraphs
    expect(after('[TODO: x]\n\n> Kotiin palaaminen.', '> Kotiin palaaminen.')).toEqual(['protected-only', [], '[TODO: x]\n\n> Kotiin palaaminen.']);
    expect(after('Teksti.\n\n[TODO: x]\n\nLisää tekstiä.', 'Teksti.\n\nLisää sanoja.'))
      .toEqual(['ok', [['tekstiä', 'sanoja']], 'Teksti.\n\n[TODO: x]\n\nLisää sanoja.']);
    // A note at the end of a line: the space before it goes, the paragraph break stays
    expect(after('Sana [TODO: x]\n\nSeuraava kappale.', 'Uusi\n\nSeuraava kappale.'))
      .toEqual(['ok', [['Sana', 'Uusi']], 'Uusi [TODO: x]\n\nSeuraava kappale.']);
    // Inside a line, and before a full stop
    expect(after('alku a [TODO: x] b c', 'alku a b d')).toEqual(['ok', [['c', 'd']], 'alku a [TODO: x] b d']);
    expect(after('Sana [TODO: x].', 'Sana.')).toEqual(['protected-only', [], 'Sana [TODO: x].']);
  });

  test('a change that only loses notes or tags, or whose clipboard still holds a copy of one, stays whole', () => {
    expect(preparePasteEdits(SAMPLE, SAMPLE.replace(' [TODO: tarkista]', ''), realDeps())).toMatchObject({ status: 'protected-only', protectedCount: 1, changes: [] });
    expect(preparePasteEdits(SAMPLE, SAMPLE.replace('<u>kypsä</u>', 'kypsä'), realDeps())).toMatchObject({ status: 'protected-only', protectedCount: 1, changes: [] });
    // Two copies of one note in one change and one left: which one went cannot be told, so nothing in it is proposed
    const two = 'Alku [TODO: a] keski [TODO: a] loppu.';
    const merged = { from: 5, to: 30, insert: 'keskellä [TODO: a]', original: '[TODO: a] keski [TODO: a]' };
    expect(two.slice(merged.from, merged.to)).toBe(merged.original);
    const rawDiff = jest.fn((a, b) => require('../../src/editor/wordDiff').wordDiff(a, b, { raw: true }));
    const result = preparePasteEdits(two, 'Alku keskellä [TODO: a] loppu.', { wordDiff: () => [merged], changeRatio: () => 0.1, rawDiff });
    expect(result.changes).toEqual([]);
    expect(result.protectedChanges).toEqual([merged]);
    expect(rawDiff).not.toHaveBeenCalled();
  });

  test('pieces that do not rebuild the change leave it whole', () => {
    // A finest diff that answers something else (here: a fixed list) is not trusted
    const merged = [{ from: 78, to: 103, insert: 'käsin ennen joulua', original: '<u>käsin</u> ennen talvea' }];
    const odd = { wordDiff: () => merged, changeRatio: () => 0.1, rawDiff: () => [{ from: 0, to: 3, insert: '' }, { from: 19, to: 25, insert: 'x' }] };
    const result = preparePasteEdits(TARGET, TARGET.slice(0, 78) + 'käsin ennen joulua.', odd);
    expect(result.changes).toEqual([]);
    expect(result.protectedChanges).toEqual(merged);
    const throwing = { ...odd, rawDiff: () => { throw new Error('ei'); } };
    expect(preparePasteEdits(TARGET, TARGET.slice(0, 78) + 'käsin ennen joulua.', throwing).protectedChanges).toEqual(merged);
  });
});

// Stage I-04: what PasteEditsDialog.js says about a request of the controller
describe('the words of the Liitä muokkauksina dialog', () => {
  const NBSP = '\u00a0';
  const request = (fields) => ({
    status: 'ok', scope: 'selection', ratio: 0.1, warn: false, protectedCount: 0, source: 'editor',
    ...fields,
    stats: { targetWords: 120, clipboardWords: 118, changeCount: 5, ...(fields && fields.stats) }
  });
  const line = (row) => row && `${row.key} ${row.value}`;

  test('a selection: the target line, the clipboard line and the result line; it can paste', () => {
    const text = pasteDialogText(request());
    expect(line(text.target)).toBe('Verrataan: valinta, 120 sanaa');
    expect(line(text.clipboard)).toBe('Leikepöydällä: 118 sanaa');
    expect(text.result).toBe('5 muutosta');
    expect(text).toMatchObject({ protectedLine: null, warning: null, notice: null, canPaste: true });
  });

  test('nothing selected: the target line names the whole chapter', () => {
    expect(line(pasteDialogText(request({ scope: 'chapter', stats: { targetWords: 326 } })).target))
      .toBe('Verrataan: koko luku, 326 sanaa (mitään ei ollut valittuna)');
  });

  test('one word and one change are singular, and thousands are grouped with a no-break space', () => {
    const one = pasteDialogText(request({ stats: { targetWords: 1, clipboardWords: 1, changeCount: 1 } }));
    expect(line(one.target)).toBe('Verrataan: valinta, 1 sana');
    expect(line(one.clipboard)).toBe('Leikepöydällä: 1 sana');
    expect(one.result).toBe('1 muutos');
    const many = pasteDialogText(request({ scope: 'chapter', stats: { targetWords: 12345, clipboardWords: 12001, changeCount: 1500 } }));
    expect(line(many.target)).toBe(`Verrataan: koko luku, 12${NBSP}345 sanaa (mitään ei ollut valittuna)`);
    expect(line(many.clipboard)).toBe(`Leikepöydällä: 12${NBSP}001 sanaa`);
    expect(many.result).toBe(`1${NBSP}500 muutosta`);
  });

  test('changes that would delete a note or an underline are named under the result, singular and plural', () => {
    expect(pasteDialogText(request({ protectedCount: 1 })).protectedLine)
      .toBe('1 muutos poistaisi muistutuksen tai alleviivauksen. Se jätetään pois.');
    expect(pasteDialogText(request({ protectedCount: 2 })).protectedLine)
      .toBe('2 muutosta poistaisi muistutuksen tai alleviivauksen. Ne jätetään pois.');
  });

  test('protected-only: the line, no changes to paste, and no paste button', () => {
    const text = pasteDialogText(request({ status: 'protected-only', protectedCount: 2, stats: { changeCount: 0 } }));
    expect(text.protectedLine).toBe('2 muutosta poistaisi muistutuksen tai alleviivauksen. Ne jätetään pois.');
    expect(text.result).toBe('0 muutosta');
    expect(text.canPaste).toBe(false);
    expect(text.warning).toBeNull();
  });

  test('the warning carries the rounded percentage, and only when the request warns', () => {
    expect(pasteDialogText(request({ ratio: 0.834, warn: true })).warning)
      .toBe('Leikepöydän teksti poikkeaa verrattavasta tekstistä paljon: noin 83 % sanoista muuttuisi. Tarkista, että leikepöydällä on oikea teksti.');
    expect(pasteDialogText(request({ ratio: 0.6, warn: false })).warning).toBeNull();
  });

  test('identical, empty and no editor: the state as a notice, and nothing to paste', () => {
    const identical = pasteDialogText(request({ status: 'identical', stats: { changeCount: 0 } }));
    expect(identical).toMatchObject({ notice: 'Leikepöydän teksti on sama kuin verrattava teksti. Muutoksia ei ole.', result: null, canPaste: false });
    expect(line(identical.target)).toBe('Verrataan: valinta, 120 sanaa');
    expect(pasteDialogText(request({ status: 'empty' }))).toMatchObject({ notice: 'Leikepöydällä ei ole tekstiä.', target: null, clipboard: null, canPaste: false });
    expect(pasteDialogText({ status: 'no-editor', scope: 'chapter', stats: { targetWords: 0, clipboardWords: 0, changeCount: 0 } }))
      .toMatchObject({ notice: 'Liitä muokkauksina toimii, kun jokin luku on auki.', target: null, canPaste: false });
    expect(pasteDialogText(null)).toMatchObject({ notice: 'Liitä muokkauksina toimii, kun jokin luku on auki.', canPaste: false });
  });

  test('the fixed words: title, choice and buttons', () => {
    expect(PASTE_TEXT).toMatchObject({ title: 'Liitä muokkauksina', sourceLabel: 'Kuka muokkasi tekstin?', cancel: 'Peruuta', confirm: 'Liitä muokkauksina', close: 'Sulje' });
    expect(PASTE_TEXT.sources).toEqual([
      { id: 'editor', label: 'Kustannustoimittaja', hint: 'ihmisen tekemät korjaukset' },
      { id: 'external-ai', label: 'Tekoäly muualla', hint: 'esimerkiksi Cherry Studion keskustelu' }
    ]);
  });
});
