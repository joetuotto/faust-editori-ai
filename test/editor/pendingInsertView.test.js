const { createBlockView } = require('../../src/editor/pendingInsertView');

const base = { status: 'done', text: 'Sumu nousi järveltä.', note: null, modelName: 'kimi-k2', attempt: 0, attemptCount: 1 };

// The accept hint follows the platform of the window, with the test termHighlightCore.js uses
const onMac = () => /Mac|iPhone|iPad|iPod/.test(window.navigator.platform || '');
const HINT_MAC = '⌘↩ hyväksyy';
const HINT_OTHER = 'Ctrl+Enter hyväksyy';
const platformHint = () => (onMac() ? HINT_MAC : HINT_OTHER);

function setPlatform(value) {
  Object.defineProperty(window.navigator, 'platform', { value, configurable: true });
}

function mount(view) {
  const intents = [];
  const block = createBlockView(document, { onIntent: intent => intents.push(intent) });
  document.body.appendChild(block.dom);
  if (view) block.render(view);
  const find = role => block.dom.querySelector(`[data-role="${role}"]`);
  const click = role => find(role).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return { block, intents, find, click };
}

afterEach(() => {
  document.body.innerHTML = '';
  // Back to jsdom's own platform string
  delete window.navigator.platform;
});

test('streaming shows Odotetaan mallia… and then the text; Pysäytä asks to stop', () => {
  const { block, intents, find, click } = mount({ ...base, status: 'streaming', text: '' });
  expect(find('block-text').textContent).toBe('Odotetaan mallia…');
  expect(find('block-stop').textContent).toBe('Pysäytä');
  expect(find('block-accept')).toBeNull();
  expect(find('block-reject')).toBeNull();

  block.render({ ...base, status: 'streaming', text: 'Sumu nousi' });
  expect(find('block-text').textContent).toBe('Sumu nousi');
  block.render({ ...base, status: 'streaming', text: 'Sumu nousi järveltä.' });
  expect(find('block-text').textContent).toBe('Sumu nousi järveltä.');

  click('block-stop');
  expect(intents).toEqual([{ type: 'block-stop' }]);
});

test('done shows Hyväksy, Uusi yritys and Hylkää and each sends its intent', () => {
  const { intents, find, click } = mount(base);
  expect(find('block-text').textContent).toBe('Sumu nousi järveltä.');
  expect([find('block-accept'), find('block-retry'), find('block-reject')].map(node => node.textContent))
    .toEqual(['Hyväksy', 'Uusi yritys', 'Hylkää']);
  expect(find('block-stop')).toBeNull();
  expect(find('block-note')).toBeNull();
  expect(find('block-hint').textContent).toBe(platformHint());
  // One attempt: nothing to switch between
  expect(find('block-prev')).toBeNull();
  expect(find('block-label')).toBeNull();

  click('block-accept');
  click('block-retry');
  click('block-reject');
  expect(intents).toEqual([{ type: 'block-accept' }, { type: 'block-retry' }, { type: 'block-reject' }]);
});

test('stopped shows the same buttons and the note', () => {
  const noteText = 'Pysäytetty. Teksti on leikattu viimeiseen kokonaiseen virkkeeseen.';
  const { block, find } = mount({ ...base, status: 'stopped', note: noteText });
  expect([find('block-accept'), find('block-retry'), find('block-reject')].map(node => node.textContent))
    .toEqual(['Hyväksy', 'Uusi yritys', 'Hylkää']);
  expect(find('block-note').textContent).toBe(noteText);
  expect(find('block-text').textContent).toBe('Sumu nousi järveltä.');
  expect(find('block-hint').textContent).toBe(platformHint());

  // The note leaves with the next attempt that has none
  block.render({ ...base, status: 'stopped', note: null });
  expect(find('block-note')).toBeNull();
});

test('error shows Ei tekstiä. with the note and no Hyväksy', () => {
  const { intents, find, click } = mount({ ...base, status: 'error', text: '', note: 'Ei ehdotusta: malli palautti tyhjän tekstin.' });
  expect(find('block-text').textContent).toBe('Ei tekstiä.');
  expect(find('block-note').textContent).toBe('Ei ehdotusta: malli palautti tyhjän tekstin.');
  expect(find('block-accept')).toBeNull();
  expect(find('block-stop')).toBeNull();
  expect(find('block-hint')).toBeNull();
  expect([find('block-retry'), find('block-reject')].map(node => node.textContent)).toEqual(['Uusi yritys', 'Hylkää']);

  click('block-retry');
  click('block-reject');
  expect(intents).toEqual([{ type: 'block-retry' }, { type: 'block-reject' }]);
});

test('a failed attempt shows Ei tekstiä. even when it has text, and offers no attempt switcher', () => {
  // contracts 8.6: Error shows Ei tekstiä. and the note, Uusi yritys and Hylkää only
  const { find } = mount({ ...base, status: 'error', text: 'Sumu nousi.', note: 'Vastaus katkesi.', attempt: 1, attemptCount: 2 });
  expect(find('block-text').textContent).toBe('Ei tekstiä.');
  expect(find('block-accept')).toBeNull();
  expect(find('block-prev')).toBeNull();
  expect(find('block-next')).toBeNull();
  expect(find('block-label')).toBeNull();
});

test('updating the text keeps the same button elements', () => {
  const { block, find } = mount({ ...base, status: 'streaming', text: '' });
  const stop = find('block-stop');
  const textNode = find('block-text');
  for (const text of ['Sumu', 'Sumu nousi', 'Sumu nousi järveltä.']) {
    block.render({ ...base, status: 'streaming', text });
    expect(find('block-stop')).toBe(stop);
    expect(find('block-text')).toBe(textNode);
  }

  block.render({ ...base, status: 'done' });
  expect(find('block-stop')).toBeNull();
  const accept = find('block-accept');
  const retry = find('block-retry');
  // The same status again, with another text, another attempt and a note: the buttons stay
  block.render({ ...base, status: 'done', text: 'Toinen versio.', attempt: 1, attemptCount: 2, note: 'Huomio.' });
  expect(find('block-accept')).toBe(accept);
  expect(find('block-retry')).toBe(retry);
  expect(find('block-text')).toBe(textNode);
  expect(block.dom.isConnected).toBe(true);
});

test('the attempt switcher appears with two attempts and sends block-show with the index', () => {
  const { block, intents, find, click } = mount(base);
  expect(find('block-prev')).toBeNull();

  block.render({ ...base, text: 'Toinen versio.', attempt: 1, attemptCount: 2 });
  expect(find('block-prev').textContent).toBe('‹');
  expect(find('block-prev').getAttribute('aria-label')).toBe('Edellinen yritys');
  expect(find('block-label').textContent).toBe('2/2');
  expect(find('block-next').textContent).toBe('›');
  expect(find('block-next').getAttribute('aria-label')).toBe('Seuraava yritys');
  // The last attempt is showing: there is no next one
  expect(find('block-next').disabled).toBe(true);
  expect(find('block-prev').disabled).toBe(false);

  click('block-prev');
  expect(intents).toEqual([{ type: 'block-show', index: 0 }]);
  click('block-next');
  expect(intents).toHaveLength(1);

  block.render({ ...base, attempt: 0, attemptCount: 3 });
  expect(find('block-label').textContent).toBe('1/3');
  expect(find('block-prev').disabled).toBe(true);
  click('block-next');
  expect(intents[1]).toEqual({ type: 'block-show', index: 1 });

  // Back to one attempt: the switcher leaves, the other buttons stay
  block.render({ ...base, attempt: 0, attemptCount: 1 });
  expect(find('block-prev')).toBeNull();
  expect(find('block-label')).toBeNull();
  expect(find('block-accept')).not.toBeNull();
});

test('text with ä ö å, ” and a line starting with – is shown unchanged', () => {
  const text = '– Älä mene, Åke sanoi.\n– ”Öinen sumu” ei haittaa – menen silti.\n\n<u>Ovi</u> kävi & [TODO: tarkista].';
  const { find } = mount({ ...base, text });
  const node = find('block-text');
  expect(node.textContent).toBe(text);
  // Set as text, never as markup; line breaks are kept by the style
  expect(node.children).toHaveLength(0);
  expect(node.style.whiteSpace).toBe('pre-wrap');
  expect(node.textContent.normalize('NFC')).toBe(text);
});

test('mouseup and keyup do not leave the block', () => {
  const { find } = mount(base);
  const seen = [];
  const listen = type => document.body.addEventListener(type, () => seen.push(type));
  ['mouseup', 'keyup', 'click', 'mousedown'].forEach(listen);

  const target = find('block-text');
  target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  target.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  find('block-accept').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(seen).toEqual([]);

  // A mousedown on a button is cancelled, so the editor keeps the focus
  const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
  find('block-accept').dispatchEvent(down);
  expect(down.defaultPrevented).toBe(true);
  for (const role of ['block-retry', 'block-reject']) {
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    find(role).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  }
});

test('after destroy the block no longer holds events back', () => {
  const { block, find } = mount(base);
  const seen = [];
  document.body.addEventListener('mouseup', () => seen.push('mouseup'));
  block.destroy();
  find('block-text').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  expect(seen).toEqual(['mouseup']);
});

test('the accept hint is ⌘↩ hyväksyy on macOS and Ctrl+Enter hyväksyy elsewhere', () => {
  // The variant of the platform the tests run on (jsdom reports an empty platform: not macOS)
  const here = mount(base);
  expect(here.find('block-hint').textContent).toBe(onMac() ? HINT_MAC : HINT_OTHER);
  document.body.innerHTML = '';

  setPlatform('MacIntel');
  expect(mount(base).find('block-hint').textContent).toBe(HINT_MAC);
  document.body.innerHTML = '';

  setPlatform('Win32');
  expect(mount(base).find('block-hint').textContent).toBe(HINT_OTHER);
  document.body.innerHTML = '';

  setPlatform('Linux x86_64');
  const { block, find } = mount({ ...base, status: 'stopped', note: 'Pysäytetty.' });
  expect(find('block-hint').textContent).toBe(HINT_OTHER);
  // A streaming block has no hint; the hint comes back with the finished one
  block.render({ ...base, status: 'streaming', text: 'Sumu' });
  expect(find('block-hint')).toBeNull();
  block.render(base);
  expect(find('block-hint').textContent).toBe(HINT_OTHER);
});

test('the header names the model and says the text is not in the manuscript yet', () => {
  const { block, find } = mount(base);
  expect(find('block-head').textContent).toBe('Tekoälyn luonnos · ei vielä käsikirjoituksessa · kimi-k2');
  expect(block.dom.getAttribute('aria-label')).toBe('Tekoälyn luonnos');
  expect(block.dom.getAttribute('spellcheck')).toBe('false');
  expect(block.dom.className).toBe('cm-faust-block');
  expect(block.dom.tagName).toBe('DIV');

  block.render({ ...base, modelName: '' });
  expect(find('block-head').textContent).toBe('Tekoälyn luonnos · ei vielä käsikirjoituksessa');
});

test('the model name is a span of its own, so a narrow block wraps it whole and never at its hyphen', () => {
  const { block, find } = mount({ ...base, modelName: 'deepseek-v4.1-flash-abliterated' });
  const name = find('block-model');
  expect(name.tagName).toBe('SPAN');
  expect(name.className).toBe('cm-faust-block-model');
  expect(name.textContent).toBe('deepseek-v4.1-flash-abliterated');
  expect(find('block-head').textContent).toBe('Tekoälyn luonnos · ei vielä käsikirjoituksessa · deepseek-v4.1-flash-abliterated');

  // A new name replaces the span; streaming text does not rebuild it
  block.render({ ...base, modelName: 'kimi-k2', text: 'Sumu' });
  const kimi = find('block-model');
  block.render({ ...base, modelName: 'kimi-k2', text: 'Sumu nousi.' });
  expect(find('block-model')).toBe(kimi);
  expect(find('block-head').querySelectorAll('[data-role="block-model"]')).toHaveLength(1);
  block.render({ ...base, modelName: '' });
  expect(find('block-model')).toBeNull();
});
