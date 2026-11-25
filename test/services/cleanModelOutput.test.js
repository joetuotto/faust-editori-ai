/**
 * @jest-environment node
 */
const { cleanModelOutput } = require('../../src/services/ai/cleanModelOutput');

const text = (raw, options) => cleanModelOutput(raw, options).text;

describe('cleanModelOutput: tags', () => {
  test('takes the text between <teksti> and </teksti>', () => {
    expect(cleanModelOutput('<teksti>Kissa istui.</teksti>')).toEqual({
      text: 'Kissa istui.', complete: true, hadOpenTag: true, hadCloseTag: true, notes: ['tags']
    });
  });

  test('line breaks inside the tags and anything outside them are dropped', () => {
    expect(text('<teksti>\nKissa istui.\n</teksti>\n')).toBe('Kissa istui.');
    expect(text('Tässä korjattu teksti:\n\n<teksti>Kissa istui.</teksti>\n\nMuutin pilkun.')).toBe('Kissa istui.');
  });

  test('a mention of the tag before the real one does not start the text', () => {
    expect(text('Palautan tekstin <teksti>-tagien sisällä.\n<teksti>Kissa istui.</teksti>')).toBe('Kissa istui.');
  });

  test('tags in capitals or with spaces are recognised', () => {
    expect(text('<TEKSTI>Kissa istui.</TEKSTI>')).toBe('Kissa istui.');
    expect(text('< teksti >Kissa istui.</ teksti >')).toBe('Kissa istui.');
    expect(text('<teksti>Kissa istui.< / teksti>')).toBe('Kissa istui.');
  });

  test('of two tagged blocks the last one is used', () => {
    expect(text('<teksti>A.</teksti> tai <teksti>B.</teksti>')).toBe('B.');
    expect(cleanModelOutput('<teksti>A.</teksti>\n<teksti>B.</teksti>\n<teksti>C.</teksti>')).toMatchObject({ text: 'C.', complete: true });
  });

  test('a format example before the answer is not the answer', () => {
    expect(text('Vastaan muodossa <teksti>muokattu teksti</teksti>.\n<teksti>Oikea vastaus.</teksti>')).toBe('Oikea vastaus.');
  });

  test('another tag name can be asked for', () => {
    expect(cleanModelOutput('<text>Cat sat.</text>', { tag: 'text' })).toMatchObject({ text: 'Cat sat.', complete: true });
    // the default tag is then ordinary text
    expect(text('<text><teksti>Kissa.</teksti></text>', { tag: 'text' })).toBe('<teksti>Kissa.</teksti>');
  });

  test('line breaks inside the text are kept, CRLF becomes LF', () => {
    expect(text('<teksti>Eka.\r\nToka.</teksti>')).toBe('Eka.\nToka.');
    expect(text('<teksti>Eka.\rToka.\r\n\r\nKolmas.</teksti>')).toBe('Eka.\nToka.\n\nKolmas.');
  });

  // Cases beyond the named list

  test('a draft in visible text and then the answer: the answer is the last block', () => {
    const reply = '<teksti>Kissa istuu ikunalla.</teksti>\nHetkinen, korjaan vielä yhden sanan.\n<teksti>Kissa istuu ikkunalla.</teksti>';
    expect(cleanModelOutput(reply)).toMatchObject({ text: 'Kissa istuu ikkunalla.', complete: true, hadOpenTag: true, hadCloseTag: true });
  });

  test('a format example followed by an answer that never closed is not complete', () => {
    expect(cleanModelOutput('Muoto: <teksti>esimerkki</teksti>\n<teksti>Oikea vastaus.')).toMatchObject({ complete: false, hadCloseTag: true });
    expect(cleanModelOutput('Muoto: <teksti>esimerkki</teksti> <teksti>Oikea vastaus.')).toMatchObject({ complete: false });
    // an opening tag on a line of its own with nothing after it is no answer
    expect(cleanModelOutput('<teksti>Kissa istui.</teksti>\n<teksti>\n')).toMatchObject({ text: 'Kissa istui.', complete: true });
  });

  test('a mention of the opening tag after the answer changes nothing', () => {
    expect(cleanModelOutput('<teksti>Kissa istui.</teksti>\n<teksti>-tagit ovat paikallaan.')).toMatchObject({ complete: true });
    expect(cleanModelOutput('<teksti>Kissa istui.</teksti>\nPalautin tekstin <teksti>-tagien sisällä.')).toMatchObject({
      text: 'Kissa istui.', complete: true
    });
  });

  test('a byte-order mark at the start is dropped', () => {
    expect(text('\ufeff<teksti>Kissa istui.</teksti>')).toBe('Kissa istui.');
    expect(text('\ufeffKissa istui.', { tag: null })).toBe('Kissa istui.');
  });

  test('a tag name is taken literally, not as an expression', () => {
    expect(cleanModelOutput('<axb>Kissa.</axb>', { tag: 'a.b' })).toMatchObject({ text: '<axb>Kissa.</axb>', hadOpenTag: false, hadCloseTag: false });
    expect(cleanModelOutput('<a.b>Kissa.</a.b>', { tag: 'a.b' })).toMatchObject({ text: 'Kissa.', complete: true });
  });

  test('ä, ö, å, ” and – inside the tags come back untouched', () => {
    const inner = '– Äiti, öisin Åke sanoo: ”Hyvää yötä” – ja nukahtaa… [TODO: tarkista] <u>heti</u>.';
    expect(cleanModelOutput(`<teksti>${inner}</teksti>`)).toEqual({ text: inner, complete: true, hadOpenTag: true, hadCloseTag: true, notes: ['tags'] });
  });
});

describe('cleanModelOutput: a reply that did not finish', () => {
  test('without the closing tag the text so far is returned and complete is false', () => {
    expect(cleanModelOutput('<teksti>Kissa istui ikkunalla ja kats')).toEqual({
      text: 'Kissa istui ikkunalla ja kats', complete: false, hadOpenTag: true, hadCloseTag: false, notes: ['tags']
    });
  });

  test('a closing tag cut in half is not part of the text', () => {
    expect(text('<teksti>Kissa istui.</tek')).toBe('Kissa istui.');
    expect(text('<teksti>Kissa istui.<')).toBe('Kissa istui.');
    expect(text('<teksti>Kissa istui.</')).toBe('Kissa istui.');
    expect(text('<teksti>Kissa istui.</teksti')).toBe('Kissa istui.');
    expect(text('<teksti>Kissa istui.</TEKS')).toBe('Kissa istui.');
    expect(cleanModelOutput('<teksti>Kissa istui.</teksti')).toMatchObject({ complete: false, hadCloseTag: false });
  });

  test('a refusal in plain words has no tags: complete is false', () => {
    expect(cleanModelOutput('En valitettavasti voi auttaa tässä.')).toMatchObject({
      text: 'En valitettavasti voi auttaa tässä.', complete: false, hadOpenTag: false, hadCloseTag: false
    });
  });

  test('empty tags, an empty reply and a missing reply are not complete', () => {
    expect(cleanModelOutput('<teksti></teksti>')).toMatchObject({ text: '', complete: false, hadCloseTag: true });
    expect(cleanModelOutput('<teksti> \n </teksti>')).toMatchObject({ text: '', complete: false, hadCloseTag: true });
    expect(cleanModelOutput('')).toMatchObject({ text: '', complete: false });
    expect(cleanModelOutput(null)).toMatchObject({ text: '', complete: false });
    expect(cleanModelOutput(undefined)).toEqual({ text: '', complete: false, hadOpenTag: false, hadCloseTag: false, notes: [] });
  });

  test('a closing tag without an opening one still counts as finished', () => {
    expect(cleanModelOutput('Kissa istui.</teksti>')).toMatchObject({ text: 'Kissa istui.', complete: true, hadOpenTag: false });
    // it can become suggestions, so nothing is guessed: no preface, remark or fence rule
    expect(text('Tässä korjattu teksti:\nKissa istui.</teksti>')).toBe('Tässä korjattu teksti:\nKissa istui.');
    const original = 'Kesä oli lämmin.\n\nMuutin Helsinkiin syksyllä ja alotin työt.';
    expect(cleanModelOutput('Kesä oli lämmin.\n\nMuutin Helsinkiin syksyllä ja aloitin työt.</teksti>', { original })).toMatchObject({
      text: 'Kesä oli lämmin.\n\nMuutin Helsinkiin syksyllä ja aloitin työt.', complete: true, notes: ['tags']
    });
    expect(text('Eka:\n```\nA\n```\nloppu</teksti>')).toBe('Eka:\n```\nA\n```\nloppu');
  });

  test('a tag left inside the extracted text makes the reply incomplete', () => {
    expect(cleanModelOutput('<teksti>Oikea vastaus.</teksti>\nHuom: lisäsin </teksti>-tagin loppuun.')).toMatchObject({ complete: false, hadCloseTag: true });
    expect(cleanModelOutput('<teksti><teksti>Sisin.</teksti></teksti>')).toMatchObject({ text: 'Sisin.</teksti>', complete: false });
    expect(cleanModelOutput('Sisin.</teksti></teksti>')).toMatchObject({ complete: false });
    // a tag the original itself holds may come back
    expect(cleanModelOutput('<teksti>Sana </teksti> jäi.</teksti>', { original: 'Sana </teksti> jäi.' })).toMatchObject({ text: 'Sana </teksti> jäi.', complete: true });
  });
});

describe('cleanModelOutput: reasoning blocks', () => {
  test('<think>…</think> is removed, tags mentioned inside it included', () => {
    expect(cleanModelOutput('<think>Käyttäjä haluaa <teksti>…</teksti> muodon.</think>\n<teksti>Kissa istui.</teksti>')).toMatchObject({
      text: 'Kissa istui.', complete: true, notes: ['thinking', 'tags']
    });
    expect(text('<thinking>hmm</thinking><teksti>Kissa istui.</teksti>')).toBe('Kissa istui.');
  });

  test('reasoning that never ends leaves nothing', () => {
    expect(cleanModelOutput('<think>Mietin vielä, pitäisikö')).toMatchObject({ text: '', complete: false, notes: ['thinking'] });
  });

  test('a closing </think> without an opening one drops everything before it', () => {
    expect(text('pohdintaa…</think>\n<teksti>Kissa istui.</teksti>')).toBe('Kissa istui.');
  });

  // Cases beyond the named list

  test('thought, reasoning and reflection blocks go too, in capitals or with attributes, and several of them', () => {
    for (const tag of ['think', 'thinking', 'thought', 'reasoning', 'reflection']) {
      expect(cleanModelOutput(`<${tag}>pohdintaa</${tag}><teksti>Kissa istui.</teksti>`)).toMatchObject({ text: 'Kissa istui.', notes: ['thinking', 'tags'] });
    }
    expect(text('<THINK>a</THINK><teksti>Kissa istui.</teksti>')).toBe('Kissa istui.');
    expect(text('<think kieli="fi">a</think><teksti>Kissa istui.</teksti>')).toBe('Kissa istui.');
    expect(text('<think>a</think><think>b</think><teksti>Kissa istui.</teksti><think>c</think>')).toBe('Kissa istui.');
  });

  test('an answer inside reasoning that never ends is not an answer', () => {
    expect(cleanModelOutput('<teksti>Kissa istui.</teksti><think>Vai pitäisikö <teksti>Kissa makasi.</teksti>')).toMatchObject({
      text: 'Kissa istui.', complete: true
    });
    expect(cleanModelOutput('<think>Ehkä <teksti>Kissa makasi.</teksti>')).toMatchObject({ text: '', complete: false });
  });

  test('a tag that only begins like a reasoning tag is left alone', () => {
    expect(text('<thinker>ei pohdintaa</thinker>', { tag: null })).toBe('<thinker>ei pohdintaa</thinker>');
  });
});

describe('cleanModelOutput: replies without tags', () => {
  test('a preface line is removed', () => {
    expect(cleanModelOutput('Tässä korjattu teksti:\n\nKissa istui.')).toMatchObject({ text: 'Kissa istui.', complete: false, notes: ['preface'] });
    expect(text("Sure! Here's the corrected text:\n\nKissa istui.")).toBe('Kissa istui.');
  });

  test('a first line that is in the original text is not a preface', () => {
    const original = 'Tässä ovat syyt:\n- yksi';
    expect(text('Tässä ovat syyt:\n- yksi', { original })).toBe('Tässä ovat syyt:\n- yksi');
  });

  test('closing remarks are removed', () => {
    expect(text('Kissa istui.\n\nMuutokset: lisäsin pilkun.')).toBe('Kissa istui.');
    expect(text('Kissa istui.\n\nMuutin vain pilkut.')).toBe('Kissa istui.');
    expect(text('Kissa istui.\n\n**Muutokset:**\n- pilkku')).toBe('Kissa istui.');
    expect(text('Kissa istui.\n\nI changed the comma.')).toBe('Kissa istui.');
    expect(text('Kissa istui.\n\n---\n\nSelitys: pilkku.')).toBe('Kissa istui.');
  });

  test('an ordinary last paragraph stays', () => {
    expect(text('Hän lähti.\n\nKerro minulle, mitä tapahtui.')).toBe('Hän lähti.\n\nKerro minulle, mitä tapahtui.');
  });

  test('stripChatter: false leaves prefaces and remarks alone', () => {
    expect(text('Hän lähti.\n\nMuutin Helsinkiin keväällä.', { stripChatter: false })).toBe('Hän lähti.\n\nMuutin Helsinkiin keväällä.');
    expect(text('Tässä on syy:\n\nHän lähti.', { stripChatter: false })).toBe('Tässä on syy:\n\nHän lähti.');
  });

  test('tag: null never looks for tags', () => {
    expect(cleanModelOutput('Koska virke on pitkä.', { tag: null })).toMatchObject({ text: 'Koska virke on pitkä.', complete: false, notes: [] });
    expect(cleanModelOutput('<teksti>Kissa.</teksti>', { tag: null })).toMatchObject({
      text: '<teksti>Kissa.</teksti>', complete: false, hadOpenTag: false, hadCloseTag: false
    });
  });

  // Cases beyond the named list

  test('a preface may be bold or a heading; every opener of the list counts as a whole word', () => {
    expect(text('**Tässä korjattu teksti:**\n\nKissa istui.')).toBe('Kissa istui.');
    expect(text('# Korjattu teksti:\nKissa istui.')).toBe('Kissa istui.');
    const openers = ['Tässä', 'Tassa', 'Alla', 'Ohessa', 'Korjattu', 'Muokattu', 'Tiivistetty', 'Selkeytetty', 'Paranneltu', 'Uusi', 'Toki',
      'Selvä', 'Totta kai', 'Hyvä on', 'Here', 'Sure', 'Okay', 'OK', 'Certainly', 'Of course'];
    for (const opener of openers) {
      expect(text(`${opener}, teksti:\nKissa istui.`)).toBe('Kissa istui.');
    }
    // "Tässäkin" and "Uusimaa" only begin like an opener
    expect(text('Tässäkin on syynsä:\nKissa istui.')).toBe('Tässäkin on syynsä:\nKissa istui.');
    expect(text('Uusimaa on maakunta:\nKissa istui.')).toBe('Uusimaa on maakunta:\nKissa istui.');
  });

  test('not a preface: no colon, nothing after it, over 120 characters, or another first word', () => {
    expect(text('Tässä korjattu teksti\nKissa istui.')).toBe('Tässä korjattu teksti\nKissa istui.');
    expect(text('Tässä korjattu teksti:')).toBe('Tässä korjattu teksti:');
    expect(text('Tässä korjattu teksti:\n\n  ')).toBe('Tässä korjattu teksti:');
    const long = `Tässä ${'hyvin '.repeat(20)}pitkä rivi:`;
    expect(long.length).toBeGreaterThan(120);
    expect(text(`${long}\nKissa istui.`)).toBe(`${long}\nKissa istui.`);
    expect(text('Kissa sanoi:\n– Miau.')).toBe('Kissa sanoi:\n– Miau.');
  });

  test('several remark blocks in a row go; what stays is not rewritten', () => {
    expect(text('Eka kappale.\n \nToka kappale.\n\nHuom! Tarkista nimet.\n\n- Korjasin kaksi pilkkua.\n\nToivottavasti tämä auttaa!\n\n'))
      .toBe('Eka kappale.\n \nToka kappale.');
    expect(cleanModelOutput('Kissa istui.\n\nMuutin pilkun.').notes).toEqual(['trailing']);
  });

  test('every remark opener of the list is recognised, and only as a whole word', () => {
    const labels = ['Muutokset', 'Korjaukset', 'Huomautus', 'Huomautukset', 'Huomioita', 'Huom', 'Selitys', 'Perustelu', 'Perustelut',
      'Note', 'Notes', 'Changes', 'Explanation'];
    for (const label of labels) {
      for (const mark of [':', '!', '.']) expect(text(`Kissa istui.\n\n${label}${mark} jotain`)).toBe('Kissa istui.');
    }
    const openers = ['Muutin', 'Korjasin', 'Lisäsin', 'Poistin', 'Säilytin', 'Tein seuraavat', 'En muuttanut', 'Toivottavasti', 'Kerro, jos',
      'Kerro jos', 'Halutessasi', 'Voin myös', 'Let me know', 'Hope this', 'I changed', 'I made', 'I fixed', 'I corrected', 'I have', "I've"];
    for (const opener of openers) expect(text(`Kissa istui.\n\n${opener} jotain.`)).toBe('Kissa istui.');
    // a label needs its punctuation, and "Muutinpa" is another word
    expect(text('Kissa istui.\n\nMuutokset olivat suuria.')).toBe('Kissa istui.\n\nMuutokset olivat suuria.');
    expect(text('Kissa istui.\n\nMuutinpa mieleni.')).toBe('Kissa istui.\n\nMuutinpa mieleni.');
  });

  test('a last paragraph that is in the original text is kept, however it begins', () => {
    const original = 'Hän lähti.\n\nMuutin Helsinkiin keväällä.';
    expect(text('Hän lähti pois.\n\nMuutin Helsinkiin keväällä.', { original })).toBe('Hän lähti pois.\n\nMuutin Helsinkiin keväällä.');
    expect(text('Hän lähti pois.\n\n***', { original: 'Hän lähti.\n\n***' })).toBe('Hän lähti pois.\n\n***');
  });

  test('the only block is never dropped as a remark', () => {
    expect(text('Muutin Helsinkiin keväällä.')).toBe('Muutin Helsinkiin keväällä.');
    expect(text('---')).toBe('---');
  });

  test('inside tags nothing is guessed: a preface and a remark there are text', () => {
    expect(text('<teksti>Tässä ovat syyt:\n\nMuutin Helsinkiin keväällä.</teksti>')).toBe('Tässä ovat syyt:\n\nMuutin Helsinkiin keväällä.');
  });
});

describe('cleanModelOutput: code fences and quotation marks', () => {
  test('a single fenced block of a reply without tags is the text', () => {
    expect(cleanModelOutput('Tässä korjattu teksti:\n```\nKissa istui.\n```\nMuutin pilkun.')).toMatchObject({ text: 'Kissa istui.', notes: ['fence'] });
  });

  test('a fence inside the tags is removed', () => {
    expect(cleanModelOutput('<teksti>\n```markdown\nKissa istui.\n```\n</teksti>')).toMatchObject({ text: 'Kissa istui.', complete: true, notes: ['tags', 'fence'] });
  });

  test('quotation marks the model wrapped the whole text in are removed, the author\'s own are kept', () => {
    expect(cleanModelOutput('<teksti>"Kissa istui."</teksti>', { original: 'Kissa istuu.' })).toMatchObject({ text: 'Kissa istui.', notes: ['tags', 'quotes'] });
    expect(text('<teksti>”Kissa istui.”</teksti>', { original: '”Kissa istuu.”' })).toBe('”Kissa istui.”');
    expect(text('<teksti>"Kissa istui."</teksti>')).toBe('"Kissa istui."');
    // the author's marks stay when the model changed their style
    expect(text('<teksti>”Kissa istui.”</teksti>', { original: '"Kissa istui."' })).toBe('”Kissa istui.”');
    expect(text('<teksti>"Kissa istui."</teksti>', { original: '”Kissa istui.”' })).toBe('"Kissa istui."');
    expect(text('<teksti>”Tule tänne!”</teksti>', { original: '»Tule tänne!»' })).toBe('”Tule tänne!”');
    expect(text('<teksti>”Tule tänne!”</teksti>', { original: '„Tule tänne!“' })).toBe('”Tule tänne!”');
    // a mark at only one end of the original does not make the model's pair around it the author's
    expect(text('<teksti>”"Tule", hän sanoi.”</teksti>', { original: '"Tule", hän sanoi.' })).toBe('"Tule", hän sanoi.');
    expect(text('<teksti>"Hän sanoi: ”Tule.”"</teksti>', { original: 'Hän sanoi: ”Tule.”' })).toBe('Hän sanoi: ”Tule.”');
  });

  // Cases beyond the named list

  test('a tilde fence and a fence that never closes are unwrapped too', () => {
    expect(text('<teksti>~~~\nKissa istui.\n~~~</teksti>')).toBe('Kissa istui.');
    expect(cleanModelOutput('<teksti>```\nKissa istui ja kats')).toMatchObject({ text: 'Kissa istui ja kats', complete: false, notes: ['tags', 'fence'] });
    expect(text('```text\nKissa istui.', { tag: null })).toBe('Kissa istui.');
    expect(text('<teksti>```</teksti>')).toBe('');
  });

  test('a fence is a line of its own: a text that only starts with three backticks is text', () => {
    expect(text('<teksti>```Kissa istui.\nToka rivi.</teksti>')).toBe('```Kissa istui.\nToka rivi.');
    expect(text('<teksti>~~~yli~~ jäi\nToka rivi.</teksti>')).toBe('~~~yli~~ jäi\nToka rivi.');
  });

  // Final polish round 1: the answer of a write-at-cursor request as it arrived (the text,
  // then a fence run on the same last line). The three backticks went into the draft.
  test('a fence run left alone at the end of the text is removed', () => {
    const observed = '<teksti>Hän veti henkeä, ja asema tuoksui märältä kiveltä, Aino sanoi ja astui ulos laiturille. ```\n\n</teksti>';
    expect(cleanModelOutput(observed)).toMatchObject({
      text: 'Hän veti henkeä, ja asema tuoksui märältä kiveltä, Aino sanoi ja astui ulos laiturille.',
      complete: true,
      notes: ['tags', 'fence']
    });
    expect(cleanModelOutput('<teksti>Kissa istui.\n```\n</teksti>')).toMatchObject({ text: 'Kissa istui.', notes: ['tags', 'fence'] });
    expect(text('<teksti>Kissa istui. ~~~</teksti>')).toBe('Kissa istui.');
    expect(text('Kissa istui. ```', { tag: null })).toBe('Kissa istui.');
    // an opening fence line and a closing run on the last text line
    expect(text('<teksti>```\nKissa istui. ```</teksti>')).toBe('Kissa istui.');
    // a run at the very start, when a space parts it from the text
    expect(text('<teksti>``` Kissa istui. ```</teksti>')).toBe('Kissa istui.');
    expect(text('<teksti>```text Kissa istui.</teksti>')).toBe('Kissa istui.');
  });

  test('a fence run that has its pair in the text, or that the author wrote, stays', () => {
    expect(text('<teksti>Eka:\n```\nA\n```</teksti>')).toBe('Eka:\n```\nA\n```');
    expect(text('<teksti>Koodi: ```</teksti>', { original: 'Koodi: ```' })).toBe('Koodi: ```');
    expect(text('<teksti>Näin: ``` a ```</teksti>')).toBe('Näin: ``` a ```');
  });

  test('two fenced blocks, or text after a fence inside tags, are left as they are', () => {
    const two = 'Eka:\n```\nA\n```\nToka:\n```\nB\n```';
    expect(text(two, { tag: null })).toBe(two);
    expect(text('<teksti>```\nA\n```\nloppu</teksti>')).toBe('```\nA\n```\nloppu');
  });

  test('a fenced block wins over the chatter rules and is taken as it is', () => {
    expect(text('Sure:\n```\nMuutin Helsinkiin keväällä.\n\nKerro, jos tulet.\n```\nLet me know!')).toBe('Muutin Helsinkiin keväällä.\n\nKerro, jos tulet.');
  });

  test('every pair of wrapping marks: "…", ”…”, “…”, «…» and »…»', () => {
    const original = 'Kissa istuu.';
    for (const [open, close] of [['"', '"'], ['”', '”'], ['“', '”'], ['«', '»'], ['»', '»']]) {
      expect(text(`<teksti>${open}Kissa istui.${close}</teksti>`, { original })).toBe('Kissa istui.');
    }
  });

  test('marks are kept when the same mark is inside, or when the original starts or ends with it', () => {
    expect(text('<teksti>”Tule”, hän sanoi, ”nyt.”</teksti>', { original: 'Tule, hän sanoi, nyt.' })).toBe('”Tule”, hän sanoi, ”nyt.”');
    expect(text('<teksti>”Tule nyt.”</teksti>', { original: '”Tule', })).toBe('”Tule nyt.”');
    expect(text('<teksti>”Tule nyt.”</teksti>', { original: 'hän sanoi: ”Tule.”' })).toBe('”Tule nyt.”');
    // a different pair inside does not protect the outer one
    expect(text('<teksti>"Hän sanoi ”tule” ja lähti."</teksti>', { original: 'Hän sanoi ”tule” ja lähti.' })).toBe('Hän sanoi ”tule” ja lähti.');
  });
});

describe('cleanModelOutput: the edges of the selection', () => {
  test('spaces and line breaks at the edges are those of the original, whatever the model returned', () => {
    expect(text('<teksti>Kissa istui.</teksti>', { original: '  Kissa istuu.\n' })).toBe('  Kissa istui.\n');
    expect(text('<teksti>\n\nKissa istui. \n</teksti>', { original: 'Kissa istuu.' })).toBe('Kissa istui.');
  });

  // Cases beyond the named list

  test('an empty text gets no edges, and an original of spaces only gives them once', () => {
    expect(cleanModelOutput('<teksti></teksti>', { original: '  Kissa istuu.\n' })).toMatchObject({ text: '', complete: false });
    expect(text('<teksti>Kissa.</teksti>', { original: ' \n ' })).toBe(' \n Kissa.');
    expect(text('<teksti>Kissa.</teksti>', { original: '' })).toBe('Kissa.');
  });

  test('the edges are restored on an unfinished and on an untagged reply too', () => {
    expect(cleanModelOutput('<teksti>Kissa is', { original: '\tKissa istuu. ' })).toMatchObject({ text: '\tKissa is ', complete: false });
    expect(text('Kissa istui.', { original: ' Kissa istuu.', tag: null })).toBe(' Kissa istui.');
  });
});

describe('cleanModelOutput: while a reply is streaming', () => {
  test('gives the text that has arrived so far', () => {
    expect(cleanModelOutput('<teksti>Kissa is')).toMatchObject({ text: 'Kissa is', complete: false });
    expect(cleanModelOutput('<tek')).toMatchObject({ complete: false });
  });

  // Cases beyond the named list

  test('every beginning of a reply gives a beginning of the text, never a piece of a tag', () => {
    const inner = 'Kissa istui, ja koira nukkui.';
    const reply = `<teksti>\n${inner}\n</teksti>`;
    for (let length = 0; length <= reply.length; length++) {
      const result = cleanModelOutput(reply.slice(0, length));
      expect(result.complete).toBe(length === reply.length);
      expect(inner.startsWith(result.text)).toBe(true);
    }
    expect(cleanModelOutput('<tek')).toEqual({ text: '', complete: false, hadOpenTag: false, hadCloseTag: false, notes: [] });
    expect(cleanModelOutput('Kissa istui.</tek')).toEqual({ text: 'Kissa istui.', complete: false, hadOpenTag: false, hadCloseTag: false, notes: [] });
    expect(cleanModelOutput('<teksti')).toMatchObject({ text: '', hadOpenTag: false });
    expect(cleanModelOutput('<teksti>')).toMatchObject({ text: '', hadOpenTag: true, complete: false });
  });

  test('with reasoning in front, complete still turns true only with the closing tag', () => {
    const reply = '<think>Korjaan pilkun.</think>\n<teksti>\nKissa istui, ja koira nukkui.\n</teksti>';
    for (let length = 0; length <= reply.length; length++) {
      const result = cleanModelOutput(reply.slice(0, length));
      expect(result.complete).toBe(length === reply.length);
      expect(result.text).not.toContain('</');
    }
  });

  test('a piece of the opening tag is cut only before any opening tag; inside the text it stays', () => {
    expect(text('<teksti>Kirjoita tagi <tek')).toBe('Kirjoita tagi <tek');
    expect(text('En voi auttaa <te')).toBe('En voi auttaa');
    expect(text('Kissa istui.', { tag: null })).toBe('Kissa istui.');
    expect(text('Pienempi kuin <te', { tag: null })).toBe('Pienempi kuin <te');
  });

  test('the notes list what was removed, in the order applied', () => {
    const result = cleanModelOutput('<think>a</think><teksti>```\n"Kissa istui."\n```</teksti>', { original: 'Kissa istuu.' });
    expect(result).toEqual({ text: 'Kissa istui.', complete: true, hadOpenTag: true, hadCloseTag: true, notes: ['thinking', 'tags', 'fence', 'quotes'] });
    expect(cleanModelOutput('Toki, tässä:\nKissa istui.\n\nMuutin pilkun.').notes).toEqual(['preface', 'trailing']);
  });
});
