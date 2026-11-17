/**
 * Voikko, the Finnish spelling and grammar checker (main process)
 *
 * Nothing is bundled and there is no native binding: the command-line tools
 * voikkospell and voikkogc are started if they exist on the machine
 * ("brew install libvoikko"). Without them detect() says so and the feature
 * stays greyed out.
 *
 * Arguments are constants. Manuscript text only ever travels through stdin.
 * The parsers are pure functions (test/utils/voikko.test.js).
 */
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const CANDIDATE_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin', '/usr/bin'];

// voikkogc options differ between versions: try the full list first
const GC_ARG_SETS = [
  ['explanation_language=fi', 'accept_titles=1', 'accept_unfinished_paragraphs=1', 'accept_bulleted_lists=1'],
  ['explanation_language=fi'],
  []
];

const MAX_STDOUT_BYTES = 32 * 1024 * 1024;
const MAX_STDERR_BYTES = 64 * 1024;
const MAX_WORDS = 50000;
const MAX_WORD_LENGTH = 200;
const MAX_PARAGRAPH_LENGTH = 100000;
const PROBE_TIMEOUT_MS = 5000;
const VERSION_TIMEOUT_MS = 3000;
const WORK_TIMEOUT_MS = 60000;
const UNAVAILABLE = 'Voikko ei ole käytettävissä';
const TOOL_FAILED = 'Voikko-ohjelma päättyi virheeseen';

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** One line for a tool that reads line by line: tabs and line breaks become spaces. */
function sanitizeLine(text, maxLength) {
  const line = String(text == null ? '' : text).replace(/[\t\r\n]/g, ' ').trim();
  return Number.isFinite(maxLength) && line.length > maxLength ? line.slice(0, maxLength) : line;
}

/** UTF-16 offset of the cpIndex-th code point (they differ after an emoji). */
function codePointToUtf16(text, cpIndex) {
  const value = String(text == null ? '' : text);
  let offset = 0;
  for (let seen = 0; seen < cpIndex && offset < value.length; seen++) {
    offset += value.codePointAt(offset) > 0xffff ? 2 : 1;
  }
  return offset;
}

/** The inside of suggs={…}: "a","b" → ['a', 'b']. */
function parseSuggestions(inner) {
  const value = String(inner == null ? '' : inner);
  if (value === '') return [];
  return value.replace(/^"/, '').replace(/"$/, '').split('","');
}

/**
 * Output of "voikkospell -m [-s]".
 * "C: word" starts a known word, "W: word" an unknown one, "S: …" is a
 * suggestion for the latest word and "A(word):n:KEY=value" one field of its
 * n-th analysis.
 * @returns {Map<string, {known: boolean, analyses: Array<Record<string, string>>, suggestions: string[]}>}
 */
function parseSpellOutput(stdout) {
  const words = new Map();
  let current = null;

  for (const rawLine of String(stdout == null ? '' : stdout).split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    let match;
    if ((match = /^([CW]): (.*)$/.exec(line))) {
      current = { known: match[1] === 'C', analyses: [], suggestions: [] };
      words.set(match[2], current);
    } else if (!current) {
      continue;
    } else if ((match = /^S: (.*)$/.exec(line))) {
      current.suggestions.push(match[1]);
    } else if ((match = /^A\((.*)\):(\d+):([^=:]+)=(.*)$/.exec(line))) {
      const index = Number(match[2]) - 1;
      if (index < 0) continue;
      while (current.analyses.length <= index) current.analyses.push({});
      current.analyses[index][match[3]] = match[4];
    }
  }
  return words;
}

const GC_ERROR = /^\[code=(\d+), level=\d+, descr="[^"]*", stpos=(\d+), len=(\d+), suggs=\{(.*)\}\](?: \((.*)\))?$/;

/**
 * Output of voikkogc: error lines, and a line "-" after every paragraph.
 * Positions are code points in the paragraph.
 * @returns {Array<Array<{code: number, startCp: number, lengthCp: number, suggestions: string[], explanation: string}>>}
 */
function parseGrammarOutput(stdout) {
  const paragraphs = [];
  let current = [];

  for (const rawLine of String(stdout == null ? '' : stdout).split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (line === '-') {
      paragraphs.push(current);
      current = [];
      continue;
    }
    const match = GC_ERROR.exec(line);
    if (!match) continue;
    current.push({
      code: Number(match[1]),
      startCp: Number(match[2]),
      lengthCp: Number(match[3]),
      suggestions: parseSuggestions(match[4]),
      explanation: match[5] || ''
    });
  }
  return paragraphs;
}

// ---------------------------------------------------------------------------
// The tools
// ---------------------------------------------------------------------------

const makeStatus = (fields) => ({
  available: false,
  reason: null,
  binDir: null,
  version: null,
  hasMorphology: false,
  hasGrammar: false,
  gcArgs: null,
  checkedAt: Date.now(),
  ...fields
});

/**
 * @param {{spawn?: Function, access?: Function, env?: object, platform?: string}} [overrides]
 *   replaceable so that tests run without Voikko
 * @returns {{detect: Function, status: Function, analyze: Function, grammar: Function}}
 */
function createVoikko(overrides = {}) {
  const spawn = overrides.spawn || childProcess.spawn;
  const access = overrides.access || fs.promises.access;
  const env = overrides.env || process.env;
  const platform = overrides.platform || process.platform;

  // The tools convert stdin with the process locale, and an app started from Finder has none
  const locale = platform === 'darwin' ? 'en_US.UTF-8' : 'C.UTF-8';

  let cached = null;
  let detecting = null;

  /** Run one tool: text in through stdin, { code, stdout, stderr } out. */
  function run(file, args, input, timeoutMs) {
    return new Promise((resolve, reject) => {
      let child;
      try {
        child = spawn(file, args, {
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...env, LC_ALL: locale, LANG: locale }
        });
      } catch (error) {
        reject(error);
        return;
      }

      const stdout = [];
      const stderr = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let settled = false;

      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(result);
      };
      const kill = () => {
        try {
          child.kill('SIGKILL');
        } catch (error) {
          // The process is already gone
        }
      };
      const timer = setTimeout(() => {
        kill();
        finish(new Error('timeout'));
      }, timeoutMs);

      child.on('error', (error) => finish(error));
      child.on('close', (code) => finish(null, {
        code,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8')
      }));

      child.stdout.on('data', (chunk) => {
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8');
        stdoutBytes += data.length;
        if (stdoutBytes > MAX_STDOUT_BYTES) {
          kill();
          finish(new Error('output too large'));
          return;
        }
        stdout.push(data);
      });
      child.stderr.on('data', (chunk) => {
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8');
        if (stderrBytes >= MAX_STDERR_BYTES) return;
        stderrBytes += data.length;
        stderr.push(data);
      });

      // A tool that exits early closes its stdin: that is its answer, not our error
      child.stdin.on('error', () => {});
      child.stdin.end(Buffer.from(input, 'utf8'));
    });
  }

  async function isExecutable(file) {
    try {
      await access(file, fs.constants.X_OK);
      return true;
    } catch (error) {
      return false;
    }
  }

  function searchDirs() {
    const separator = platform === 'win32' ? ';' : ':';
    const dirs = [env.FAUST_VOIKKO_DIR, ...CANDIDATE_DIRS, ...String(env.PATH || '').split(separator)];
    return [...new Set(dirs.filter(dir => typeof dir === 'string' && dir.trim() !== ''))];
  }

  async function probe() {
    let binDir = null;
    for (const dir of searchDirs()) {
      if (await isExecutable(path.join(dir, 'voikkospell'))) {
        binDir = dir;
        break;
      }
    }
    if (!binDir) return makeStatus({ reason: 'not-found' });

    const voikkospell = path.join(binDir, 'voikkospell');

    // The Homebrew formula's own test: one word through the morphology
    let probed;
    try {
      probed = await run(voikkospell, ['-m'], 'onkohan\n', PROBE_TIMEOUT_MS);
    } catch (error) {
      return makeStatus({ reason: 'probe-failed', binDir });
    }
    const lines = probed.stdout.split('\n').map(line => line.replace(/\r$/, ''));
    if (!lines.includes('C: onkohan')) {
      const noDictionary = probed.stderr.includes('Initialization of Voikko failed');
      return makeStatus({ reason: noDictionary ? 'no-dictionary' : 'probe-failed', binDir });
    }
    const hasMorphology = lines.some(line => line.startsWith('A(onkohan):1:'));

    // Older versions have no --version flag; that is not an error
    let version = null;
    try {
      const out = await run(voikkospell, ['--version'], '', VERSION_TIMEOUT_MS);
      const match = /libvoikko version (\S+)/.exec(`${out.stdout}\n${out.stderr}`);
      version = match ? match[1] : null;
    } catch (error) {
      version = null;
    }

    let gcArgs = null;
    const voikkogc = path.join(binDir, 'voikkogc');
    if (await isExecutable(voikkogc)) {
      for (const args of GC_ARG_SETS) {
        try {
          const out = await run(voikkogc, args, 'Tämä on testi.\n', PROBE_TIMEOUT_MS);
          if (out.code === 0 && out.stdout.split('\n').some(line => line.replace(/\r$/, '') === '-')) {
            gcArgs = [...args];
            break;
          }
        } catch (error) {
          // Try the next, shorter list
        }
      }
    }

    return makeStatus({ available: true, binDir, version, hasMorphology, hasGrammar: gcArgs !== null, gcArgs });
  }

  /** Look for the tools and try them once. The result is kept until force is set. */
  function detect(options) {
    const { force = false } = options || {};
    if (cached && !force) return Promise.resolve(cached);
    if (!detecting) {
      detecting = probe()
        .then((status) => {
          cached = status;
          return status;
        })
        .finally(() => {
          detecting = null;
        });
    }
    return detecting;
  }

  /** The last detect() result, without running anything. */
  function status() {
    return cached;
  }

  async function requireAvailable() {
    const current = cached || await detect();
    if (!current.available) throw new Error(UNAVAILABLE);
    return current;
  }

  /**
   * Spelling and morphology of words. Each distinct word is sent once; the
   * results come back in input order.
   * @returns {Promise<Array<{word: string, known: boolean, analyses: Array<Record<string, string>>, suggestions: string[]}>>}
   */
  async function analyze(words, options) {
    const { suggest = false } = options || {};
    const current = await requireAvailable();

    const distinct = [];
    const seen = new Set();
    for (const word of words || []) {
      const clean = sanitizeLine(word, MAX_WORD_LENGTH);
      if (!clean || seen.has(clean)) continue;
      seen.add(clean);
      distinct.push(clean);
      if (distinct.length >= MAX_WORDS) break;
    }
    if (distinct.length === 0) return [];

    const args = suggest ? ['-m', '-s'] : ['-m'];
    const out = await run(path.join(current.binDir, 'voikkospell'), args, `${distinct.join('\n')}\n`, WORK_TIMEOUT_MS);
    // A tool that crashed has not judged the words: without this every word would be "unknown"
    if (out.code !== 0) throw new Error(TOOL_FAILED);
    const parsed = parseSpellOutput(out.stdout);

    return distinct.map((word) => {
      // A word the tool skipped is reported as unknown, without analyses
      const entry = parsed.get(word) || { known: false, analyses: [], suggestions: [] };
      return { word, known: entry.known, analyses: entry.analyses, suggestions: entry.suggestions };
    });
  }

  /**
   * Grammar errors of paragraphs, one array per paragraph, as UTF-16 offsets
   * in the paragraph that was given. Blank and over-long paragraphs are not
   * sent and get an empty array.
   * @returns {Promise<Array<Array<{code: number, start: number, end: number, suggestions: string[], explanation: string}>>>}
   */
  async function grammar(paragraphs) {
    const current = await requireAvailable();
    if (!current.hasGrammar || !current.gcArgs) throw new Error(UNAVAILABLE);

    const results = (paragraphs || []).map(() => []);
    const sent = [];
    (paragraphs || []).forEach((paragraph, index) => {
      const text = sanitizeLine(paragraph);
      if (!text || text.length > MAX_PARAGRAPH_LENGTH) return;
      // Offsets are reported for the trimmed line: remember what was cut from its start
      const original = String(paragraph == null ? '' : paragraph);
      sent.push({ index, text, lead: original.length - original.trimStart().length });
    });
    if (sent.length === 0) return results;

    const input = `${sent.map(item => item.text).join('\n')}\n`;
    const out = await run(path.join(current.binDir, 'voikkogc'), current.gcArgs, input, WORK_TIMEOUT_MS);
    // A crashed checker found nothing, which is not the same as a clean text
    if (out.code !== 0) throw new Error(TOOL_FAILED);
    const parsed = parseGrammarOutput(out.stdout);

    sent.forEach((item, position) => {
      results[item.index] = (parsed[position] || []).map((error) => ({
        code: error.code,
        start: item.lead + codePointToUtf16(item.text, error.startCp),
        end: item.lead + codePointToUtf16(item.text, error.startCp + error.lengthCp),
        suggestions: error.suggestions,
        explanation: error.explanation
      }));
    });
    return results;
  }

  return { detect, status, analyze, grammar };
}

module.exports = {
  createVoikko,
  parseSpellOutput,
  parseGrammarOutput,
  parseSuggestions,
  codePointToUtf16,
  sanitizeLine,
  CANDIDATE_DIRS,
  GC_ARG_SETS
};
