/**
 * src/components/LanguagePanel.js - Kielen työkalut: Typografia, Kielenhuolto and Voikko (stage I-06;
 * report 4.8, 4.4, 4.16).
 *
 *   LanguagePanel(props)
 *     mode            null | 'typography' | 'proofread' | 'voikko' (null: nothing is drawn, the state stays)
 *     onMode(mode)    another tab; onClose() the head's Sulje
 *     project, chapter, text   the project, the open chapter and its live text
 *     editorRef       the manuscript facade (setSelectionRange, focus, value, getSuggestions)
 *     onSelectChapter(id)      a row of Muut luvut
 *     updateProject(fn)        (prev) => next, marks the project changed
 *     controller      the suggestion controller: every proposal and every bulk decision goes through it
 *     barInfo         the bar's BarInfo of the open chapter (the panel renders again when it changes)
 *     aiClient, aiConfig, contextSession, textDeps, wordCheck, api (window.electronAPI)
 *     aiDisabled      "Tekoäly pois": the Kielenhuolto tab does not exist (contracts rule 12)
 *     onOpenAISettings         the model line's link
 *
 * A docked panel of the right column (reconcile R-42): app.js mounts it in .faust-aipanel.faust-langpanel
 * and keeps it mounted, so a Kielenhuolto run goes on while the panel is closed (its suggestions go on
 * arriving in the bar). The run is stopped when another chapter is opened; a new project remounts the
 * panel (key = project epoch), which stops the run and empties the lists. Esc is not bound: a reviewed
 * set is never thrown away by a key.
 *
 * Nothing here writes manuscript text. Every change is a suggestion (controller.propose) with the text
 * it was computed on as baseText (contracts rule 15). Composition: visual foundations entry VF-22, with
 * the strings of the brief, reconcile R-82 and R-36. Classes of styles/faust-components.css; style
 * objects hold layout only.
 *
 * Bundled with app.js by webpack. Uses the global React like the rest of the app.
 */
import { icons } from './icons.js';
import { Tabs, Section, Callout, EmptyState, Progress, Field, Chip, IconButton, notify } from './ui.js';
import { count } from './Dialogs.js';
import { AiModelBadge } from './AiModelSettings.js';
import { ContextRow, useContextPreview } from './ContextRow.js';
import { useSetting } from './useSetting.js';
import {
  checkTypography, fixesFor, dashLineChanges, countDashLines, effectiveLineStartDash
} from '../editor/typography.fi.js';
import { runProofread, proofreadTask, proofBudget, modelNote } from '../services/ai/proofreadPass.js';
import proofreadModelNotes from '../services/ai/proofreadModelNotes.js';
import { isChapterBlocked, MESSAGES } from '../services/ai/contextBuilder.js';
import { buildVoikkoInput, voikkoFindings, nameHits } from '../services/language/voikkoCheck.js';
import {
  TYPOGRAPHY_META, VOIKKO_META, PROOFREAD_META, setAsideReason, runSummary, languageName, typographyView,
  excerptAround, proofPlan, batchNumberOf, notRunText, resumePlace, locatePassage, setAsideChanges,
  voikkoWordRows, voikkoChange
} from '../services/language/languageTools.js';
import { formatCount, pendingSuggestions } from '../services/format.fi.js';

const { createElement: e, useState, useEffect, useMemo, useRef } = React;

const TABS = [
  { id: 'typography', label: 'Typografia' },
  { id: 'proofread', label: 'Kielenhuolto' },
  { id: 'voikko', label: 'Voikko' }
];

// The run's own instruction ("Oikolue nämä n riviä…") is not the author's: the row names it "ohje"
// (the label of a built-in action's instruction since I-05), not "oma ohje"
const withLabel = (task) => (task ? { ...task, instructionLabel: 'ohje' } : null);
// A day number at a line start has no fix in the checker (typography.fi.js): say why there is no Ehdota
const NO_FIX_AT_LINE_START = 'Rivin alussa piste tekisi rivistä numeroidun luettelon. Muotoile virke toisin.';

const INSTALL_COMMAND = 'brew install libvoikko';
const VOIKKO_MISSING = 'Voikkoa ei löytynyt. Asenna: brew install libvoikko';
const READY_TEXT = 'Tekoäly korjaa vain kielivirheet. Jokainen korjaus tulee ehdotuksena, ja teksti muuttuu vasta, kun hyväksyt sen.';
const NOTHING_TO_SEND = 'Luvussa ei ole lähetettävää tekstiä.';
// Why Aloita is disabled while no model is chosen (menu spec B.8)
const NO_MODEL_REASON = 'Valitse ensin malli';
const GUARD_TEXT = {
  voikko: 'Epäilyttävien sanojen tarkistus: Voikko',
  system: 'Epäilyttävien sanojen tarkistus: järjestelmän oikoluku',
  none: 'Epäilyttävien sanojen tarkistus ei ole käytössä. Asenna Voikko, niin se tulee mukaan.'
};

// A reason with its own full stop gets no second one (M B.12)
const reasonOf = (text) => String(text || '').trim().replace(/\.+$/, '') || 'tuntematon virhe';

// The suggestions of the open chapter that are still pending, from the editor (none without one)
function pendingItems(editorRef) {
  const editor = editorRef && editorRef.current;
  if (!editor || typeof editor.getSuggestions !== 'function') return [];
  const snapshot = editor.getSuggestions();
  return snapshot && Array.isArray(snapshot.pending) ? snapshot.pending : [];
}

// A short face with its full meaning in the tooltip and for a screen reader (R-36); a face that says
// it all itself (Ehdota silti, Ohita sana, Ehdota: …) has no title
function smallButton(label, title, onClick, options = {}) {
  return e('button', {
    type: 'button',
    className: 'faust-btn faust-btn--sm' + (options.quiet ? ' faust-btn--quiet' : ''),
    title: title || undefined,
    'aria-label': title || undefined,
    disabled: options.disabled,
    onClick
  }, label);
}

function blockButton(label, onClick, options = {}) {
  return e('button', {
    type: 'button',
    className: 'faust-btn faust-btn--block' + (options.primary ? ' faust-btn--primary' : '') + (options.quiet ? ' faust-btn--quiet' : ''),
    title: options.title,
    disabled: options.disabled,
    'aria-busy': options.busy || undefined,
    onClick
  }, options.icon || null, label);
}

// A line of the text with the flagged characters marked
function Excerpt({ text, from, to }) {
  const part = excerptAround(text, from, to);
  return e('span', { className: 'faust-quote' },
    part.before,
    // A hit of one or two characters (a hyphen, a quotation mark, a space) is shown by a ground: a wavy
    // line under one narrow character read as a stray mark, not as a highlight
    part.hit ? e('span', { className: 'faust-mark faust-mark--finding' + (part.hit.length <= 2 ? ' faust-mark--point' : '') }, part.hit) : null,
    part.after);
}

function ListRow({ children, actions }) {
  return e('div', { className: 'faust-row faust-row--static' },
    e('span', { className: 'faust-row__text' }, children),
    actions && e('span', { className: 'faust-row__actions' }, actions));
}

export function LanguagePanel(props) {
  const {
    mode, onMode, onClose, project, chapter, text = '', editorRef, onSelectChapter, updateProject,
    controller, aiClient, aiConfig, contextSession, textDeps, wordCheck, api, aiDisabled, onOpenAISettings
  } = props;

  const chapterId = chapter ? chapter.id : null;
  const chapterTitle = (chapter && chapter.title) || 'Nimetön luku';
  const language = (project && project.language) || 'fi';
  const finnish = language === 'fi';
  const dashSetting = effectiveLineStartDash(project || {});
  // "Tekoäly pois": the tab is not there, and a request for it shows Typografia (brief step 6)
  const shown = mode === 'proofread' && aiDisabled ? 'typography' : mode;

  const projectRef = useRef(project);
  projectRef.current = project;

  // ---------------------------------------------------------------------------------------------
  // The word checker of the suspect-word guard, and Voikko's status
  // ---------------------------------------------------------------------------------------------
  const [guard, setGuard] = useState(() => (wordCheck ? wordCheck.source() : null));
  const [voikko, setVoikko] = useState(null);
  // Tarkista uudelleen looks for Voikko again (main rebuilds the menu); the word checker then takes
  // what was found, so an installation made while FAUST runs guards the next run
  const refreshCheckers = (recheck) => {
    const status = api && typeof api.voikkoStatus === 'function'
      ? api.voikkoStatus(recheck ? { recheck: true } : undefined).then(
        (found) => { setVoikko(found || { available: false, reason: 'not-found' }); },
        () => { setVoikko({ available: false, reason: 'not-found' }); })
      : Promise.resolve();
    status.then(() => (wordCheck ? wordCheck.refresh() : null)).then((source) => setGuard(source || null), () => setGuard(null));
  };
  useEffect(() => { refreshCheckers(false); }, []);
  // The system checker answers only while Työkalut ▸ Oikoluku is on: the guard line is read again when
  // the switch changes and whenever Kielenhuolto is shown, so it never says a checker guards the run
  // when none does
  const [spellCheckOn] = useSetting('spellCheck', true);
  const proofreadShown = shown === 'proofread';
  useEffect(() => {
    if (!wordCheck || !proofreadShown) return;
    wordCheck.refresh().then((source) => setGuard(source || null), () => setGuard(null));
  }, [proofreadShown, spellCheckOn]);
  // The checker a run's batches ask: which one answers is looked up when a batch is checked, so a switch
  // turned off during the run turns the guard off there and then (the panel says so)
  const guardWords = (words) => wordCheck.refresh().then((source) => {
    setGuard(source || null);
    const check = wordCheck.current();
    return check ? check(words) : undefined;
  });

  // ---------------------------------------------------------------------------------------------
  // Typografia
  // ---------------------------------------------------------------------------------------------
  const typography = useMemo(() => {
    if (shown !== 'typography' || !finnish) return null;
    const findings = checkTypography(text, { language, lineStartDash: dashSetting });
    return { ...typographyView(findings), fixes: fixesFor(findings) };
  }, [shown, text, language, dashSetting]);

  // Muut luvut: the other chapters with findings, each counted again only when its text changed
  const otherCache = useRef(new Map());
  const others = useMemo(() => {
    if (shown !== 'typography' || !finnish || !project) return [];
    const rows = [];
    for (const item of project.structure || []) {
      if (!item || item.id === chapterId || item.type === 'folder') continue;
      const content = item.content || '';
      let cached = otherCache.current.get(item.id);
      if (!cached || cached.content !== content || cached.dash !== dashSetting) {
        cached = { content, dash: dashSetting, count: typographyView(checkTypography(content, { language, lineStartDash: dashSetting })).listed };
        otherCache.current.set(item.id, cached);
      }
      if (cached.count > 0) rows.push({ id: item.id, title: item.title || 'Nimetön luku', count: cached.count });
    }
    return rows;
  }, [shown, project && project.structure, chapterId, language, dashSetting]);

  const dashLines = shown === 'typography' && finnish && dashSetting === 'dialogue' ? countDashLines(text) : 0;
  const askDashes = dashLines > ((chapter && chapter.dashLinesConfirmed) || 0);

  // ---------------------------------------------------------------------------------------------
  // Kielenhuolto: the run's settings, what it will send, and the run itself
  // ---------------------------------------------------------------------------------------------
  const proofOptions = {
    ...((project && project.proofread) || {}),
    keepNote: (project && project.keepNote) || '',
    dashDialogue: dashSetting === 'dialogue'
  };
  const editModel = aiClient ? aiClient.modelFor('edit') : '';
  const budgetNow = () => {
    const cfg = aiClient && aiClient.configSnapshot ? aiClient.configSnapshot() : null;
    const maxOutput = cfg && cfg.defaults && cfg.defaults.maxOutput ? cfg.defaults.maxOutput[cfg.provider] : undefined;
    return proofBudget({
      promptBudgetChars: aiClient ? aiClient.budgetFor(aiClient.modelFor('edit'), 0).promptBudgetChars : undefined,
      maxOutputTokens: maxOutput
    });
  };
  const plan = useMemo(() => {
    if (shown !== 'proofread' || !textDeps) return null;
    return proofPlan(text, proofOptions, budgetNow(), textDeps);
  }, [shown, text, proofOptions.skipQuoteLines, proofOptions.skipDialogue, proofOptions.dashDialogue, editModel, aiConfig]);
  const firstTask = plan && plan.batches.length > 0 ? withLabel(proofreadTask(plan.batches[0], proofOptions, textDeps)) : null;
  const blockedNoAI = !!(project && chapterId && isChapterBlocked(project, chapterId));
  // "Mitä malli näkee" in full mode: the first batch's request, with the parts that can be unticked
  const preview = useContextPreview({
    task: firstTask,
    project,
    chapterId,
    text,
    role: 'edit',
    answerTokens: firstTask ? firstTask.answerTokens : undefined,
    disabled: shown !== 'proofread' || !firstTask || blockedNoAI
  });

  const [run, setRun] = useState(null);
  const abortRef = useRef(null);
  const runRef = useRef(null);
  runRef.current = run;
  // False once the panel is unmounted (a new project: rule 14). A batch whose answer is still being
  // checked then (the suspect-word lookup is a round trip to Voikko) is not proposed into the next project
  const aliveRef = useRef(true);

  // Another chapter stops the run (its suggestions stay with its chapter); unmounting stops it too
  useEffect(() => {
    const current = runRef.current;
    if (current && current.status === 'running' && current.chapterId !== chapterId && abortRef.current) abortRef.current.abort();
  }, [chapterId]);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const startRun = (resume) => {
    if (!controller || !aiClient || !chapterId) return;
    const runText = text;
    const previous = resume ? runRef.current : null;
    let range;
    if (previous) {
      const place = resumePlace(runText, previous.resumeLine);
      if (!place) return;
      range = { from: place.from, to: runText.length };
    }
    const options = { ...proofOptions, range };
    const budget = budgetNow();
    const runPlan = proofPlan(runText, options, budget, textDeps);
    const exclude = preview.rowProps ? preview.rowProps.exclude : undefined;
    const include = preview.rowProps ? preview.rowProps.include : [];
    const cfg = aiClient.configSnapshot ? aiClient.configSnapshot() : null;
    const abort = new AbortController();
    abortRef.current = abort;
    let groupId = previous ? previous.groupId : null;
    const startedFor = chapterId;

    setRun({
      chapterId: startedFor,
      status: 'running',
      groupId,
      progress: { batchIndex: 0, batchCount: runPlan.batches.length, linesDone: 0, linesTotal: runPlan.lines.length, corrections: 0 },
      plan: runPlan,
      totals: previous ? previous.totals : { corrections: 0, linesSent: 0, linesUnchanged: 0, linesChanged: 0, setAside: [] },
      resumeLine: null,
      result: null
    });

    runProofread({
      text: runText,
      options,
      budget,
      deps: textDeps,
      meta: { chapterId: startedFor },
      // Every batch is built for the run's own text, with the parts switched off in the row
      build: (task) => contextSession.build({
        task: withLabel(task), project: projectRef.current, chapterId: startedFor, text: runText, role: 'edit',
        answerTokens: task.answerTokens, exclude, include
      }),
      request: (opts) => aiClient.requestEdit({ role: 'edit', ...opts }),
      checkWords: wordCheck ? guardWords : undefined,
      signal: abort.signal,
      onProgress: (progress) => {
        setRun(current => (current && current.chapterId === startedFor && current.status === 'running' ? { ...current, progress } : current));
      },
      // One group for the whole run; every batch lands on its own words through baseText (contracts 4.3)
      onBatch: ({ changes }) => {
        if (!aliveRef.current || !changes || changes.length === 0) return { skipped: [] };
        const res = controller.propose(startedFor, changes, { baseText: runText, groupId: groupId || undefined, meta: PROOFREAD_META });
        if (!groupId && res && res.groupId) {
          groupId = res.groupId;
          setRun(current => (current && current.chapterId === startedFor ? { ...current, groupId } : current));
        }
        return { skipped: (res && res.skipped) || [] };
      }
    }).then((result) => {
      if (abortRef.current === abort) abortRef.current = null;
      setRun((current) => {
        if (!current || current.chapterId !== startedFor) return current;
        const before = current.totals;
        const tag = (entry) => ({ ...entry, baseText: result.baseText, runId: result.runId, model: result.model, provider: cfg ? cfg.provider : null, dashDialogue: options.dashDialogue === true });
        const totals = {
          corrections: before.corrections + result.corrections,
          linesSent: before.linesSent + result.linesSent,
          linesUnchanged: before.linesUnchanged + result.linesUnchanged,
          linesChanged: before.linesChanged + result.linesChanged,
          setAside: [...before.setAside, ...result.setAside.map(tag)]
        };
        return { ...current, status: result.status, groupId: groupId || current.groupId, totals, result, resumeLine: result.resumeLine, plan: runPlan };
      });
    }, (error) => {
      if (abortRef.current === abort) abortRef.current = null;
      setRun(current => (current && current.chapterId === startedFor
        ? { ...current, status: 'failed', result: { status: 'failed', error: reasonOf(error && error.message), failedBatches: [], dashListLines: 0 } }
        : current));
    });
  };

  const stopRun = () => { if (abortRef.current) abortRef.current.abort(); };

  // ---------------------------------------------------------------------------------------------
  // Voikko
  // ---------------------------------------------------------------------------------------------
  const [voikkoRun, setVoikkoRun] = useState(null);
  const [ignored, setIgnored] = useState(() => new Set());
  const [baseForm, setBaseForm] = useState({ name: '', stem: '', busy: false, result: null });

  const runVoikko = async () => {
    if (!api || !voikko || !voikko.available) return;
    const checked = text;
    const forChapter = chapterId;
    setVoikkoRun({ chapterId: forChapter, status: 'running' });
    try {
      const input = buildVoikkoInput(checked, { splitBlocks: textDeps.splitBlocks });
      const words = await api.voikkoAnalyze({ words: input.words, suggest: true });
      if (!words || !words.success) throw new Error(words && words.error);
      let grammarResults = [];
      if (voikko.hasGrammar) {
        const grammar = await api.voikkoGrammar({ paragraphs: input.paragraphs.map(paragraph => paragraph.text) });
        if (!grammar || !grammar.success) throw new Error(grammar && grammar.error);
        grammarResults = grammar.results || [];
      }
      const findings = voikkoFindings({ text: checked, tokens: input.tokens, wordResults: words.results, paragraphs: input.paragraphs, grammarResults });
      setVoikkoRun({ chapterId: forChapter, status: 'done', baseText: checked, findings, tokens: input.tokens, wordResults: words.results });
    } catch (error) {
      setVoikkoRun({ chapterId: forChapter, status: 'error', error: reasonOf(error && error.message) });
    }
  };

  const compareBaseForms = async () => {
    const name = baseForm.name.trim();
    if (!name || !api) return;
    setBaseForm(current => ({ ...current, busy: true, result: null }));
    try {
      const input = buildVoikkoInput(text, { splitBlocks: textDeps.splitBlocks });
      const answer = await api.voikkoAnalyze({ words: [...input.words, name] });
      if (!answer || !answer.success) throw new Error(answer && answer.error);
      const own = (answer.results || []).find(result => result.word === name);
      if (!own || !(own.analyses || []).length) {
        setBaseForm(current => ({ ...current, busy: false, result: { unknown: true } }));
        return;
      }
      const hits = nameHits({ tokens: input.tokens, wordResults: answer.results, name, stem: baseForm.stem.trim() || name });
      setBaseForm(current => ({ ...current, busy: false, result: hits }));
    } catch (error) {
      setBaseForm(current => ({ ...current, busy: false, result: { error: reasonOf(error && error.message) } }));
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Shared actions
  // ---------------------------------------------------------------------------------------------
  // Näytä: the passage selected in the manuscript and scrolled into view; the focus goes there
  const reveal = (from, to) => {
    const editor = editorRef && editorRef.current;
    if (!editor || typeof editor.setSelectionRange !== 'function') return;
    editor.setSelectionRange(from, to);
    editor.focus();
  };
  // A passage of an earlier text: where it stands now
  const revealPassage = (passage, near) => {
    const editor = editorRef && editorRef.current;
    if (!editor) return;
    const place = locatePassage(editor.value, passage, near);
    if (place) reveal(place.from, place.to);
  };

  const propose = (changes, baseText, meta, groupId) => {
    if (!controller || !chapterId || !changes.length) return null;
    const res = controller.propose(chapterId, changes, { baseText, meta, groupId: groupId || undefined });
    // Nothing could be placed because the text there changed after it was checked (an overlap with a
    // pending suggestion is the bar's own notice)
    const moved = (res && res.skipped ? res.skipped : []).filter(skip => skip.reason === 'target-changed' || skip.reason === 'mismatch');
    if (res && !res.ok && (res.error === 'target-changed' || (moved.length > 0 && moved.length === changes.length))) {
      notify('warning', 'Teksti on muuttunut ehdotuksen luomisen jälkeen. Muutosta ei tehty.');
    }
    return res;
  };
  const withMeta = (changes, meta) => changes.map(change => ({ ...change, meta: { ...meta, ...(change.meta || {}) } }));

  if (!shown) return null;

  // ---------------------------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------------------------
  // The tab of a running Kielenhuolto carries the busy dot, as Tarkistus does in Tietopaneeli (V 9.4)
  const proofreadBusy = !!(run && run.status === 'running');
  const tabs = (aiDisabled ? TABS.filter(tab => tab.id !== 'proofread') : TABS)
    .map(tab => (tab.id === 'proofread' && proofreadBusy ? { ...tab, busy: true } : tab));
  const pending = pendingItems(editorRef);

  const head = e('div', { className: 'faust-panel__head' },
    e('span', { className: 'faust-panel__title' }, 'Kielen työkalut'),
    e(IconButton, { icon: 'close', size: 'sm', label: 'Sulje', title: 'Sulje', onClick: onClose }));

  const tabRow = e('div', { className: 'faust-panel__tabs' },
    e(Tabs, { value: shown, onChange: onMode, items: tabs, label: 'Kielen työkalut' }));

  // --- Typografia ---
  const typographyBody = () => {
    if (!finnish) {
      return e(Section, { title: `Typografia: ${chapterTitle}` },
        e(Callout, { role: 'hint' }, `Typografiasäännöt on tehty suomenkieliselle tekstille. Tämän projektin kieli on ${languageName(language)}.`));
    }
    const view = typography;
    const typoPending = pending.filter(item => item.meta && item.meta.action === 'typography');
    const waiting = typoPending.length;
    // A finding whose fix already waits in the text (an insertion touches its point) is not offered again;
    // the others, the recommendations among them, keep their own Ehdota
    const fixWaits = (finding) => !!finding.fix && typoPending.some(item => item.from <= finding.fix.to && item.to >= finding.fix.from);
    const fixes = view.fixes;
    const waitingText = waiting > 0
      ? `${count(waiting, 'ehdotus')} odottaa tekstissä. Käy ${waiting === 1 ? 'se' : 'ne'} läpi ehdotuspalkista.`
      : null;

    const proposeOne = (finding) => {
      if (!finding.fix) return;
      propose(withMeta([{ ...finding.fix, meta: { ruleId: finding.ruleId } }], TYPOGRAPHY_META), text, TYPOGRAPHY_META);
    };

    const question = askDashes && e(Callout, {
      role: 'warning',
      title: 'Luettelo vai vuorosana?',
      actions: e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', width: '100%' } },
        blockButton('Muunna kaikki vuorosanaviivoiksi', () => propose(withMeta(dashLineChanges(text), TYPOGRAPHY_META), text, TYPOGRAPHY_META)),
        blockButton('Ne ovat luetteloita', () => updateProject(prev => ({
          ...prev,
          structure: (prev.structure || []).map(item => (item.id === chapterId ? { ...item, dashLinesConfirmed: dashLines } : item))
        }))))
    },
      e('div', null, dashLines === 1
        ? 'Tässä luvussa on 1 rivi, joka alkaa yhdysmerkillä (- ). FAUST käsittelee sen luettelona, ja se myös viedään luettelona.'
        : `Tässä luvussa on ${formatCount(dashLines)} riviä, jotka alkavat yhdysmerkillä (- ). FAUST käsittelee ne luettelona, ja ne myös viedään luettelona.`),
      e('div', { style: { display: 'flex', flexDirection: 'column', marginTop: 'var(--sp-2)' } },
        view.questions.slice(0, 5).map(finding => e(ListRow, {
          key: finding.id,
          actions: smallButton('Näytä', 'Näytä kohta tekstissä', () => reveal(finding.from, finding.to))
        }, e(Excerpt, { text, from: finding.from, to: finding.to })))));

    // The count, the recommendations and the bulk button only when something is listed: a chapter with
    // just the dash-line question shows the question alone (no "0 kohtaa" above it)
    const listed = view.listed > 0;
    const summary = (listed || waitingText) && e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
      listed && e('div', { className: 'faust-meta' }, count(view.listed, 'kohta')),
      listed && view.recommendations > 0 && e('div', { className: 'faust-meta' }, `Suosituksia: ${formatCount(view.recommendations)}`),
      listed && (fixes.length > 0 || waiting > 0) && blockButton(`Ehdota kaikki korjaukset (${formatCount(fixes.length)})`,
        () => propose(withMeta(fixes, TYPOGRAPHY_META), text, TYPOGRAPHY_META),
        { primary: true, disabled: waiting > 0 || fixes.length === 0, title: waitingText || undefined }),
      waitingText && e('div', { className: 'faust-field__hint' }, waitingText));

    return e(React.Fragment, null,
      e(Section, { title: `Typografia: ${chapterTitle}` },
        !listed && !question && !waitingText
          ? e(EmptyState, { size: 'compact', title: 'Ei huomautettavaa tässä luvussa.' })
          : summary || null),
      question,
      view.groups.map(group => e(Section, {
        key: group.ruleId,
        title: e(React.Fragment, null, group.title, ' ', e(Chip, { count: true }, formatCount(group.findings.length))),
        action: group.url && smallButton('Ohje', 'Avaa Kielitoimiston ohjepankin sivu selaimessa', () => {
          if (api && typeof api.openExternal === 'function') api.openExternal(group.url);
        }, { quiet: true })
      },
        e('div', { className: 'faust-field__hint' }, group.message),
        group.findings.map(finding => e(ListRow, {
          key: finding.id,
          actions: [
            e(React.Fragment, { key: 'show' }, smallButton('Näytä', 'Näytä kohta tekstissä', () => reveal(finding.from, finding.to))),
            finding.fix && e(React.Fragment, { key: 'fix' }, smallButton('Ehdota', 'Ehdota tätä korjausta', () => proposeOne(finding), { disabled: fixWaits(finding) }))
          ]
        },
          e(Excerpt, { text, from: finding.from, to: finding.to }),
          !finding.fix && finding.ruleId === 'paivays-jarjestyspiste' && e('span', { className: 'faust-row__meta' }, NO_FIX_AT_LINE_START))))));
  };

  const typographyFoot = () => (finnish && others.length > 0
    ? e('div', { className: 'faust-panel__foot' },
        e('div', { className: 'faust-section__head' }, e('div', { className: 'faust-section__title', role: 'heading', 'aria-level': 3 }, 'Muut luvut')),
        others.map(row => e('button', {
          key: row.id,
          type: 'button',
          className: 'faust-row',
          onClick: () => onSelectChapter && onSelectChapter(row.id)
        }, e('span', { className: 'faust-row__text' }, e('span', { className: 'faust-row__title' }, `${row.title} · ${count(row.count, 'kohta')}`)))))
    : null);

  // --- Kielenhuolto ---
  const setProofread = (patch) => updateProject(prev => ({ ...prev, proofread: { ...(prev.proofread || {}), ...patch } }));
  const dashNotice = (n) => (n > 0 && dashSetting === 'dialogue'
    ? e(Callout, {
      role: 'info',
      actions: blockButton('Tarkista typografia', () => onMode('typography'))
    // Who treats them how: the Typografia tab says of the same lines that FAUST handles and exports them
    // as a list, and the two sentences read as a contradiction without their subjects
    }, n === 1
      ? 'Luvussa on 1 yhdysmerkillä alkava rivi. Kielenhuolto käsittelee sen vuorosanana; muualla FAUST pitää sitä luettelona.'
      : `Luvussa on ${formatCount(n)} yhdysmerkillä alkavaa riviä. Kielenhuolto käsittelee ne vuorosanoina; muualla FAUST pitää niitä luettelona.`)
    : null);

  const modelLines = () => {
    // No model is chosen (a first run): the badge says so with its link, and nothing is said about
    // "this model" (the experience note and the guard line are about a run that cannot start yet)
    if (!editModel) return e(AiModelBadge, { role: 'edit', onOpenSettings: onOpenAISettings, config: aiConfig });
    const note = modelNote(editModel, proofreadModelNotes);
    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' } },
      e(AiModelBadge, { role: 'edit', onOpenSettings: onOpenAISettings, config: aiConfig }),
      e('div', { className: 'faust-field__hint' }, note.text),
      e('div', { className: 'faust-field__hint' }, guard === 'voikko' ? GUARD_TEXT.voikko : guard === 'system' ? GUARD_TEXT.system : GUARD_TEXT.none));
  };

  const proofreadReady = () => {
    const info = props.barInfo;
    const chapterPending = Math.max(pending.length, info && info.chapterId === chapterId ? Number(info.pending) || 0 : 0);
    const lines = plan ? plan.lines.length : 0;
    let blocked = null;
    if (blockedNoAI) blocked = MESSAGES.noAI;
    else if (chapterPending > 0) blocked = `Luvussa on jo ${pendingSuggestions(chapterPending)}. Käy ${chapterPending === 1 ? 'se' : 'ne'} ensin läpi.`;
    else if (lines === 0) blocked = NOTHING_TO_SEND;
    const notSent = ['otsikot', 'kohtauksen erottimet', proofOptions.skipQuoteLines !== false ? 'lainausrivit' : null, 'luettelomerkit', '[TODO]-muistutukset']
      .filter(Boolean).join(', ');

    return e(Section, { title: `Kielenhuolto: ${chapterTitle}` },
      e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' } },
        e('div', { className: 'faust-meta' }, READY_TEXT),
        modelLines(),
        e('label', { className: 'faust-check' },
          e('input', { type: 'checkbox', checked: proofOptions.skipQuoteLines !== false, onChange: (ev) => setProofread({ skipQuoteLines: ev.target.checked }) }),
          'Ohita lainausrivit (>)'),
        // The hint belongs to the checkbox's label (VF-22): under its text, read with it
        e('label', { className: 'faust-check' },
          e('input', { type: 'checkbox', checked: proofOptions.skipDialogue === true, onChange: (ev) => setProofread({ skipDialogue: ev.target.checked }) }),
          e('span', { style: { display: 'flex', flexDirection: 'column' } },
            'Ohita vuorosanat',
            e('span', { className: 'faust-check__hint', style: { marginLeft: 0 } }, 'Vuorosanaviivalla alkavat rivit jätetään pois, eikä lainausmerkkien sisällä olevaa tekstiä muuteta.'))),
        e(Field, { label: 'Tahallista / huomioi' },
          e('textarea', {
            className: 'faust-textarea faust-textarea--author',
            rows: 3,
            maxLength: 1000,
            placeholder: 'Esimerkiksi: murre repliikeissä, puhekielen ”ketä”',
            value: (project && project.keepNote) || '',
            onChange: (ev) => {
              const value = ev.target.value.slice(0, 1000);
              updateProject(prev => ({ ...prev, keepNote: value }));
            }
          })),
        blocked
          ? e(Callout, { role: 'hint' }, blocked)
          : e(React.Fragment, null,
              preview.rowProps && e(ContextRow, preview.rowProps),
              e('div', { className: 'faust-field__hint' },
                `Lähetetään ${count(lines, 'rivi')} ${formatCount(plan.batches.length)} erässä. Ei lähetetä: ${notSent}.`),
              dashNotice(plan.dashListLines),
              // Without a model the run would only end in "Mallia ei ole valittu": the button says
              // what to do first (M B.8); the span carries the title of the disabled button
              e('span', { title: editModel ? undefined : NO_MODEL_REASON, style: { display: 'block' } },
                blockButton('Aloita', () => startRun(false), {
                  primary: true,
                  icon: icons.star8({ size: 14 }),
                  title: editModel ? undefined : NO_MODEL_REASON,
                  disabled: !editModel || !!(preview.built && (preview.built.overBudget || preview.built.blocked))
                })))));
  };

  const proofreadRunning = () => {
    const p = run.progress || {};
    const percent = p.linesTotal > 0 ? (p.linesDone / p.linesTotal) * 100 : 0;
    return e(Section, { title: `Kielenhuolto: ${chapterTitle}` },
      e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
        // The same block as a running check of the Tarkistus tab: a spinner on the progress line and a
        // bar that moves. Until the first lines are back the bar has nothing to show (an empty track
        // read as a divider), so it runs without a value
        e('div', { className: 'faust-meta', role: 'status', style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' } },
          e('span', { className: 'faust-spinner faust-spinner--sm', 'aria-hidden': 'true' }),
          `Erä ${formatCount(Math.min((p.batchIndex || 0) + 1, Math.max(1, p.batchCount || 1)))}/${formatCount(Math.max(1, p.batchCount || 1))} · ${count((run.totals.corrections || 0) + (p.corrections || 0), 'korjaus')}`),
        percent > 0
          ? e(Progress, { value: percent, label: 'Kielenhuolto' })
          : e(Progress, { indeterminate: true, label: 'Kielenhuolto' }),
        blockButton('Pysäytä', stopRun, { icon: icons.stop({ size: 14 }) })));
  };

  const proofreadResult = () => {
    const result = run.result || {};
    const totals = run.totals;
    const mine = run.groupId ? pending.filter(item => item.groupId === run.groupId) : [];
    const dialogue = mine.filter(item => item.meta && item.meta.dialogue === true).length;
    const bulk = mine.length - dialogue;
    const summary = runSummary({ ...totals, status: result.status });
    const failures = (result.failedBatches || []).map(failure => `Erä ${formatCount(failure.index + 1)} epäonnistui: ${reasonOf(failure.message)}.`);
    const stoppedEarly = result.status === 'stopped' || result.status === 'failed';
    const place = stoppedEarly ? resumePlace(text, result.resumeLine) : null;
    const first = stoppedEarly && result.resumeLine ? batchNumberOf(run.plan, result.resumeLine.index) : null;

    const rewritten = totals.setAside.filter(entry => entry.reason === 'rewritten');
    const elsewhere = totals.setAside.filter(entry => entry.reason !== 'rewritten');
    // Into the run's group; when no batch placed a change the run has none yet, and the first of these
    // proposals makes it, so Hyväksy loput, Hylkää loput and the dialogue line count them
    const suggestAnyway = (entry) => {
      const res = propose(setAsideChanges(entry, entry, textDeps), entry.baseText, PROOFREAD_META, run.groupId);
      if (!run.groupId && res && res.groupId) {
        const groupId = res.groupId;
        setRun(current => (current && current.chapterId === run.chapterId && !current.groupId ? { ...current, groupId } : current));
      }
    };

    return e(React.Fragment, null,
      e(Section, { title: `Kielenhuolto: ${chapterTitle}` },
        e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
          e('div', { className: 'faust-serif', role: 'status' }, summary),
          e('div', { className: 'faust-meta' },
            `Lähetetty ${count(totals.linesSent, 'rivi')} · ennallaan ${formatCount(totals.linesUnchanged)} · korjattu ${formatCount(totals.linesChanged)}`),
          result.status === 'failed' && result.error && e(Callout, { role: 'error' }, result.error),
          failures.length > 0 && e(Callout, { role: 'error' }, failures.map((line, i) => e('div', { key: i }, line))),
          dialogue > 0 && e(Callout, { role: 'warning' }, `Vuorosanojen ehdotuksia: ${formatCount(dialogue)}. Käy ne läpi yksitellen.`),
          mine.length > 0 && blockButton(`Hyväksy loput (${formatCount(bulk)})`,
            () => controller.acceptAll({ groupId: run.groupId, reason: 'Ennen kielenhuoltoa: ' + chapterTitle }),
            { primary: true, disabled: bulk === 0, title: bulk === 0 ? 'Käy vuorosanojen ehdotukset läpi yksitellen.' : undefined }),
          mine.length > 0 && blockButton('Hylkää loput', () => controller.rejectAll({ groupId: run.groupId }), { quiet: true }),
          mine.length > 0 && e('div', { className: 'faust-field__hint' },
            `Ennen hyväksymistä otetaan tilannekuva nimellä ”Ennen kielenhuoltoa: ${chapterTitle}”. Automaattisista tilannekuvista säilytetään kolme uusinta.`),
          stoppedEarly && first && e('div', { className: 'faust-meta' }, notRunText(first, run.plan.batches.length)),
          stoppedEarly && place
            ? blockButton('Jatka', () => startRun(true))
            : blockButton('Aja uudelleen', () => setRun(null)),
          // The dash-line notice was read before the run; after it, it stands under the result's own
          // actions and no longer between the count and Hyväksy loput
          dashNotice(result.dashListLines || 0))),
      rewritten.length > 0 && e(Section, { title: `Malli kirjoitti uudelleen (${formatCount(rewritten.length)})` },
        rewritten.map((entry, i) => e(ListRow, {
          key: entry.key + ':' + i,
          actions: [
            e(React.Fragment, { key: 'show' }, smallButton('Näytä', 'Näytä kohta tekstissä', () => revealPassage(entry.original, entry.from))),
            e(React.Fragment, { key: 'fix' }, smallButton('Ehdota silti', null, () => suggestAnyway(entry)))
          ]
        },
          e('span', { className: 'faust-quote' }, entry.original.length > 80 ? entry.original.slice(0, 80) + '…' : entry.original),
          e('span', { className: 'faust-row__meta' }, `muuttui ${formatCount(Math.round((entry.ratio || 0) * 100))} %`)))),
      elsewhere.length > 0 && e(Section, { title: `Ei kohdistunut (${formatCount(elsewhere.length)})` },
        elsewhere.map((entry, i) => e(ListRow, {
          key: entry.key + ':' + i,
          actions: [
            e(React.Fragment, { key: 'show' }, smallButton('Näytä', 'Näytä kohta tekstissä', () => revealPassage(entry.original, entry.from))),
            entry.reason === 'suspect' && e(React.Fragment, { key: 'fix' }, smallButton('Ehdota silti', null, () => suggestAnyway(entry)))
          ]
        },
          e('span', { className: 'faust-quote' }, entry.original.length > 80 ? entry.original.slice(0, 80) + '…' : entry.original),
          e('span', { className: 'faust-row__meta' }, setAsideReason(entry))))),
    );
  };

  const proofreadBody = () => {
    const mineRun = run && run.chapterId === chapterId ? run : null;
    if (mineRun && mineRun.status === 'running') return proofreadRunning();
    if (mineRun && mineRun.result) return proofreadResult();
    return proofreadReady();
  };

  // --- Voikko ---
  const voikkoBody = () => {
    if (!voikko) return null;
    const recheck = blockButton('Tarkista uudelleen', () => refreshCheckers(true));
    if (!voikko.available) {
      const checkButton = e('span', { title: VOIKKO_MISSING, style: { display: 'block' } },
        blockButton('Tarkista tämä luku', null, { primary: true, disabled: true }));
      if (voikko.reason === 'no-dictionary' || voikko.reason === 'probe-failed') {
        return e(Section, null,
          e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
            e(Callout, { role: 'warning', actions: recheck }, voikko.reason === 'no-dictionary'
              ? 'Voikko löytyi, mutta suomen sanasto ei lataudu. Asenna Voikko uudelleen komennolla brew reinstall libvoikko.'
              : 'Voikko löytyi, mutta koeajo epäonnistui.'),
            checkButton));
      }
      return e(Section, null,
        e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
          e(Callout, {
            role: 'info',
            title: 'Voikkoa ei löytynyt tältä koneelta.',
            actions: e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', width: '100%' } },
              blockButton('Kopioi komento', () => {
                if (navigator.clipboard) navigator.clipboard.writeText(INSTALL_COMMAND).catch(() => {});
              }),
              recheck)
          },
            e('div', null, 'Voikko on vapaa suomen oikoluku- ja kielioppimoottori. Se toimii ilman verkkoa eikä lähetä tekstiä minnekään.'),
            e('div', { style: { marginTop: 'var(--sp-2)' } }, 'Asenna se Terminaalissa:'),
            e('input', { className: 'faust-input', readOnly: true, value: INSTALL_COMMAND, 'aria-label': 'Asennuskomento', spellCheck: false, style: { marginTop: 'var(--sp-1)' } })),
          checkButton));
    }

    const mine = voikkoRun && voikkoRun.chapterId === chapterId ? voikkoRun : null;
    const busy = !!(mine && mine.status === 'running');
    const findings = mine && mine.status === 'done' ? mine.findings : [];
    const words = voikkoWordRows(findings, ignored);
    const grammar = findings.filter(finding => finding.kind === 'kielioppi');
    // The state in words; where the tools were found is a path, which belongs in the tooltip
    const where = (voikko.version ? `Voikko ${voikko.version}` : 'Voikko') + ' käytössä';
    const offer = (finding, suggestion) => propose([voikkoChange(finding, suggestion)], mine.baseText, VOIKKO_META);
    const showFinding = (finding) => revealPassage(finding.quote, finding.from);

    return e(React.Fragment, null,
      e(Section, null,
        e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
          e('div', { className: 'faust-meta' }, where),
          blockButton(busy ? 'Tarkistetaan…' : 'Tarkista tämä luku', runVoikko, {
            primary: true, busy, disabled: busy,
            icon: busy ? e('span', { className: 'faust-spinner faust-spinner--sm' }) : null
          }),
          mine && mine.status === 'error' && e(Callout, { role: 'error' }, `Voikon ajo epäonnistui: ${mine.error}.`),
          mine && mine.status === 'done' && words.length === 0 && grammar.length === 0 &&
            e(EmptyState, { size: 'compact', title: 'Voikko ei löytänyt huomautettavaa.' }))),
      mine && mine.status === 'done' && words.length > 0 && e(Section, { title: `Tuntemattomat sanat (${formatCount(words.length)})` },
        words.map(row => e(ListRow, {
          key: row.word,
          actions: [
            e(React.Fragment, { key: 'show' }, smallButton('Näytä', 'Näytä kohta tekstissä', () => showFinding(row.first))),
            ...row.suggestions.map(suggestion => e(React.Fragment, { key: 's:' + suggestion },
              smallButton(`Ehdota: ${suggestion}`, null, () => offer(row.first, suggestion)))),
            e(React.Fragment, { key: 'skip' }, smallButton('Ohita sana', null, () => setIgnored(prev => new Set([...prev, row.word]))))
          ]
        }, e('span', { className: 'faust-quote' }, row.count > 1 ? `${row.word} ×${formatCount(row.count)}` : row.word)))),
      mine && mine.status === 'done' && (grammar.length > 0 || !voikko.hasGrammar) && e(Section, { title: `Kielioppi (${formatCount(grammar.length)})` },
        !voikko.hasGrammar
          ? e('div', { className: 'faust-field__hint' }, 'Kielioppitarkistin (voikkogc) ei ole käytettävissä.')
          : grammar.map(finding => e(ListRow, {
            key: finding.id,
            actions: [
              e(React.Fragment, { key: 'show' }, smallButton('Näytä', 'Näytä kohta tekstissä', () => showFinding(finding))),
              finding.suggestions && finding.suggestions[0] !== undefined && e(React.Fragment, { key: 'fix' },
                smallButton(`Ehdota: ${finding.suggestions[0]}`, null, () => offer(finding, finding.suggestions[0])))
            ]
          },
            finding.message && e('span', null, finding.message),
            e(Excerpt, { text: mine.baseText, from: finding.from, to: finding.to })))),
      e(Section, { title: 'Perusmuodot (kokeilu)' },
        !voikko.hasMorphology
          ? e('div', { className: 'faust-field__hint' }, 'Tämä Voikon asennus ei anna perusmuotoja.')
          : e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
              // What the form is for, before its fields (the heading alone said only "kokeilu")
              e('div', { className: 'faust-field__hint' },
                'Vertaa, montako nimen tai sanan taivutusmuotoa tästä luvusta löytyy Voikon perusmuodolla ja montako sanavartalolla.'),
              e(Field, { label: 'Nimi tai sana' },
                e('input', { className: 'faust-input faust-input--sm', value: baseForm.name, placeholder: 'Esimerkiksi Aino', onChange: (ev) => setBaseForm({ ...baseForm, name: ev.target.value, result: null }) })),
              e(Field, { label: 'Vartalo (valinnainen)' },
                e('input', { className: 'faust-input faust-input--sm', value: baseForm.stem, placeholder: 'Esimerkiksi Aino', onChange: (ev) => setBaseForm({ ...baseForm, stem: ev.target.value, result: null }) })),
              // A block button, as the panel's other actions; why it waits is its title (M B.8)
              e('span', { title: baseForm.name.trim() ? undefined : 'Kirjoita ensin nimi tai sana', style: { display: 'block' } },
                blockButton('Vertaa', compareBaseForms, { disabled: baseForm.busy || !baseForm.name.trim(), title: baseForm.name.trim() ? undefined : 'Kirjoita ensin nimi tai sana' })),
              baseForm.result && baseForm.result.error && e(Callout, { role: 'error' }, `Voikon ajo epäonnistui: ${baseForm.result.error}.`),
              baseForm.result && baseForm.result.unknown && e(Callout, { role: 'hint' }, 'Voikko ei tunne tätä sanaa, joten perusmuotohaku ei löydä sitä.'),
              baseForm.result && baseForm.result.byLemma && e('div', { className: 'faust-meta' },
                e('div', null, `Perusmuodolla ${count(baseForm.result.byLemma.length, 'osuma')}, vartalolla ${count(baseForm.result.byStem.length, 'osuma')}.`),
                baseForm.result.onlyLemma.length > 0 && e('div', null, `Vain perusmuodolla: ${baseForm.result.onlyLemma.join(', ')}`),
                baseForm.result.onlyStem.length > 0 && e('div', null, `Vain vartalolla: ${baseForm.result.onlyStem.join(', ')}`)))));
  };

  const body = shown === 'typography' ? typographyBody() : shown === 'proofread' ? proofreadBody() : voikkoBody();
  return e('div', { className: 'faust-panel' },
    head,
    tabRow,
    e('div', { className: 'faust-panel__body', role: 'tabpanel', 'aria-label': (tabs.find(tab => tab.id === shown) || {}).label }, body),
    shown === 'typography' ? typographyFoot() : null);
}
