/**
 * @jest-environment node
 */
const {
  PASTE_WARN_RATIO,
  PROTECTED_PATTERN,
  paragraphBreakStyle,
  normalizeClipboard,
  preparePasteEdits
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
