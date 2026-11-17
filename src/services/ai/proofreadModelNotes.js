/**
 * What the model trial says about Kielenhuolto (data only)
 *
 * The figures are what Kielenhuolto delivers, not the models' raw replies:
 * the stored replies of the trial of 16 Nov 2026 pushed through the product's
 * own pipeline (test/services/proofreadTrial.test.js asserts them). The trial
 * planted 57 errors on 28 lines. Five of them were typographic, and the
 * pipeline writes a token that differs only in its quote, dash or ellipsis
 * form back as the original, so those are left to "Tarkista typografia" and
 * the rows below count the 52 language errors only.
 *
 * After a model change: scripts/step0/run-product.js prints the same numbers
 * for the new model; copy them from its "kielivirheet" line.
 */
const P = 'c91fb219-b725-43d2-925d-3c6e66bef527:';

module.exports = {
  testedAt: '2026-11-16',
  // The trial text was written for the trial, not taken from the author's manuscript
  ownText: false,
  // planted and fixed count language errors only: commas, compounds, spelling, agreement
  scope: 'language',
  // The rest is left to "Tarkista typografia"
  typography: { planted: 5, fixedByModel: 4, keptByKielenhuolto: 1 },
  models: [
    { id: P + 'deepseek-v4.1-flash-abliterated-fast', label: 'deepseek-v4.1-flash-abliterated-fast', planted: 52, fixed: 51, wrong: 1, paragraphs: 28, rewritten: 0 },
    { id: P + 'deepseek-v4.1-flash-abliterated', label: 'deepseek-v4.1-flash-abliterated', planted: 52, fixed: 51, wrong: 2, paragraphs: 28, rewritten: 0 },
    { id: P + 'glm-5.3-abliterated', label: 'glm-5.3-abliterated', planted: 52, fixed: 49, wrong: 2, paragraphs: 28, rewritten: 0 },
    { id: P + 'glm-5.3-flash-abliterated', label: 'glm-5.3-flash-abliterated', planted: 52, fixed: 42, wrong: 0, paragraphs: 28, rewritten: 0 }
  ]
};
