/**
 * @jest-environment node
 */
// The model trial of 16 Nov 2026 as a test: the stored replies of the four
// models go through Kielenhuolto's own pipeline (parseNumberedLines,
// alignBatch, reviseLine) with the real text modules, and the planted errors
// are counted with the trial's own rule. The figures are the ones the panel
// shows (src/services/ai/proofreadModelNotes.js).
const fs = require('fs');
const path = require('path');
const { PROOFREAD_DEFAULTS, parseNumberedLines, alignBatch, reviseLine } = require('../../src/services/ai/proofreadPass');
const proofreadModelNotes = require('../../src/services/ai/proofreadModelNotes');

const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'test', 'fixtures', 'step0-gateway');
// Order: dsFast, ds, glm, glmFlash
const MODELS = [
  'deepseek-v4.1-flash-abliterated-fast',
  'deepseek-v4.1-flash-abliterated',
  'glm-5.3-abliterated',
  'glm-5.3-flash-abliterated'
];

// What this file needs from the text-module task (P-01): its modules, the
// trial's scoring rule and the trial material
const missing = [];
function load(file, names) {
  try {
    const loaded = require(path.join(ROOT, file));
    for (const name of names) {
      if (typeof loaded[name] !== 'function') missing.push(`${file}: ${name}`);
    }
    return loaded;
  } catch (error) {
    missing.push(`${file} (${error.code || error.message})`);
    return {};
  }
}
const { wordDiff, changeRatio } = load('src/editor/wordDiff.js', ['wordDiff', 'changeRatio']);
const { maskSpans, unmaskSpans } = load('src/services/ai/maskSpans.js', ['maskSpans', 'unmaskSpans']);
const { isFixed } = load('scripts/step0/score.js', ['isFixed']);
for (const file of ['dataset.json', ...MODELS.map(name => path.join('raw', 'v1', `${name}.json`))]) {
  if (!fs.existsSync(path.join(DATA, file))) missing.push(`test/fixtures/step0-gateway/${file}`);
}

// Same canonical form as normaliseModelText: quote, dash and ellipsis variants are one token
const canon = (text) => text.normalize('NFC')
  .replace(/["“”„‟»«]/g, '"')
  .replace(/['‘’‚´`]/g, "'")
  .replace(/[-\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-')
  .replace(/…/g, '...');

let cache = null;

// Every model's replies through the pipeline, computed once
function trial() {
  if (cache) return cache;
  const dataset = JSON.parse(fs.readFileSync(path.join(DATA, 'dataset.json'), 'utf8'));
  const items = new Map(dataset.items.map(item => [item.id, item]));
  const deps = { wordDiff, changeRatio, maskSpans, unmaskSpans };

  cache = MODELS.map((name) => {
    const raw = JSON.parse(fs.readFileSync(path.join(DATA, 'raw', 'v1', `${name}.json`), 'utf8'));
    const lines = [];

    for (const batch of raw.batches) {
      const reply = batch.text || '';
      const open = reply.indexOf('<teksti>');
      const close = reply.lastIndexOf('</teksti>');
      const inner = open === -1 || close < open ? '' : reply.slice(open + '<teksti>'.length, close);

      const batchItems = batch.ids.map(id => items.get(id));
      const proofLines = batchItems.map((item, index) => {
        const mask = maskSpans(item.text);
        return {
          key: `L${index}`, index, from: 0, to: item.text.length, prefix: '',
          text: item.text, masked: mask.text, mask, dialogue: false
        };
      });

      alignBatch(proofLines, parseNumberedLines(inner)).forEach((entry, index) => {
        const item = batchItems[index];
        const outcome = entry.status === 'ok' ? reviseLine(entry.line, entry.revisedMasked, PROOFREAD_DEFAULTS, deps) : null;
        lines.push({
          item,
          aligned: entry.status,
          status: outcome ? outcome.status : null,
          changes: outcome && outcome.status === 'changes' ? outcome.changes : [],
          // What the manuscript line would be with every proposed change accepted
          output: outcome && outcome.status === 'changes' ? outcome.revised : item.text
        });
      });
    }

    const count = (wanted) => lines.reduce((sum, line) => (
      sum + line.item.errors.filter(error => wanted(error) && isFixed(line.output, error)).length
    ), 0);
    return {
      name,
      lines,
      planted: lines.reduce((sum, line) => sum + line.item.errors.length, 0),
      fixed: count(() => true),
      languagePlanted: lines.reduce((sum, line) => sum + line.item.errors.filter(error => error.type !== 'typografia').length, 0),
      languageFixed: count(error => error.type !== 'typografia')
    };
  });
  return cache;
}

const ready = missing.length === 0;
const partial = process.env.FAUST_WIRING_PARTIAL === '1';

if (!ready && !partial) {
  // Not a partial tree: the trial material and the text modules must be there
  describe('the model trial through Kielenhuolto\'s pipeline', () => {
    test('the trial material and the text modules are in the repo', () => {
      expect(missing).toEqual([]);
    });
  });
}

// While the text-module task is not merged the whole file is skipped, and only then
(ready ? describe : describe.skip)('the model trial through Kielenhuolto\'s pipeline', () => {
  test('the stored replies of the trial give 52, 52, 50 and 43 of 57 through the pipeline', () => {
    const models = trial();
    expect(models.map(model => model.name)).toEqual(MODELS);
    expect(models.map(model => model.lines.length)).toEqual([28, 28, 28, 28]);
    expect(models.map(model => model.planted)).toEqual([57, 57, 57, 57]);
    expect(models.map(model => model.fixed)).toEqual([52, 52, 50, 43]);
  });

  test('of the 52 language errors the pipeline keeps 51, 51, 49 and 42', () => {
    const models = trial();
    expect(models.map(model => model.languagePlanted)).toEqual([52, 52, 52, 52]);
    expect(models.map(model => model.languageFixed)).toEqual([51, 51, 49, 42]);
    // These are the figures of the notes file, model by model
    expect(proofreadModelNotes.models.map(model => model.label)).toEqual(MODELS);
    expect(proofreadModelNotes.models.map(model => [model.planted, model.fixed]))
      .toEqual(models.map(model => [model.languagePlanted, model.languageFixed]));
    expect(proofreadModelNotes.models.every(model => model.paragraphs === 28)).toBe(true);
  });

  test('no line of the trial is misaligned or set aside as rewritten, and no placeholder is lost', () => {
    for (const model of trial()) {
      expect(model.lines.filter(line => line.aligned !== 'ok').map(line => `${model.name} ${line.item.id}: ${line.aligned}`)).toEqual([]);
      expect(model.lines.filter(line => !['changes', 'unchanged'].includes(line.status)).map(line => `${model.name} ${line.item.id}: ${line.status}`)).toEqual([]);

      let placeholders = 0;
      for (const line of model.lines) {
        for (const placeholder of Object.keys(line.item.placeholders || {})) {
          placeholders += 1;
          // Still there, and still there once
          expect(line.output.split(placeholder)).toHaveLength(2);
        }
        // A control line and a dialect line without a planted error may still get a change; a line
        // with neither errors nor changes must come out byte for byte
        if (line.status === 'unchanged') expect(line.output).toBe(line.item.text);
      }
      expect(placeholders).toBe(7);
    }
    // The notes file says the same: no rewritten paragraph in any model
    expect(proofreadModelNotes.models.map(model => model.rewritten)).toEqual([0, 0, 0, 0]);
  });

  test('the typographic fixes that only change a quote, dash or ellipsis form are not among the changes', () => {
    for (const model of trial()) {
      const output = (id) => model.lines.find(line => line.item.id === id).output;
      // The manuscript's own form stays: typography is the checker's job
      expect(output('N2')).toContain('1867-1868');
      expect(output('F4')).toContain('"hiljaiseksi huoneeksi"');
      expect(output('F6')).toContain('laatikon - sen');
      // A new space is a real change and survives
      expect(output('N4')).toMatch(/62[ \u00A0]%/);

      for (const line of model.lines) {
        for (const change of line.changes) {
          expect(`${line.item.id}: ${canon(change.original)}`).not.toBe(`${line.item.id}: ${canon(change.insert)}`);
        }
      }

      // Of the five typographic errors exactly one comes through, for every model
      expect(model.fixed - model.languageFixed).toBe(1);
    }
    expect(proofreadModelNotes.typography).toEqual({ planted: 5, fixedByModel: 4, keptByKielenhuolto: 1 });
  });
});
