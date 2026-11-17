/**
 * @jest-environment node
 */
const { EventEmitter } = require('events');
const fs = require('fs');
const {
  createVoikko,
  parseSpellOutput,
  parseGrammarOutput,
  parseSuggestions,
  codePointToUtf16,
  sanitizeLine,
  CANDIDATE_DIRS,
  GC_ARG_SETS
} = require('../../utils/voikko');

// Fixtures are hand-written strings in the documented output formats of
// voikkospell and voikkogc; nothing here starts a real program

const PROBE_OK = 'C: onkohan\nA(onkohan):1:BASEFORM=olla\nA(onkohan):1:CLASS=teonsana\n';
const GC_OK = '-\n';

// A stand-in for child_process.spawn. respond(call) decides what the "tool"
// prints: { stdout, stderr, code }, { hang: true } or { error }
function fakeSpawn(respond) {
  const calls = [];
  const spawn = (file, args, options) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killed = false;
    child.kill = () => {
      child.killed = true;
    };
    const call = { file, args, options, input: null, child };
    calls.push(call);
    child.stdin = {
      on() {},
      end(data) {
        call.input = data ? data.toString('utf8') : '';
        const reply = respond(call) || {};
        if (reply.hang) return;
        setImmediate(() => {
          if (reply.error) {
            child.emit('error', reply.error);
            return;
          }
          if (reply.stdout) child.stdout.emit('data', Buffer.from(reply.stdout, 'utf8'));
          if (reply.stderr) child.stderr.emit('data', Buffer.from(reply.stderr, 'utf8'));
          child.emit('close', reply.code === undefined ? 0 : reply.code);
        });
      }
    };
    return child;
  };
  return { spawn, calls };
}

// A stand-in for fs.promises.access: only the listed files exist
function fakeAccess(files) {
  const seen = [];
  const access = async (file, mode) => {
    seen.push([file, mode]);
    if (!files.includes(file)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  };
  return { access, seen };
}

// A machine with Voikko in /opt/homebrew/bin; `tools` overrides single answers
function installed(tools = {}, extra = {}) {
  const respond = (call) => {
    const name = call.file.split('/').pop();
    if (name === 'voikkospell' && call.args.includes('--version')) {
      return tools.version ? tools.version(call) : { stdout: 'voikkospell: libvoikko version 4.3.2\n' };
    }
    if (name === 'voikkospell' && call.input === 'onkohan\n') {
      return tools.probe ? tools.probe(call) : { stdout: PROBE_OK };
    }
    if (name === 'voikkospell') return tools.spell ? tools.spell(call) : { stdout: '' };
    if (name === 'voikkogc' && call.input === 'Tämä on testi.\n') {
      return tools.gcProbe ? tools.gcProbe(call) : { stdout: GC_OK };
    }
    if (name === 'voikkogc') return tools.gc ? tools.gc(call) : { stdout: '' };
    return { code: 127 };
  };
  const { spawn, calls } = fakeSpawn(respond);
  const { access, seen } = fakeAccess(extra.files || ['/opt/homebrew/bin/voikkospell', '/opt/homebrew/bin/voikkogc']);
  const voikko = createVoikko({ spawn, access, env: extra.env || { PATH: '/usr/bin:/bin' }, platform: extra.platform || 'darwin' });
  return { voikko, calls, seen };
}

describe('constants', () => {
  test('the candidate folders and the voikkogc argument lists', () => {
    expect(CANDIDATE_DIRS).toEqual(['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin', '/usr/bin']);
    expect(GC_ARG_SETS).toEqual([
      ['explanation_language=fi', 'accept_titles=1', 'accept_unfinished_paragraphs=1', 'accept_bulleted_lists=1'],
      ['explanation_language=fi'],
      []
    ]);
  });
});

describe('parsers', () => {
  test('parseSpellOutput reads a known word with two analyses', () => {
    const out = [
      'C: kuusi',
      'A(kuusi):1:BASEFORM=kuusi',
      'A(kuusi):1:CLASS=nimisana',
      'A(kuusi):2:BASEFORM=kuusi',
      'A(kuusi):2:CLASS=lukusana',
      'A(kuusi):2:WORDBASES=+kuusi(kuusi)',
      ''
    ].join('\n');
    const words = parseSpellOutput(out);
    expect([...words.keys()]).toEqual(['kuusi']);
    expect(words.get('kuusi')).toEqual({
      known: true,
      analyses: [
        { BASEFORM: 'kuusi', CLASS: 'nimisana' },
        { BASEFORM: 'kuusi', CLASS: 'lukusana', WORDBASES: '+kuusi(kuusi)' }
      ],
      suggestions: []
    });
  });

  test('parseSpellOutput reads an unknown word with suggestions', () => {
    const words = parseSpellOutput('W: kisssa\nS: kissa\nS: kissaa\nS: kiissa\nC: koira\nA(koira):1:BASEFORM=koira\n');
    expect(words.get('kisssa')).toEqual({ known: false, analyses: [], suggestions: ['kissa', 'kissaa', 'kiissa'] });
    expect(words.get('koira')).toEqual({ known: true, analyses: [{ BASEFORM: 'koira' }], suggestions: [] });
    // Lines before the first word, and lines in no known form, are ignored
    expect(parseSpellOutput('S: orpo\nA(x):1:K=v\nroskaa\n').size).toBe(0);
    expect(parseSpellOutput('').size).toBe(0);
    expect(parseSpellOutput(undefined).size).toBe(0);
  });

  test('parseSpellOutput handles words with ä, ö and a hyphen', () => {
    const out = 'C: äidinkieli\r\nA(äidinkieli):1:BASEFORM=äidinkieli\r\nW: yö-öljy\r\nS: yööljy\r\nC: Marja-Liisa\r\nC: maa-\r\n';
    const words = parseSpellOutput(out);
    expect([...words.keys()]).toEqual(['äidinkieli', 'yö-öljy', 'Marja-Liisa', 'maa-']);
    expect(words.get('äidinkieli').analyses).toEqual([{ BASEFORM: 'äidinkieli' }]);
    expect(words.get('yö-öljy')).toEqual({ known: false, analyses: [], suggestions: ['yööljy'] });
    expect(words.get('Marja-Liisa').known).toBe(true);
  });

  test('parseGrammarOutput splits paragraphs on the - line', () => {
    const out = [
      '[code=8, level=0, descr="", stpos=4, len=7, suggs={"on"}] (Sana on kirjoitettu kahteen kertaan.)',
      '-',
      '-',
      '[code=2, level=0, descr="", stpos=3, len=2, suggs={" "}] (Poista ylimääräinen väli.)',
      '[code=1, level=0, descr="", stpos=10, len=5, suggs={}]',
      '-',
      ''
    ].join('\n');
    const paragraphs = parseGrammarOutput(out);
    expect(paragraphs.map(errors => errors.length)).toEqual([1, 0, 2]);
    expect(paragraphs[2].map(error => error.code)).toEqual([2, 1]);
  });

  test('parseGrammarOutput reads code, position, length, suggestions and the explanation', () => {
    const out = '[code=8, level=0, descr="", stpos=4, len=7, suggs={"on","olla"}] (Sana on kirjoitettu kahteen kertaan.)\r\n-\r\n';
    expect(parseGrammarOutput(out)).toEqual([[
      { code: 8, startCp: 4, lengthCp: 7, suggestions: ['on', 'olla'], explanation: 'Sana on kirjoitettu kahteen kertaan.' }
    ]]);
    // Without an explanation and without suggestions
    expect(parseGrammarOutput('[code=9, level=0, descr="", stpos=0, len=3, suggs={}]\n-\n'))
      .toEqual([[{ code: 9, startCp: 0, lengthCp: 3, suggestions: [], explanation: '' }]]);
  });

  test('parseGrammarOutput returns an empty list for a clean paragraph', () => {
    expect(parseGrammarOutput('-\n')).toEqual([[]]);
    expect(parseGrammarOutput('Tämä on testi.\n-\n-\n')).toEqual([[], []]);
    expect(parseGrammarOutput('')).toEqual([]);
  });

  test('parseSuggestions handles none, one and several', () => {
    expect(parseSuggestions('')).toEqual([]);
    expect(parseSuggestions('"kissa"')).toEqual(['kissa']);
    expect(parseSuggestions('"kissa","kisa","kissä"')).toEqual(['kissa', 'kisa', 'kissä']);
    expect(parseSuggestions('" "')).toEqual([' ']);
    expect(parseSuggestions(undefined)).toEqual([]);
  });

  test('codePointToUtf16 is the identity for BMP text and shifts after an emoji', () => {
    const plain = 'Äiti söi åtta päärynää.';
    for (const index of [0, 1, 5, 12, plain.length]) expect(codePointToUtf16(plain, index)).toBe(index);

    const emoji = 'Hei 😀 äiti';
    expect(codePointToUtf16(emoji, 4)).toBe(4);
    expect(codePointToUtf16(emoji, 5)).toBe(6);
    expect(codePointToUtf16(emoji, 6)).toBe(7);
    expect(emoji.slice(codePointToUtf16(emoji, 6), codePointToUtf16(emoji, 10))).toBe('äiti');
    // Past the end: the end
    expect(codePointToUtf16('ab', 9)).toBe(2);
  });

  test('sanitizeLine removes line breaks and tabs', () => {
    expect(sanitizeLine('  sana\tja\r\ntoinen\nrivi  ')).toBe('sana ja  toinen rivi');
    expect(sanitizeLine('äöå')).toBe('äöå');
    expect(sanitizeLine('')).toBe('');
    expect(sanitizeLine(undefined)).toBe('');
    expect(sanitizeLine('a'.repeat(300), 200)).toHaveLength(200);
    expect(sanitizeLine('a'.repeat(300))).toHaveLength(300);
  });
});

describe('detect', () => {
  test('detect reports not-found when no directory has voikkospell', async () => {
    const { voikko, calls, seen } = installed({}, { files: [], env: { PATH: '/usr/bin:/bin:/oma/polku' } });
    expect(voikko.status()).toBeNull();
    const status = await voikko.detect();
    expect(status).toMatchObject({
      available: false, reason: 'not-found', binDir: null, version: null,
      hasMorphology: false, hasGrammar: false, gcArgs: null
    });
    expect(typeof status.checkedAt).toBe('number');
    expect(calls).toHaveLength(0);
    // The candidate folders first, then PATH, each folder once, asked for an executable
    expect(seen.map(([file]) => file)).toEqual([
      '/opt/homebrew/bin/voikkospell', '/usr/local/bin/voikkospell', '/opt/local/bin/voikkospell',
      '/usr/bin/voikkospell', '/bin/voikkospell', '/oma/polku/voikkospell'
    ]);
    expect(seen.every(([, mode]) => mode === fs.constants.X_OK)).toBe(true);
    expect(voikko.status()).toBe(status);
  });

  test('detect prefers FAUST_VOIKKO_DIR', async () => {
    const { voikko, calls } = installed({}, {
      files: ['/oma/voikko/voikkospell', '/oma/voikko/voikkogc', '/opt/homebrew/bin/voikkospell'],
      env: { FAUST_VOIKKO_DIR: '/oma/voikko', PATH: '/usr/bin' }
    });
    const status = await voikko.detect();
    expect(status).toMatchObject({ available: true, reason: null, binDir: '/oma/voikko', version: '4.3.2', hasMorphology: true, hasGrammar: true });
    expect(calls.every(call => call.file.startsWith('/oma/voikko/'))).toBe(true);
    // The probe is the word "onkohan" through the morphology
    expect(calls[0]).toMatchObject({ file: '/oma/voikko/voikkospell', args: ['-m'], input: 'onkohan\n' });
    expect(calls[1]).toMatchObject({ file: '/oma/voikko/voikkospell', args: ['--version'], input: '' });
  });

  test('detect reports no-dictionary on the initialisation error', async () => {
    const { voikko } = installed({ probe: () => ({ stdout: '', stderr: 'E: Initialization of Voikko failed: No valid dictionaries were found\n', code: 1 }) });
    expect(await voikko.detect()).toMatchObject({ available: false, reason: 'no-dictionary', binDir: '/opt/homebrew/bin', hasGrammar: false, gcArgs: null });

    // Any other failure of the probe: output without the word, a crash, a program that cannot start
    for (const probe of [() => ({ stdout: 'W: onkohan\n' }), () => ({ stdout: '', code: 139 }), () => ({ error: new Error('EACCES') })]) {
      const other = installed({ probe });
      expect(await other.voikko.detect()).toMatchObject({ available: false, reason: 'probe-failed', binDir: '/opt/homebrew/bin' });
    }
  });

  test('detect is available with C: onkohan alone and sets hasMorphology only when an A( line is present', async () => {
    const bare = installed({ probe: () => ({ stdout: 'C: onkohan\n' }) });
    expect(await bare.voikko.detect()).toMatchObject({ available: true, reason: null, hasMorphology: false });

    const full = installed();
    expect(await full.voikko.detect()).toMatchObject({ available: true, hasMorphology: true });

    // A version flag the tool does not know is not an error
    const old = installed({ version: () => ({ stdout: '', stderr: 'Unknown option --version\n', code: 1 }) });
    expect(await old.voikko.detect()).toMatchObject({ available: true, version: null });
  });

  test('detect falls back to a shorter voikkogc argument list on Unknown option', async () => {
    const { voikko, calls } = installed({
      gcProbe: (call) => (call.args.length > 1 ? { stdout: '', stderr: 'Unknown option accept_titles=1\n', code: 1 } : { stdout: GC_OK })
    });
    const status = await voikko.detect();
    expect(status).toMatchObject({ available: true, hasGrammar: true, gcArgs: ['explanation_language=fi'] });
    const gcCalls = calls.filter(call => call.file.endsWith('/voikkogc'));
    expect(gcCalls.map(call => call.args)).toEqual([GC_ARG_SETS[0], GC_ARG_SETS[1]]);
    expect(gcCalls.every(call => call.input === 'Tämä on testi.\n')).toBe(true);

    // No list works, or there is no voikkogc: spelling only
    const none = installed({ gcProbe: () => ({ stdout: '', stderr: 'Unknown option\n', code: 1 }) });
    expect(await none.voikko.detect()).toMatchObject({ available: true, hasGrammar: false, gcArgs: null });
    const missing = installed({}, { files: ['/opt/homebrew/bin/voikkospell'] });
    expect(await missing.voikko.detect()).toMatchObject({ available: true, hasGrammar: false, gcArgs: null });
    expect(missing.calls.some(call => call.file.endsWith('/voikkogc'))).toBe(false);
  });

  test('a voikkogc probe that prints the - line but exits with an error is not accepted', async () => {
    const { voikko, calls } = installed({
      gcProbe: (call) => (call.args.length > 1 ? { stdout: GC_OK, code: 1 } : { stdout: GC_OK })
    });
    expect(await voikko.detect()).toMatchObject({ hasGrammar: true, gcArgs: ['explanation_language=fi'] });
    expect(calls.filter(call => call.file.endsWith('/voikkogc'))).toHaveLength(2);
  });

  test('detect and analyze take null for their options', async () => {
    const { voikko } = installed();
    await expect(voikko.detect(null)).resolves.toMatchObject({ available: true });
    await expect(voikko.analyze(['äiti'], null)).resolves.toHaveLength(1);
  });

  test('detect caches its result until forced', async () => {
    const { voikko, calls } = installed();
    const first = await voikko.detect();
    const count = calls.length;
    expect(count).toBe(3);
    expect(await voikko.detect()).toBe(first);
    expect(await voikko.detect({ force: false })).toBe(first);
    expect(calls).toHaveLength(count);

    const again = await voikko.detect({ force: true });
    expect(again).not.toBe(first);
    expect(again).toMatchObject({ available: true });
    expect(calls).toHaveLength(count * 2);
    expect(voikko.status()).toBe(again);

    // Two calls at the same moment share one run
    const { voikko: fresh, calls: freshCalls } = installed();
    const [a, b] = await Promise.all([fresh.detect(), fresh.detect()]);
    expect(a).toBe(b);
    expect(freshCalls).toHaveLength(3);
  });
});

describe('analyze and grammar', () => {
  test('analyze sends each distinct word once and returns results in input order', async () => {
    const { voikko, calls } = installed({
      spell: () => ({
        stdout: [
          'W: kisssa', 'S: kissa',
          'C: äiti', 'A(äiti):1:BASEFORM=äiti',
          'C: Ainon', 'A(Ainon):1:BASEFORM=Aino', 'A(Ainon):2:BASEFORM=aino'
        ].join('\n')
      })
    });
    const results = await voikko.analyze(['äiti', 'kisssa', 'äiti', '', '  ', 'Ainon', 'ohitettu', 'kisssa\n']);
    const spell = calls[calls.length - 1];
    expect(spell).toMatchObject({ file: '/opt/homebrew/bin/voikkospell', args: ['-m'], input: 'äiti\nkisssa\nAinon\nohitettu\n' });
    expect(results).toEqual([
      { word: 'äiti', known: true, analyses: [{ BASEFORM: 'äiti' }], suggestions: [] },
      { word: 'kisssa', known: false, analyses: [], suggestions: ['kissa'] },
      { word: 'Ainon', known: true, analyses: [{ BASEFORM: 'Aino' }, { BASEFORM: 'aino' }], suggestions: [] },
      // A word the tool said nothing about
      { word: 'ohitettu', known: false, analyses: [], suggestions: [] }
    ]);

    // Suggestions are asked for with -s; no words, no program
    await voikko.analyze(['äiti'], { suggest: true });
    expect(calls[calls.length - 1].args).toEqual(['-m', '-s']);
    const before = calls.length;
    expect(await voikko.analyze([])).toEqual([]);
    expect(await voikko.analyze(['', ' \t'])).toEqual([]);
    expect(calls).toHaveLength(before);
  });

  test('analyze cuts a word at 200 characters and sends at most 50 000 words', async () => {
    const { voikko, calls } = installed();
    await voikko.analyze(['ä'.repeat(500)]);
    expect(calls[calls.length - 1].input).toBe(`${'ä'.repeat(200)}\n`);

    const many = Array.from({ length: 50010 }, (unused, index) => `sana${index}`);
    const results = await voikko.analyze(many);
    expect(results).toHaveLength(50000);
    expect(calls[calls.length - 1].input.split('\n')).toHaveLength(50001);
  });

  test('analyze passes a UTF-8 locale to the child process', async () => {
    const mac = installed({}, { env: { PATH: '/usr/bin', LANG: 'fi_FI', HOME: '/Users/kirjailija' } });
    await mac.voikko.analyze(['äiti']);
    for (const call of mac.calls) {
      expect(call.options.env).toMatchObject({ LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8', HOME: '/Users/kirjailija', PATH: '/usr/bin' });
      // Never through a shell: the arguments are constants and the text goes through stdin
      expect(call.options.shell).toBe(false);
      expect(call.options.stdio).toEqual(['pipe', 'pipe', 'pipe']);
    }
    expect(mac.calls[mac.calls.length - 1].args).toEqual(['-m']);

    const linux = installed({}, { platform: 'linux' });
    await linux.voikko.analyze(['äiti']);
    expect(linux.calls[0].options.env).toMatchObject({ LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8' });
  });

  test('grammar skips blank and over-long paragraphs and keeps the result aligned', async () => {
    const { voikko, calls } = installed({
      gc: () => ({
        stdout: [
          '[code=8, level=0, descr="", stpos=4, len=5, suggs={"on"}] (Sana on kirjoitettu kahteen kertaan.)',
          '-',
          '-',
          '[code=2, level=0, descr="", stpos=5, len=2, suggs={" "}] (Poista ylimääräinen väli.)',
          '-'
        ].join('\n')
      })
    });
    const long = 'a'.repeat(100001);
    const results = await voikko.grammar(['Hän on on täällä.', '', 'Puhdas kappale.', long, '   ', '  😀 Hei  äiti.']);

    const gc = calls[calls.length - 1];
    expect(gc.file).toBe('/opt/homebrew/bin/voikkogc');
    expect(gc.args).toEqual(GC_ARG_SETS[0]);
    expect(gc.input).toBe('Hän on on täällä.\nPuhdas kappale.\n😀 Hei  äiti.\n');

    expect(results).toHaveLength(6);
    expect(results[0]).toEqual([{ code: 8, start: 4, end: 9, suggestions: ['on'], explanation: 'Sana on kirjoitettu kahteen kertaan.' }]);
    expect(results.slice(1, 5)).toEqual([[], [], [], []]);
    // Code points become UTF-16 offsets in the paragraph as it was given: two spaces of
    // indentation were cut before sending, and the emoji is two UTF-16 units
    expect(results[5]).toEqual([{ code: 2, start: 8, end: 10, suggestions: [' '], explanation: 'Poista ylimääräinen väli.' }]);
    expect('  😀 Hei  äiti.'.slice(8, 10)).toBe('  ');

    // Nothing to send: no program is started
    const before = calls.length;
    expect(await voikko.grammar(['', '  '])).toEqual([[], []]);
    expect(await voikko.grammar([])).toEqual([]);
    expect(calls).toHaveLength(before);
  });

  test('a tool that exits with an error rejects instead of reporting every word unknown or a clean text', async () => {
    const { voikko } = installed({
      spell: () => ({ stdout: '', stderr: 'Segmentation fault\n', code: 1 }),
      gc: () => ({ stdout: '-\n', code: 139 })
    });
    await expect(voikko.analyze(['äiti', 'isä'])).rejects.toThrow('Voikko-ohjelma päättyi virheeseen');
    await expect(voikko.grammar(['Kappale.'])).rejects.toThrow('Voikko-ohjelma päättyi virheeseen');
    // A child killed by a signal has the code null
    const killed = installed({ spell: () => ({ stdout: 'C: äiti\n', code: null }) });
    await expect(killed.voikko.analyze(['äiti'])).rejects.toThrow('Voikko-ohjelma päättyi virheeseen');
  });

  test('output over 32 MB kills the child and rejects', async () => {
    const big = 'C: sana\n'.repeat(Math.ceil((32 * 1024 * 1024 + 10) / 8));
    const { voikko, calls } = installed({ spell: () => ({ stdout: big }) });
    await expect(voikko.analyze(['sana'])).rejects.toThrow('output too large');
    expect(calls[calls.length - 1].child.killed).toBe(true);
  });

  test('analyze rejects when Voikko is not available', async () => {
    const { voikko, calls } = installed({}, { files: [] });
    await expect(voikko.analyze(['äiti'])).rejects.toThrow('Voikko ei ole käytettävissä');
    await expect(voikko.grammar(['Kappale.'])).rejects.toThrow('Voikko ei ole käytettävissä');
    expect(calls).toHaveLength(0);

    // Spelling without voikkogc: analyze works, grammar says the same sentence
    const spellOnly = installed({}, { files: ['/opt/homebrew/bin/voikkospell'] });
    await expect(spellOnly.voikko.analyze(['äiti'])).resolves.toHaveLength(1);
    await expect(spellOnly.voikko.grammar(['Kappale.'])).rejects.toThrow('Voikko ei ole käytettävissä');
  });

  test('a timeout kills the child and rejects', async () => {
    const { voikko, calls } = installed({ spell: () => ({ hang: true }) });
    await voikko.detect();

    jest.useFakeTimers();
    try {
      const pending = voikko.analyze(['äiti']);
      const outcome = expect(pending).rejects.toThrow('timeout');
      await jest.advanceTimersByTimeAsync(59999);
      const child = calls[calls.length - 1].child;
      expect(child.killed).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      await outcome;
      expect(child.killed).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  test('a probe that never answers is a failed probe, not a hang', async () => {
    const { voikko, calls } = installed({ probe: () => ({ hang: true }) });
    jest.useFakeTimers();
    try {
      const pending = voikko.detect();
      await jest.advanceTimersByTimeAsync(5000);
      expect(await pending).toMatchObject({ available: false, reason: 'probe-failed' });
      expect(calls[0].child.killed).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
