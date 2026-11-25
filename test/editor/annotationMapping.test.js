/**
 * @jest-environment node
 */
// Margin marks follow the text (F1).
//
// A mark stores `position` and `length`, offsets into its chapter's text, and until this fix nothing moved them
// when the text changed: typing above a mark left its marker on the wrong line until the next check. The rule and
// the two ways a change is known (a precise change list, or the text before and after) are in
// src/editor/annotationMapping.js; followEdits is what the app's project setter runs on every update.
const M = require('../../src/editor/annotationMapping');

const TEXT = 'Aino astui laiturille. Asemalla ei ollut ketään. Hän nosti laukkunsa ja lähti kävelemään kohti kylää.';

const mark = (text, words, extra = {}) => {
  const position = text.indexOf(words);
  if (position === -1) throw new Error('not in the text: ' + words);
  return {
    id: extra.id || 'ann_' + words.replace(/\s+/g, '_'), type: 'user_note', position, length: words.length,
    content: 'Huomautus', priority: 'info', source: 'user', resolved: false, ...extra
  };
};
const point = (position, extra = {}) => ({ id: 'ann_point', type: 'user_note', position, length: 0, content: 'Kohta', ...extra });

// The text a list of changes gives
function apply(text, changes) {
  let out = '';
  let pos = 0;
  for (const change of changes) {
    out += text.slice(pos, change.from) + change.insert;
    pos = change.to;
  }
  return out + text.slice(pos);
}
const typed = (text, at, insert) => [{ from: typeof at === 'string' ? text.indexOf(at) : at, to: typeof at === 'string' ? text.indexOf(at) : at, insert }];
const deleted = (text, words) => [{ from: text.indexOf(words), to: text.indexOf(words) + words.length, insert: '' }];
const replaced = (text, words, insert) => [{ from: text.indexOf(words), to: text.indexOf(words) + words.length, insert }];
// What the mark covers in a text
const under = (text, m) => text.slice(m.position, m.position + m.length);

describe('a precise change list (CodeMirror\'s ChangeSet)', () => {
  test('text put in before a mark shifts it, and the mark stays on its words', () => {
    const marks = [mark(TEXT, 'laukkunsa')];
    const changes = typed(TEXT, 'Asemalla', 'Oli jo ilta. ');
    const [moved] = M.mapAnnotations(marks, changes);
    expect(moved.position).toBe(marks[0].position + 'Oli jo ilta. '.length);
    expect(moved.length).toBe('laukkunsa'.length);
    expect(under(apply(TEXT, changes), moved)).toBe('laukkunsa');
  });

  test('text typed exactly at the start of a mark goes before it', () => {
    const marks = [mark(TEXT, 'laukkunsa')];
    const changes = typed(TEXT, marks[0].position, 'raskaan ');
    const [moved] = M.mapAnnotations(marks, changes);
    expect(under(apply(TEXT, changes), moved)).toBe('laukkunsa');
    expect(moved.position).toBe(marks[0].position + 8);
  });

  test('text typed exactly at the end of a mark is not part of it', () => {
    const marks = [mark(TEXT, 'laukkunsa')];
    const changes = typed(TEXT, marks[0].position + marks[0].length, ' maasta');
    const moved = M.mapAnnotations(marks, changes);
    expect(moved).toBe(marks);                       // nothing moved: the same array
    expect(under(apply(TEXT, changes), moved[0])).toBe('laukkunsa');
  });

  test('text typed inside a mark is part of it', () => {
    const marks = [mark(TEXT, 'nosti laukkunsa')];
    const changes = typed(TEXT, 'laukkunsa', 'vanhan ');
    const [moved] = M.mapAnnotations(marks, changes);
    expect(moved.position).toBe(marks[0].position);
    expect(under(apply(TEXT, changes), moved)).toBe('nosti vanhan laukkunsa');
  });

  test('a point mark moves with the text that follows it', () => {
    const at = TEXT.indexOf('Hän');
    const marks = [point(at)];
    expect(M.mapAnnotations(marks, typed(TEXT, at, 'Sitten '))[0]).toMatchObject({ position: at + 7, length: 0 });
    expect(M.mapAnnotations(marks, typed(TEXT, 'Asemalla', 'Hiljaista. '))[0]).toMatchObject({ position: at + 11, length: 0 });
    expect(M.mapAnnotations(marks, typed(TEXT, 'nosti', 'hitaasti '))).toBe(marks);
  });

  test('a deletion before a mark shifts it back; inside it shortens it; over an end cuts that end', () => {
    const marks = [mark(TEXT, 'nosti laukkunsa')];
    const before = deleted(TEXT, 'Asemalla ei ollut ketään. ');
    expect(M.mapAnnotations(marks, before)[0]).toMatchObject({ position: marks[0].position - 26, length: 15 });

    const inside = deleted(TEXT, 'nosti ');           // the head of the mark
    expect(under(apply(TEXT, inside), M.mapAnnotations(marks, inside)[0])).toBe('laukkunsa');

    const overStart = deleted(TEXT, 'Hän nosti ');
    const a = M.mapAnnotations(marks, overStart)[0];
    expect(under(apply(TEXT, overStart), a)).toBe('laukkunsa');
    expect(a.position).toBe(TEXT.indexOf('Hän'));

    const overEnd = deleted(TEXT, 'laukkunsa ja ');
    const b = M.mapAnnotations(marks, overEnd)[0];
    expect(under(apply(TEXT, overEnd), b)).toBe('nosti ');
    expect(b.position).toBe(marks[0].position);
  });

  test('a mark whose text is deleted stays as a point at the place of the deletion', () => {
    const marks = [mark(TEXT, 'laukkunsa')];
    const exact = M.mapAnnotations(marks, deleted(TEXT, 'laukkunsa'));
    expect(exact).toHaveLength(1);
    expect(exact[0]).toMatchObject({ id: marks[0].id, position: marks[0].position, length: 0, content: 'Huomautus' });

    // A larger deletion: the point stands where the deleted passage began
    const sentence = M.mapAnnotations(marks, deleted(TEXT, 'Hän nosti laukkunsa ja lähti kävelemään kohti kylää.'));
    expect(sentence[0]).toMatchObject({ position: TEXT.indexOf('Hän'), length: 0 });

    // The passage around the mark replaced by one change: a point after the new text, with the text that follows it
    const rewrite = replaced(TEXT, 'Hän nosti laukkunsa ja lähti', 'Hän lähti');
    const moved = M.mapAnnotations(marks, rewrite)[0];
    expect(moved).toMatchObject({ position: TEXT.indexOf('Hän') + 'Hän lähti'.length, length: 0 });
    expect(apply(TEXT, rewrite).slice(moved.position)).toBe(' kävelemään kohti kylää.');
  });

  test('text that replaces the exact range of a mark takes its place under the mark', () => {
    const marks = [mark(TEXT, 'laukkunsa')];
    const changes = replaced(TEXT, 'laukkunsa', 'reppunsa');
    const [moved] = M.mapAnnotations(marks, changes);
    expect(moved.position).toBe(marks[0].position);
    expect(under(apply(TEXT, changes), moved)).toBe('reppunsa');
  });

  test('several changes at once (Hyväksy kaikki): every mark stays on its own words', () => {
    const marks = [mark(TEXT, 'laiturille'), mark(TEXT, 'ketään'), mark(TEXT, 'kylää')];
    const changes = [
      ...replaced(TEXT, 'Aino', 'Aino Lehto'),
      ...replaced(TEXT, 'Asemalla', 'Pienellä asemalla'),
      ...deleted(TEXT, 'ja lähti '),
      ...typed(TEXT, TEXT.length, ' Ilta pimeni.')
    ];
    const after = apply(TEXT, changes);
    const moved = M.mapAnnotations(marks, changes);
    expect(moved.map(m => under(after, m))).toEqual(['laiturille', 'ketään', 'kylää']);
    expect(moved.map(m => m.id)).toEqual(marks.map(m => m.id));
  });

  test('marks that do not move are the same objects, and nothing given is changed', () => {
    const marks = [mark(TEXT, 'Aino'), mark(TEXT, 'laukkunsa')];
    const frozen = JSON.stringify(marks);
    const moved = M.mapAnnotations(marks, typed(TEXT, 'Asemalla', 'Hiljaista. '));
    expect(moved).not.toBe(marks);
    expect(moved[0]).toBe(marks[0]);                 // stands before the change
    expect(moved[1]).not.toBe(marks[1]);
    expect(moved[1]).toMatchObject({ content: 'Huomautus', priority: 'info', resolved: false, type: 'user_note' });
    expect(JSON.stringify(marks)).toBe(frozen);
  });

  test('a mark without a usable place is left as it is; no list or no change gives the list back', () => {
    const odd = [{ id: 'a', content: 'ei paikkaa' }, { id: 'b', position: 'x', length: 2 }, null];
    expect(M.mapAnnotations(odd, typed(TEXT, 0, 'Luku. '))).toBe(odd);
    expect(M.mapAnnotations(undefined, typed(TEXT, 0, 'x'))).toBeUndefined();
    const marks = [mark(TEXT, 'Aino')];
    expect(M.mapAnnotations(marks, [])).toBe(marks);
    expect(M.mapAnnotations(marks, null)).toBe(marks);
    // A stored length that is no number counts as a point
    expect(M.mapAnnotations([{ id: 'c', position: 5 }], typed(TEXT, 0, 'abc'))[0]).toEqual({ id: 'c', position: 8, length: 0 });
  });
});

describe('changesFit: a change list is used only for the text it was made for', () => {
  test('the list of this text fits', () => {
    const changes = [...replaced(TEXT, 'Aino', 'Aino Lehto'), ...deleted(TEXT, 'ja lähti ')];
    expect(M.changesFit(changes, TEXT.length, apply(TEXT, changes).length)).toBe(true);
  });

  test('another length, a range outside the text, an unsorted list, a broken entry or no list do not', () => {
    const changes = typed(TEXT, 5, 'abc');
    expect(M.changesFit(changes, TEXT.length, TEXT.length + 2)).toBe(false);
    expect(M.changesFit([{ from: 0, to: TEXT.length + 1, insert: '' }], TEXT.length, 0)).toBe(false);
    expect(M.changesFit([{ from: 10, to: 12, insert: '' }, { from: 3, to: 4, insert: '' }], TEXT.length, TEXT.length - 3)).toBe(false);
    expect(M.changesFit([{ from: 3, to: 4 }], TEXT.length, TEXT.length - 1)).toBe(false);
    expect(M.changesFit([], TEXT.length, TEXT.length)).toBe(false);
    expect(M.changesFit(null, TEXT.length, TEXT.length)).toBe(false);
  });
});

describe('the text before and after (the fallback)', () => {
  test('one change above a mark moves it as the precise list does', () => {
    const marks = [mark(TEXT, 'laukkunsa')];
    const changes = typed(TEXT, 'Asemalla', 'Oli jo ilta. ');
    const after = apply(TEXT, changes);
    expect(M.mapAnnotationsBetween(marks, TEXT, after)).toEqual(M.mapAnnotations(marks, changes));
  });

  test('a deleted mark stays as a point; equal texts give the same list', () => {
    const marks = [mark(TEXT, 'laukkunsa')];
    const after = apply(TEXT, deleted(TEXT, 'Hän nosti laukkunsa ja lähti kävelemään kohti kylää.'));
    expect(M.mapAnnotationsBetween(marks, TEXT, after)[0]).toMatchObject({ position: TEXT.indexOf('Hän'), length: 0 });
    expect(M.mapAnnotationsBetween(marks, TEXT, TEXT)).toBe(marks);
    expect(M.mapAnnotationsBetween(marks, TEXT, TEXT.slice())).toBe(marks);
  });

  test('a mark inside a passage that got markers at both ends stays on its words (Lihavoi)', () => {
    const marks = [mark(TEXT, 'ketään')];
    const after = TEXT.replace('Asemalla ei ollut ketään.', '**Asemalla ei ollut ketään.**');
    const [moved] = M.mapAnnotationsBetween(marks, TEXT, after);
    expect(under(after, moved)).toBe('ketään');
  });

  test('a mark between two replaced words stays on its words (a replace without its list)', () => {
    const text = 'Liisa katsoi merta. Majakka vilkkui. Liisa sulki oven.';
    const marks = [mark(text, 'Majakka vilkkui'), mark(text, 'oven')];
    const after = text.replace(/Liisa/g, 'Annaliisa');
    const moved = M.mapAnnotationsBetween(marks, text, after);
    expect(moved.map(m => under(after, m))).toEqual(['Majakka vilkkui', 'oven']);
  });

  test('line starts changed on several lines (Otsikko, Luettelo): the marks stay on their lines', () => {
    const text = 'Ensimmäinen kohta\nToinen kohta\nKolmas kohta';
    const marks = [mark(text, 'Toinen'), mark(text, 'Kolmas kohta')];
    const after = text.split('\n').map(line => '- ' + line).join('\n');
    const moved = M.mapAnnotationsBetween(marks, text, after);
    expect(moved.map(m => under(after, m))).toEqual(['Toinen', 'Kolmas kohta']);
  });

  test('a text written anew keeps every mark, inside the new text', () => {
    const marks = [mark(TEXT, 'Aino'), mark(TEXT, 'ketään'), mark(TEXT, 'kylää')];
    const after = 'Juna pysähtyi. Kukaan ei ollut vastassa, ja ilta oli jo pimeä.';
    const moved = M.mapAnnotationsBetween(marks, TEXT, after);
    expect(moved).toHaveLength(3);
    for (const m of moved) {
      expect(m.position).toBeGreaterThanOrEqual(0);
      expect(m.position + m.length).toBeLessThanOrEqual(after.length);
    }
    expect(moved.map(m => m.id)).toEqual(marks.map(m => m.id));
  });
});

describe('followEdits: the project after an update', () => {
  const chapter = (id, content, annotations) => ({ id, title: id, content, wordCount: 1, annotations });
  const projectOf = (...structure) => ({ title: 'Talo mäellä', structure, bookmarks: [] });
  const write = (project, id, content) => ({
    ...project,
    structure: project.structure.map(ch => (ch.id === id ? { ...ch, content } : ch))
  });

  test('an update that changed a chapter\'s text and left its marks moves them; the rest is untouched', () => {
    const marks = [mark(TEXT, 'laukkunsa')];
    const prev = projectOf(chapter('a', TEXT, marks), chapter('b', 'Toinen luku.', [point(3)]));
    const next = write(prev, 'a', 'Oli jo ilta. ' + TEXT);
    const frozen = JSON.stringify(next);

    const out = M.followEdits(prev, next);
    expect(out).not.toBe(next);
    expect(JSON.stringify(next)).toBe(frozen);                    // the update's own object is not changed
    expect(out.structure[0].content).toBe('Oli jo ilta. ' + TEXT);
    expect(under(out.structure[0].content, out.structure[0].annotations[0])).toBe('laukkunsa');
    expect(out.structure[1]).toBe(prev.structure[1]);
    expect(out.title).toBe('Talo mäellä');
    expect(marks[0].position).toBe(TEXT.indexOf('laukkunsa'));    // the state before is not changed either
  });

  test('the writer\'s precise change list is used when it fits the two texts', () => {
    // "ei " typed in front of the first of three: the text alone cannot tell which "ei" is new
    const text = 'Voi ei ei ei, Aino sanoi.';
    const marks = [{ id: 'm', position: 7, length: 2, content: 'toinen ei' }];
    const prev = projectOf(chapter('a', text, marks));
    const changes = [{ from: 4, to: 4, insert: 'ei ' }];
    const next = write(prev, 'a', apply(text, changes));

    expect(M.followEdits(prev, next, { chapterId: 'a', changes }).structure[0].annotations[0].position).toBe(10);
    // Without the list the common start reaches past the mark: the mark keeps its offset
    expect(M.followEdits(prev, next).structure[0].annotations).toBe(marks);
    // The list of another chapter is not this chapter's
    expect(M.followEdits(prev, next, { chapterId: 'b', changes }).structure[0].annotations).toBe(marks);
  });

  test('a change list that was made for another text is not used: the two texts decide', () => {
    const marks = [mark(TEXT, 'laukkunsa')];
    const prev = projectOf(chapter('a', TEXT, marks));
    const next = write(prev, 'a', 'Oli jo ilta. ' + TEXT);
    const stale = [{ from: 0, to: 0, insert: 'x' }];              // one character, not thirteen
    const out = M.followEdits(prev, next, { chapterId: 'a', changes: stale });
    expect(under(out.structure[0].content, out.structure[0].annotations[0])).toBe('laukkunsa');
  });

  test('marks the update set itself are kept as they are (a tilannekuva, a new or removed mark)', () => {
    const marks = [mark(TEXT, 'laukkunsa')];
    const prev = projectOf(chapter('a', TEXT, marks));
    const own = [{ ...marks[0], position: 2 }];
    const snapshot = { ...prev, structure: [{ ...prev.structure[0], content: 'Vanha teksti. ' + TEXT, annotations: own }] };
    expect(M.followEdits(prev, snapshot)).toBe(snapshot);

    const none = { ...prev, structure: [{ ...prev.structure[0], content: 'Aivan muuta.', annotations: [] }] };
    expect(M.followEdits(prev, none)).toBe(none);
  });

  test('a chapter that is new, and a project without a changed text, come back as they are', () => {
    const marks = [mark(TEXT, 'laukkunsa')];
    const prev = projectOf(chapter('a', TEXT, marks));
    const imported = { ...prev, structure: [chapter('tuotu', 'Tuotu luku.', [])] };
    expect(M.followEdits(prev, imported)).toBe(imported);

    const renamed = { ...prev, structure: prev.structure.map(ch => ({ ...ch, title: 'Saapuminen' })) };
    expect(M.followEdits(prev, renamed)).toBe(renamed);
    const other = { ...prev, title: 'Uusi nimi' };
    expect(M.followEdits(prev, other)).toBe(other);
    expect(M.followEdits(prev, prev)).toBe(prev);
    expect(M.followEdits(null, prev)).toBe(prev);
  });

  test('a chapter without marks costs nothing: the update comes back as it is', () => {
    const prev = projectOf(chapter('a', TEXT, []), chapter('b', TEXT, undefined));
    const next = write(write(prev, 'a', TEXT + ' Lisää.'), 'b', TEXT + ' Lisää.');
    expect(M.followEdits(prev, next)).toBe(next);
  });

  test('a mark that cannot be read never stops the write of the text', () => {
    const broken = { id: 'x', get position() { throw new Error('rikki'); }, length: 2 };
    const prev = projectOf(chapter('a', TEXT, [broken]));
    const next = write(prev, 'a', 'Yö. ' + TEXT);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(M.followEdits(prev, next)).toBe(next);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test('chapters that changed places are found by their id', () => {
    const marks = [mark(TEXT, 'laukkunsa')];
    const prev = projectOf(chapter('a', 'Eka luku.', [point(2)]), chapter('b', TEXT, marks));
    const next = { ...prev, structure: [{ ...prev.structure[1], content: 'Yö. ' + TEXT }, prev.structure[0]] };
    const out = M.followEdits(prev, next);
    expect(under(out.structure[0].content, out.structure[0].annotations[0])).toBe('laukkunsa');
    expect(out.structure[1]).toBe(prev.structure[0]);
  });

  test('an undo puts the marks that were there back where they stood; a mark made since is mapped', () => {
    const before = [mark(TEXT, 'laukkunsa', { id: 'old' })];
    // After the step (the sentence with the mark was deleted) the old mark is a point, and a note was added
    const cut = apply(TEXT, deleted(TEXT, 'Hän nosti laukkunsa ja lähti kävelemään kohti kylää.'));
    const now = [
      { ...before[0], position: TEXT.indexOf('Hän'), length: 0, resolved: true },
      mark(cut, 'ketään', { id: 'new' })
    ];
    const prev = projectOf(chapter('a', cut, now));
    const next = write(prev, 'a', TEXT);                          // the undo writes the old text

    const out = M.followEdits(prev, next, { chapterId: 'a', restore: () => before });
    const [old, added] = out.structure[0].annotations;
    expect(under(TEXT, old)).toBe('laukkunsa');                   // back on its words, with its length
    expect(old.resolved).toBe(true);                              // what else changed on the mark stays
    expect(under(TEXT, added)).toBe('ketään');
    expect(out.structure[0].annotations).toHaveLength(2);         // a mark removed since would not come back

    // Without the stored places the point can only follow the text
    const mapped = M.followEdits(prev, next).structure[0].annotations[0];
    expect(mapped.length).toBe(0);
  });
});
