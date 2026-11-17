#!/usr/bin/env node
/**
 * Scores a "corrections only" trial (step 0 of docs/TEKOALYTUTKIMUS_2026-11.md).
 *
 * Each trial file holds paragraphs in two versions, the right one (clean) and
 * one with planted errors (planted), and the replies models gave to the planted
 * version. Three numbers come out per model: errors fixed, wrong corrections
 * and the share of paragraphs that were rewritten.
 *
 *   node scripts/score-step0.js                      every file in test/fixtures/step0
 *   node scripts/score-step0.js oma.json toinen.json the files or folders given
 *   node scripts/score-step0.js --mask oma.json      print what to send to a model
 *
 * Nothing is sent anywhere: replies are pasted into the trial file by hand.
 * This is not the tool for repeating the model trial after a model change:
 * scripts/step0/run.js repeats the original trial, and
 * scripts/step0/run-product.js measures what Kielenhuolto itself sends and keeps.
 */
const fs = require('fs');
const path = require('path');
const { maskSpans, unmaskSpans, placeholderInstruction } = require('../src/services/ai/maskSpans.js');
const { cleanModelOutput } = require('../src/services/ai/cleanModelOutput.js');
const { wordDiff, changeRatio } = require('../src/editor/wordDiff.js');

// A paragraph with more than this share of its words changed counts as rewritten (report 4.4: "noin 0,3")
const REWRITTEN_RATIO = 0.3;

const DEFAULT_FOLDER = path.join(__dirname, '..', 'test', 'fixtures', 'step0');

const touches = (change, site) => change.from <= site.to && change.to >= site.from;
const notesOf = (text) => (text.match(/\[TODO:[^\]\n]*\]/g) || []).join('\n');
const paragraphsOf = (trial) => (trial && Array.isArray(trial.paragraphs) ? trial.paragraphs : []);

/**
 * Score one reply. The planted errors are not listed in the trial file: they
 * are the difference between the two versions of the paragraph.
 * @param {{id: string, clean: string, planted: string}} paragraph
 * @param {string} reply the model's raw reply to maskSpans(planted).text
 */
function scoreParagraph(paragraph, reply) {
  const mask = maskSpans(paragraph.planted);
  const cleaned = cleanModelOutput(reply, { original: mask.text });
  // The planted errors, as ranges of the right text
  const sites = wordDiff(paragraph.clean, paragraph.planted);

  if (!cleaned.complete) {
    // A cut or refused reply is not a row of corrections
    return { id: paragraph.id, usable: false, errors: sites.length, fixed: 0, wrong: 0, rewritten: false, notesKept: true, repaired: 0, ratio: 0 };
  }

  const restored = unmaskSpans(cleaned.text, mask);
  const output = restored.text;
  // What still differs from the right text
  const remaining = wordDiff(paragraph.clean, output, { merge: false });
  const ratio = changeRatio(paragraph.planted, output);
  return {
    id: paragraph.id,
    usable: true,
    errors: sites.length,
    fixed: sites.filter(site => !remaining.some(change => touches(change, site))).length,
    wrong: remaining.filter(change => !sites.some(site => touches(change, site))).length,
    rewritten: ratio > REWRITTEN_RATIO,
    notesKept: notesOf(output) === notesOf(paragraph.planted),
    // Placeholders the model dropped or moved and unmaskSpans had to put back
    repaired: restored.restored.length + restored.repositioned.length,
    ratio
  };
}

/**
 * Sum the paragraphs a model answered.
 * @param {Array<{id: string, clean: string, planted: string}>} paragraphs
 * @param {Object<string, string>} replies raw replies by paragraph id
 */
function scoreModel(paragraphs, replies) {
  const given = replies || {};
  const rows = (Array.isArray(paragraphs) ? paragraphs : [])
    .filter(paragraph => typeof given[paragraph.id] === 'string')
    .map(paragraph => scoreParagraph(paragraph, given[paragraph.id]));
  const usable = rows.filter(row => row.usable);
  const sum = (key) => rows.reduce((total, row) => total + row[key], 0);
  const errors = sum('errors');
  const fixed = sum('fixed');
  const wrong = sum('wrong');
  const rewritten = usable.filter(row => row.rewritten).length;
  const fixedShare = errors === 0 ? 0 : fixed / errors;
  const rewrittenShare = usable.length === 0 ? 0 : rewritten / usable.length;

  return {
    paragraphs: rows.length,
    unusable: rows.length - usable.length,
    errors,
    fixed,
    wrong,
    rewritten,
    fixedShare,
    rewrittenShare,
    notesKept: usable.every(row => row.notesKept),
    repaired: sum('repaired'),
    // The rule of report 4.4: at least half fixed, fewer wrong than fixed, under a fifth rewritten
    passes: usable.length > 0 && fixedShare >= 0.5 && wrong < fixed && rewrittenShare < 0.2,
    rows
  };
}

/** Trial files of the given files and folders (a folder gives its .json files, not its subfolders). */
function loadTrials(targets) {
  const files = [];
  for (const target of targets || []) {
    if (fs.statSync(target).isDirectory()) {
      for (const name of fs.readdirSync(target).sort()) {
        // The volume writes "._name" files next to the real ones
        if (name.endsWith('.json') && !name.startsWith('.')) files.push(path.join(target, name));
      }
    } else {
      files.push(target);
    }
  }
  return files.map(file => ({ file, ...JSON.parse(fs.readFileSync(file, 'utf8')) }));
}

const percent = (share) => `${Math.round(share * 100)} %`;

// A file under the working folder is named from there, as it was typed
function displayPath(file) {
  const relative = path.relative(process.cwd(), path.resolve(String(file)));
  const shown = relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : String(file);
  return shown.split(path.sep).join('/');
}

/** The report of one trial file, in Finnish. */
function report(trial) {
  const paragraphs = paragraphsOf(trial);
  const lines = [`Aineisto: ${displayPath(trial.file)} (${paragraphs.length} ${paragraphs.length === 1 ? 'kappale' : 'kappaletta'})`];
  const models = Object.keys(trial.replies || {});
  if (models.length === 0) lines.push('  Ei vastauksia. Aja --mask, lähetä tekstit mallille ja liitä vastaukset kohtaan "replies".');
  for (const model of models) {
    const score = scoreModel(paragraphs, trial.replies[model]);
    lines.push(
      model,
      `  korjatut virheet          ${score.fixed}/${score.errors} (${percent(score.fixedShare)})`,
      `  väärät korjaukset         ${score.wrong}`,
      `  uusiksi kirjoitetut       ${score.rewritten}/${score.paragraphs - score.unusable} (${percent(score.rewrittenShare)})`,
      `  käyttökelvottomat         ${score.unusable}`,
      `  TODO-merkinnät tallella   ${score.notesKept ? 'kyllä' : 'EI'}`,
      `  palautetut paikkamerkit   ${score.repaired}`,
      `  päätössääntö              ${score.passes ? 'täyttyy' : 'ei täyty'}`
    );
  }
  return lines.join('\n');
}

/** What to paste into a model's chat: the instruction and every paragraph, masked and tagged. */
function maskSheet(trial) {
  const lines = [`Ohje mallille: ${placeholderInstruction('fi')}`, ''];
  for (const paragraph of paragraphsOf(trial)) {
    lines.push(`[${paragraph.id}]`, `<teksti>${maskSpans(paragraph.planted).text}</teksti>`, '');
  }
  return lines.join('\n');
}

module.exports = { scoreParagraph, scoreModel, loadTrials, report, maskSheet, REWRITTEN_RATIO };

if (require.main === module) {
  const args = process.argv.slice(2);
  const mask = args.includes('--mask');
  const targets = args.filter(arg => arg !== '--mask');
  if (targets.length === 0) targets.push(DEFAULT_FOLDER);
  const trials = loadTrials(targets);
  console.log(trials.map(mask ? maskSheet : report).join('\n\n'));
}
