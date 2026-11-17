// Mallikokeen uusinta Kielenhuollon omalla putkella: mitä Kielenhuolto lähettää ja mitä se pitää.
//
// Käyttö:
//   python3 <withkey.py> CHERRY_API_KEY node scripts/step0/run-product.js --model <yhdyskäytävän mallitunniste>
//       [--data test/fixtures/step0-gateway] [--base http://127.0.0.1:23333] [--out <kansio>]
//   --data  kansio, jossa on dataset.json (oletus test/fixtures/step0-gateway)
//   --base  yhdyskäytävän osoite (oletus http://127.0.0.1:23333)
//   --out   kansio, johon raakavastaukset ja tulosteksti kirjoitetaan (oletus: uusi kansio
//           käyttöjärjestelmän väliaikaiskansiossa; polku tulostetaan)
//
// Avain luetaan ympäristömuuttujasta CHERRY_API_KEY. Sitä ei tulosteta eikä tallenneta.
//
// The original runner (run.js) sends 7-line batches with the trial's prompt and
// scores raw replies. This one sends the dataset through runProofread itself:
// the product's task and layout, its 10-line batches, its acceptance rule
// (judgeEdit) and its guards. The "kielivirheet" line of the table is what
// src/services/ai/proofreadModelNotes.js should say about the model.
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CLASSES = ['pilkku', 'yhdyssana', 'oikeinkirjoitus', 'kongruenssi', 'typografia'];
// What the AI client adds on top of the visible answer budget (reasoning headroom)
const HEADROOM_TOKENS = 2000;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[String(argv[i]).replace(/^--/, '')] = argv[i + 1];
  return args;
}

function applyChanges(text, changes) {
  let out = '';
  let cursor = 0;
  for (const change of [...changes].sort((a, b) => a.from - b.from || a.to - b.to)) {
    out += text.slice(cursor, change.from) + change.insert;
    cursor = change.to;
  }
  return out + text.slice(cursor);
}

/**
 * Planted and fixed errors per class, counted on the text with every proposed
 * change applied (as if each were accepted, dialogue ones included).
 */
function scoreText(items, resultText, isFixed) {
  const lines = resultText.split('\n');
  const byClass = {};
  for (const name of CLASSES) byClass[name] = { planted: 0, fixed: 0 };
  items.forEach((item, index) => {
    for (const error of item.errors || []) {
      const row = byClass[error.type] || (byClass[error.type] = { planted: 0, fixed: 0 });
      row.planted += 1;
      if (isFixed(lines[index] || '', error)) row.fixed += 1;
    }
  });
  const sum = (names) => names.reduce((total, name) => ({
    planted: total.planted + byClass[name].planted,
    fixed: total.fixed + byClass[name].fixed
  }), { planted: 0, fixed: 0 });
  const names = Object.keys(byClass);
  return { byClass, all: sum(names), language: sum(names.filter(name => name !== 'typografia')) };
}

function formatTable({ model, dataDir, items, result, score, changes, requests, seconds, outDir }) {
  const row = (label, counts) => `${label.padEnd(18)}${String(counts.planted).padStart(9)}${String(counts.fixed).padStart(10)}`;
  const aside = {};
  for (const entry of result.setAside) aside[entry.reason] = (aside[entry.reason] || 0) + 1;
  const asideText = Object.keys(aside).length === 0
    ? 'ei yhtään'
    : Object.entries(aside).map(([reason, count]) => `${reason} ${count}`).join(', ');
  const status = { done: 'valmis', stopped: 'pysäytetty', failed: 'keskeytyi virheeseen' }[result.status] || result.status;

  const out = [
    `Malli: ${model}`,
    `Aineisto: ${dataDir} (${items.length} riviä, ${score.all.planted} istutettua virhettä)`,
    `Ajo: ${status}, eriä ${result.batchesDone}/${result.batchCount}, pyyntöjä ${requests}, aikaa ${seconds.toFixed(1).replace('.', ',')} s`,
    '',
    `${'Luokka'.padEnd(18)}${'Istutettu'.padStart(9)}${'Korjattu'.padStart(10)}`,
    ...Object.keys(score.byClass).map(name => row(name, score.byClass[name])),
    row('kaikki', score.all),
    row('kielivirheet', score.language),
    '',
    `Ehdotettuja muutoksia: ${changes.length}, joista vuorosanoiksi merkittyjä: ${changes.filter(change => change.meta && change.meta.dialogue).length}`,
    `Sivuun jätetyt rivit syyn mukaan: ${asideText}`
  ];
  if (result.failedBatches.length > 0) {
    out.push(`Epäonnistuneita eriä: ${result.failedBatches.length} (${result.failedBatches.map(batch => batch.message).join(' | ')})`);
  }
  if (result.error) out.push(`Virhe: ${result.error}`);
  out.push(`Raakavastaukset ja tulosteksti: ${outDir}`);
  return out.join('\n');
}

/**
 * Send the dataset through runProofread and score what comes out.
 * @param {object} options
 * @param {Array} options.items dataset items ({ id, text, errors })
 * @param {(opts: object) => {result: Promise<object>, cancel: Function}} options.request requestEdit-shaped
 */
async function runTrial({ items, request }) {
  const { runProofread, PROOFREAD_DEFAULTS } = require('../../src/services/ai/proofreadPass.js');
  const { isFixed } = require('./score.js');
  const { wordDiff, changeRatio } = require('../../src/editor/wordDiff.js');
  const { maskSpans, unmaskSpans, placeholderInstruction } = require('../../src/services/ai/maskSpans.js');
  const deps = {
    splitBlocks: require('../../src/editor/blocks.js').splitBlocks,
    batchParagraphs: require('../../src/services/ai/batchParagraphs.js').batchParagraphs,
    trimToSentence: require('../../src/editor/sentences.js').trimToSentence,
    wordDiff,
    changeRatio,
    maskSpans,
    unmaskSpans,
    placeholderInstruction
  };

  // One line per item: a paragraph is one line in FAUST
  const text = items.map(item => item.text).join('\n');
  const changes = [];
  const result = await runProofread({
    text,
    options: PROOFREAD_DEFAULTS,
    budget: PROOFREAD_DEFAULTS.budget,
    deps,
    meta: { chapterId: 'step0' },
    request,
    onBatch: (batch) => {
      changes.push(...batch.changes);
    }
  });

  const resultText = applyChanges(text, changes);
  return { text, result, changes, resultText, score: scoreText(items, resultText, isFixed) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const key = process.env.CHERRY_API_KEY || '';
  if (!key) {
    console.error('CHERRY_API_KEY puuttuu');
    process.exit(2);
  }
  if (!args.model) {
    console.error('Mallitunniste puuttuu: --model <yhdyskäytävän mallitunniste>');
    process.exit(2);
  }
  // The key must not end up in an error text either
  const redact = (value) => String(value).split(key).join('[AVAIN]');

  const model = args.model;
  const base = String(args.base || 'http://127.0.0.1:23333').replace(/\/+$/, '');
  const dataDir = path.resolve(args.data || path.join(ROOT, 'test', 'fixtures', 'step0-gateway'));
  const outDir = args.out ? path.resolve(args.out) : fs.mkdtempSync(path.join(os.tmpdir(), 'faust-step0-product-'));
  fs.mkdirSync(outDir, { recursive: true });

  const dataset = JSON.parse(fs.readFileSync(path.join(dataDir, 'dataset.json'), 'utf8'));
  const items = dataset.items || [];

  const sdk = require('@anthropic-ai/sdk');
  const Anthropic = sdk.Anthropic || sdk.default || sdk;
  const client = new Anthropic({ apiKey: key, baseURL: base, maxRetries: 0, timeout: 15 * 60 * 1000 });
  const { judgeEdit } = require('../../src/services/ai/aiClient.js');

  const answers = [];
  let seconds = 0;

  // requestEdit of the app, reduced to what a run needs: one streamed request,
  // judged by the product's own acceptance rule
  const request = (opts) => {
    const controller = new AbortController();
    const started = Date.now();
    const record = {
      request: answers.length + 1,
      startedAt: new Date(started).toISOString(),
      answerTokens: opts.maxTokens,
      maxTokensSent: opts.maxTokens + HEADROOM_TOKENS,
      seconds: null,
      stopReason: null,
      usage: null,
      thinkingChars: 0,
      accepted: false,
      reason: null,
      error: null,
      sent: opts.original,
      text: ''
    };
    answers.push(record);

    const result = (async () => {
      let raw;
      try {
        const stream = client.messages.stream({
          model,
          system: opts.system,
          messages: opts.messages,
          max_tokens: opts.maxTokens + HEADROOM_TOKENS,
          temperature: opts.temperature
        }, { signal: controller.signal });
        const message = await stream.finalMessage();
        const blocks = message.content || [];
        raw = {
          ok: true,
          text: blocks.filter(block => block.type === 'text').map(block => block.text).join(''),
          stopReason: message.stop_reason || 'unknown',
          sawThinking: blocks.some(block => block.type === 'thinking' || block.type === 'redacted_thinking'),
          cancelled: false,
          promptTruncated: false,
          model: message.model || model,
          error: null
        };
        record.usage = message.usage ? { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens } : null;
        record.thinkingChars = blocks.filter(block => block.type === 'thinking').reduce((sum, block) => sum + (block.thinking || '').length, 0);
      } catch (error) {
        const message = redact(`${error.status || ''} ${error.name || ''}: ${String(error.message || error).slice(0, 400)}`).trim();
        raw = {
          ok: false, text: '', stopReason: 'error', sawThinking: false, cancelled: controller.signal.aborted,
          promptTruncated: false, model, error: { code: 'error', message, status: error.status || null }
        };
        record.error = message;
      }
      record.seconds = (Date.now() - started) / 1000;
      seconds += record.seconds;
      record.stopReason = raw.stopReason;
      record.text = raw.text;

      const verdict = judgeEdit(raw, { tag: 'teksti', original: opts.original });
      record.accepted = verdict.accepted;
      record.reason = verdict.reason;
      console.log(`Pyyntö ${record.request}: ${verdict.accepted ? 'hyväksytty' : `ei hyväksytty (${verdict.reason})`}, ${record.seconds.toFixed(1).replace('.', ',')} s, lopetussyy ${raw.stopReason}`);
      return {
        ...raw,
        ...verdict,
        logMeta: {
          source: 'faust', action: 'proofread', actionLabel: 'Kielenhuolto', instruction: '',
          provider: 'cherry', model: raw.model, requestLogId: null
        }
      };
    })();
    return { result, cancel: () => controller.abort() };
  };

  const trial = await runTrial({ items, request });

  const short = model.replace(/^[^:]*:/, '').replace(/[^A-Za-z0-9._-]/g, '_');
  fs.writeFileSync(path.join(outDir, `${short}.vastaukset.json`), `${JSON.stringify({ model, base, startedAt: answers[0] ? answers[0].startedAt : null, answers }, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, `${short}.teksti.txt`), `${trial.resultText}\n`);
  fs.writeFileSync(path.join(outDir, `${short}.tulos.json`), `${JSON.stringify({
    model,
    status: trial.result.status,
    score: trial.score,
    setAside: trial.result.setAside.map(entry => ({ key: entry.key, reason: entry.reason, ratio: entry.ratio })),
    failedBatches: trial.result.failedBatches,
    changes: trial.changes.length,
    dialogueChanges: trial.changes.filter(change => change.meta.dialogue).length,
    requests: answers.length,
    seconds
  }, null, 2)}\n`);

  console.log('');
  console.log(formatTable({
    model, dataDir, items, result: trial.result, score: trial.score, changes: trial.changes,
    requests: answers.length, seconds, outDir
  }));
  if (trial.result.status !== 'done') process.exitCode = 1;
}

module.exports = { runTrial, scoreText, formatTable, applyChanges, parseArgs };

if (require.main === module) {
  main().catch((error) => {
    const key = process.env.CHERRY_API_KEY || '';
    const message = String((error && error.message) || error).slice(0, 400);
    console.error('Virhe:', key ? message.split(key).join('[AVAIN]') : message);
    process.exit(1);
  });
}
