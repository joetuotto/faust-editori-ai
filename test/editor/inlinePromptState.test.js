/**
 * @jest-environment node
 */
const { createState, reduce, attemptLabel, changeCountLabel } = require('../../src/editor/inlinePromptState');

const attempt = (n, extra = {}) => ({ id: `a${n}`, title: 'Tiivistä', modelName: 'malli', changeCount: n, note: null, ...extra });

// Freeze a state and everything in it, so any write to it throws
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

describe('createState', () => {
  test('createState fills the defaults', () => {
    expect(createState()).toEqual({
      mode: 'edit',
      kind: 'selection',
      projectType: 'fiction',
      phase: 'idle',
      instruction: '',
      title: '',
      draft: '',
      waiting: false,
      preview: '',
      attempts: [],
      index: -1,
      error: null,
      blocked: null,
      note: null,
      model: null,
      models: null,
      otherModel: null,
      pickerOpen: false,
      actions: [],
      length: 'paragraph',
      canEditParagraph: false
    });
    expect(createState(null).phase).toBe('idle');
  });

  test('createState has no fields of the context row or of earlier attempts', () => {
    const state = createState({ parts: [{ id: 'style' }], promptText: 'x', showPrompt: true, earlierCount: 3 });
    for (const dropped of ['parts', 'promptText', 'showPrompt', 'earlierCount']) expect(state).not.toHaveProperty(dropped);
  });

  test('createState keeps what it is given and repairs what it cannot use', () => {
    const state = createState({
      mode: 'write',
      kind: 'cursor',
      projectType: 'nonfiction',
      draft: 'Sumu nousee',
      note: 'Pysäytetty ennen ensimmäistä kokonaista virkettä.',
      model: { id: 'p:m', name: 'm' },
      length: 'long',
      canEditParagraph: true,
      actions: [{ id: 'proofread', label: 'Kielenhuolto – vain virheet', builtin: true }]
    });
    expect(state).toMatchObject({ mode: 'write', kind: 'cursor', projectType: 'nonfiction', draft: 'Sumu nousee', length: 'long', canEditParagraph: true });
    expect(state.note).toBe('Pysäytetty ennen ensimmäistä kokonaista virkettä.');
    expect(state.actions).toHaveLength(1);

    const repaired = createState({ mode: 'muu', kind: 'outo', projectType: 'runo', phase: 'valmis', length: 'valtava', actions: 'ei lista' });
    expect(repaired).toMatchObject({ mode: 'edit', kind: 'selection', projectType: 'fiction', phase: 'idle', length: 'paragraph', actions: [] });
  });

  test('createState with attempts opens in result with the index clamped', () => {
    const attempts = [attempt(1), attempt(2), attempt(3)];
    expect(createState({ attempts, index: 1 })).toMatchObject({ phase: 'result', index: 1 });
    expect(createState({ attempts, index: 9 }).index).toBe(2);
    expect(createState({ attempts, index: -4 }).index).toBe(0);
    expect(createState({ attempts }).index).toBe(2);
    // Attempts win over a phase that was passed in
    expect(createState({ attempts, phase: 'idle' }).phase).toBe('result');
  });
});

describe('reduce', () => {
  test('send enters sending with waiting true and clears preview, error and note', () => {
    const before = {
      ...createState({ note: 'Pyyntö pysäytettiin.', pickerOpen: true }),
      phase: 'error',
      preview: 'vanhaa tekstiä',
      error: { code: 'empty', message: 'Ei ehdotusta: malli palautti tyhjän tekstin.', detail: '' }
    };
    const state = reduce(before, { type: 'send', instruction: 'Tiivistä vähän' });
    expect(state).toMatchObject({
      phase: 'sending',
      waiting: true,
      preview: '',
      error: null,
      note: null,
      pickerOpen: false,
      instruction: 'Tiivistä vähän',
      title: 'Tiivistä vähän'
    });
  });

  test('send can show an action label while the typed text stays the instruction', () => {
    const state = reduce(createState(), { type: 'send', instruction: 'säilytä nimet', title: 'Tiivistä' });
    expect(state.instruction).toBe('säilytä nimet');
    expect(state.title).toBe('Tiivistä');
    // A chip without typed text: nothing returns to the field after a stop
    const chip = reduce(createState(), { type: 'send', instruction: '', title: 'Selkeytä' });
    expect(reduce(chip, { type: 'cancelled' }).draft).toBe('');
  });

  test('delta is ignored outside sending', () => {
    const idle = createState();
    expect(reduce(idle, { type: 'delta', preview: 'teksti' })).toBe(idle);
    const result = createState({ attempts: [attempt(1)] });
    expect(reduce(result, { type: 'delta', preview: 'teksti' })).toBe(result);

    const sending = reduce(idle, { type: 'send', instruction: 'x' });
    const streaming = reduce(sending, { type: 'delta', preview: 'Åke käveli – ' });
    expect(streaming).toMatchObject({ phase: 'sending', waiting: false, preview: 'Åke käveli – ' });
  });

  test('result appends the attempt, selects it and clears the draft', () => {
    let state = { ...createState({ attempts: [attempt(1)], draft: 'vanha' }) };
    state = reduce(state, { type: 'send', instruction: 'lyhyemmin' });
    state = reduce(state, { type: 'result', attempt: attempt(2) });
    expect(state.attempts.map((item) => item.id)).toEqual(['a1', 'a2']);
    expect(state).toMatchObject({ phase: 'result', index: 1, draft: '', waiting: false });
  });

  test('the thirteenth attempt drops the oldest', () => {
    let state = createState();
    for (let n = 1; n <= 13; n += 1) state = reduce(state, { type: 'result', attempt: attempt(n) });
    expect(state.attempts).toHaveLength(12);
    expect(state.attempts[0].id).toBe('a2');
    expect(state.attempts[11].id).toBe('a13');
    expect(state.index).toBe(11);
  });

  test('attempt updates the count and the note of one attempt only', () => {
    const state = createState({ attempts: [attempt(1), attempt(2)], index: 1 });
    const next = reduce(state, { type: 'attempt', index: 0, changeCount: 0, note: 'Malli ei ehdottanut muutoksia.' });
    expect(next.attempts[0]).toMatchObject({ id: 'a1', changeCount: 0, note: 'Malli ei ehdottanut muutoksia.' });
    expect(next.attempts[1]).toBe(state.attempts[1]);
    expect(next.index).toBe(1);
    expect(reduce(state, { type: 'attempt', index: 7, changeCount: 1, note: null })).toBe(state);
  });

  test('fail keeps the instruction as the draft', () => {
    const sending = reduce(createState(), { type: 'send', instruction: 'Tee tästä tiiviimpi' });
    const error = { code: 'missing_tag', message: 'Ei ehdotusta: vastauksesta puuttuu sulkeva </teksti>-tagi.', detail: 'Valitettavasti' };
    const state = reduce(sending, { type: 'fail', error });
    expect(state).toMatchObject({ phase: 'error', error, draft: 'Tee tästä tiiviimpi', waiting: false });
  });

  test('cancelled returns to idle without attempts and to result with attempts', () => {
    const idle = reduce(reduce(createState(), { type: 'send', instruction: 'Tiivistä' }), { type: 'cancelled' });
    expect(idle).toMatchObject({ phase: 'idle', draft: 'Tiivistä', note: 'Pyyntö pysäytettiin.', waiting: false, preview: '' });

    const withAttempts = createState({ attempts: [attempt(1)] });
    const result = reduce(reduce(withAttempts, { type: 'send', instruction: 'vielä lyhyemmin' }), { type: 'cancelled' });
    expect(result).toMatchObject({ phase: 'result', index: 0, draft: 'vielä lyhyemmin', note: 'Pyyntö pysäytettiin.' });
  });

  test('select clamps the index', () => {
    const state = createState({ attempts: [attempt(1), attempt(2), attempt(3)], index: 2 });
    expect(reduce(state, { type: 'select', index: 0 }).index).toBe(0);
    expect(reduce(state, { type: 'select', index: -1 }).index).toBe(0);
    expect(reduce(state, { type: 'select', index: 3 }).index).toBe(2);
    // No change in other phases than result
    const sending = reduce(state, { type: 'send', instruction: 'x' });
    expect(reduce(sending, { type: 'select', index: 0 })).toBe(sending);
    const idle = createState();
    expect(reduce(idle, { type: 'select', index: 0 })).toBe(idle);
  });

  test('show puts an earlier attempt back on screen after a failed try', () => {
    const state = createState({ attempts: [attempt(1), attempt(2)], index: 1 });
    const failed = reduce(state, { type: 'fail', error: { code: 'conflict', message: 'Kohdassa on jo käsittelemätön ehdotus. Käsittele se ensin.', detail: '' } });
    expect(reduce(failed, { type: 'show', index: 0 })).toMatchObject({ phase: 'result', index: 0, error: null });
    const empty = createState();
    expect(reduce(empty, { type: 'show', index: 0 })).toBe(empty);
  });

  test('block enters blocked with the message', () => {
    const message = 'Tämä luku on merkitty ”Ei tekoälylle”. Mitään ei lähetetä.';
    const state = reduce(createState(), { type: 'block', code: 'noAI', message });
    expect(state.phase).toBe('blocked');
    expect(state.blocked).toEqual({ code: 'noAI', message });
  });

  test('picker, models, actions, length and note set their fields', () => {
    let state = createState();
    state = reduce(state, { type: 'picker', open: true });
    expect(state.pickerOpen).toBe(true);
    state = reduce(state, { type: 'models', models: [{ id: 'p:a', name: 'a' }], otherModel: 'p:a' });
    expect(state.models).toEqual([{ id: 'p:a', name: 'a' }]);
    expect(state.otherModel).toBe('p:a');
    state = reduce(state, { type: 'models', models: [], otherModel: null });
    expect(state.models).toEqual([]);
    expect(state.otherModel).toBeNull();
    state = reduce(state, { type: 'actions', actions: [{ id: 'user-1', label: 'Oma', builtin: false }] });
    expect(state.actions).toEqual([{ id: 'user-1', label: 'Oma', builtin: false }]);
    state = reduce(state, { type: 'length', length: 'sentence' });
    expect(state.length).toBe('sentence');
    expect(reduce(state, { type: 'length', length: 'valtava' })).toBe(state);
    state = reduce(state, { type: 'note', note: 'Vuorosanojen ehdotuksia: 2. Käy ne läpi yksitellen.' });
    expect(state.note).toBe('Vuorosanojen ehdotuksia: 2. Käy ne läpi yksitellen.');
    expect(reduce(state, { type: 'note', note: null }).note).toBeNull();
    state = reduce(state, { type: 'picker', open: false });
    expect(state.pickerOpen).toBe(false);
  });

  test('the events of the context row do not exist', () => {
    const state = createState();
    expect(reduce(state, { type: 'parts', parts: [{ id: 'style' }], promptText: 'x' })).toBe(state);
    expect(reduce(state, { type: 'toggle-prompt' })).toBe(state);
    expect(reduce(state, { type: 'tuntematon' })).toBe(state);
    expect(reduce(state, null)).toBe(state);
  });

  test('reduce never mutates the previous state', () => {
    const events = [
      { type: 'send', instruction: 'Tiivistä', title: 'Tiivistä' },
      { type: 'delta', preview: 'teksti' },
      { type: 'result', attempt: attempt(9) },
      { type: 'attempt', index: 0, changeCount: 4, note: 'huomio' },
      { type: 'fail', error: { code: 'empty', message: 'x', detail: '' } },
      { type: 'cancelled' },
      { type: 'select', index: 0 },
      { type: 'show', index: 0 },
      { type: 'block', code: 'noAI', message: 'x' },
      { type: 'picker', open: true },
      { type: 'models', models: [{ id: 'a', name: 'a' }], otherModel: 'a' },
      { type: 'actions', actions: [] },
      { type: 'length', length: 'long' },
      { type: 'note', note: 'x' }
    ];
    const starts = [
      createState(),
      createState({ attempts: [attempt(1), attempt(2)], index: 1 }),
      reduce(createState(), { type: 'send', instruction: 'x' })
    ];
    for (const start of starts) {
      const copy = JSON.parse(JSON.stringify(start));
      deepFreeze(start);
      for (const event of events) {
        // A frozen state would throw on any write (strict mode in the module is not needed: assignment to a frozen
        // property is silently ignored otherwise, so the copy is compared as well)
        const next = reduce(start, event);
        expect(next).toBeDefined();
        expect(JSON.parse(JSON.stringify(start))).toEqual(copy);
      }
    }
  });
});

describe('labels', () => {
  test('attemptLabel counts from one', () => {
    expect(attemptLabel(1, 3)).toBe('2/3');
    expect(attemptLabel(0, 1)).toBe('1/1');
  });

  test('changeCountLabel gives Ei muutoksia, 1 muutos and 7 muutosta', () => {
    expect(changeCountLabel(0)).toBe('Ei muutoksia');
    expect(changeCountLabel(1)).toBe('1 muutos');
    expect(changeCountLabel(7)).toBe('7 muutosta');
    expect(changeCountLabel(2)).toBe('2 muutosta');
    // Not counted yet: nothing is claimed
    expect(changeCountLabel(null)).toBe('');
    expect(changeCountLabel(undefined)).toBe('');
  });
});
