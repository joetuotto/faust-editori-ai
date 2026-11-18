/**
 * src/components/ReviewPanel.js - Tarkistus, the fifth tab of Tietopaneeli (stage I-08; report 4.9 slices 1–4).
 *
 *   ReviewPanel(props)
 *     controller, view        the review controller (src/services/review/reviewController.js) and its view()
 *     project, chapter, text  the project, the open chapter and its live text
 *     aiOff                   aiDisabled of app.js: only the checks that work without a model are offered
 *     aiConfig                the reactive AI config (aiSource), so the model line follows a model change
 *     onOpenLanguageTool(mode)    Kielen työkalut ('typography' | 'proofread'); without it the foot is not drawn
 *     onOpenProjectSettings(), onOpenAISettings(), onOpenCodexEntry(id), onSelectChapter(id)
 *     onEditCheck(request)    opens the own-check dialog that app.js mounts: { check: StoredCustom | null }
 *     askConfirm              the app's question (Poista tarkistus of a selected own check)
 *
 * A view over the controller: everything that must outlive the tab (the running check, the selected check,
 * the filter, the selected finding, failures) is the controller's. The panel keeps only what the "Mitä malli
 * näkee" row switched off, so that the row and the run send the same thing, and the draft of the limit field.
 * Local checks update by themselves; a model check runs on Tarkista, one batch at a time, and its findings
 * are written to the chapter when it ends. No numeric score appears anywhere here: the reading feedback
 * (Lukupalaute) is two groups, Toimii and Huolet, with a severity word on each concern.
 *
 * Composition: reconcile R-83 and visual foundations entries VF-23 (parts and markup), VF-2 (data-severity
 * and the icon of a card) and VF-49 (run results as callouts, never coloured text). Classes of
 * styles/faust-components.css; style objects hold layout only. Buttons that act on the editor keep its
 * selection (mousedown is not let through). No key handling of its own and nothing on Esc (R-70).
 *
 * Bundled with app.js by webpack. Uses the global React like the rest of the app.
 */
import { icons } from './icons.js';
import { Section, Callout, EmptyState, Progress, Field, Segmented, IconButton } from './ui.js';
import { count } from './Dialogs.js';
import { AiModelBadge } from './AiModelSettings.js';
import { ContextRow, useContextPreview } from './ContextRow.js';
import { useSetting } from './useSetting.js';
import { saveCustomCheck, DELETE_QUESTION } from './ReviewCheckDialog.js';
import { checksFor, findCheck, describeCheck } from '../services/review/reviewChecks.js';
import { STATUS_LABELS, STATUS_HINTS, statusesFor } from '../services/review/findings.js';
import { plainView } from '../editor/plainView.js';
import { projectKind, folderName } from '../services/story/codex.js';
import { MESSAGES } from '../services/ai/contextBuilder.js';
import { getContextSession } from '../services/ai/contextSession.js';
import { formatCount, AI_OFF_SENTENCE } from '../services/format.fi.js';

const { createElement: e, useState, useEffect, useRef } = React;

const NEW_CHECK = '__new';
const TASK_ID = 'review';
const QUOTE_MAX = 160;

const TEXT = Object.freeze({
  check: 'Tarkistus',
  newCheck: 'Uusi oma tarkistus…',
  edit: 'Muokkaa',
  remove: 'Poista tarkistus',
  aiOff: `${AI_OFF_SENTENCE} Käytössä ovat tarkistukset, jotka toimivat ilman mallia.`,
  scope: 'Laajuus:',
  scopeHint: 'Valitse tekstiä, jos haluat tarkistaa vain osan.',
  scopeLocked: 'Lukupalaute annetaan aina koko luvusta.',
  avoidEmpty: 'Vältettävien sanojen lista on tyhjä. Lisää sanat projektin asetuksissa.',
  editList: 'Muokkaa listaa',
  limit: 'Raja:',
  limitUnit: 'sanaa',
  limitHint: 'Virke näytetään, kun siinä on tätä enemmän sanoja.',
  note: 'Tahallista / huomioi',
  notePlaceholder: 'Esimerkiksi: Liisan repliikit ovat murretta. Lyhyet virkkeet ovat tyylikeino.',
  noteHint: 'Teksti lähetetään mallille jokaisen tarkistuksen mukana.',
  run: 'Tarkista',
  stop: 'Pysäytä',
  blockedLocal: 'Tarkistukset, jotka toimivat ilman mallia, ovat käytössä.',
  empty: 'Luvussa ei ole tekstiä.',
  noChapter: 'Avaa luku, jonka haluat tarkistaa.',
  live: 'Lista päivittyy itsestään, kun kirjoitat.',
  retry: 'Yritä uudelleen',
  errors: 'Näytä virheet',
  answerStart: 'Mallin vastauksen alku:',
  close: 'Sulje',
  show: 'Näytä:',
  onlyCheck: 'Vain valittu tarkistus',
  previous: 'Edellinen havainto',
  next: 'Seuraava havainto',
  noQuote: '(ei lainausta)',
  unlocated: 'sijaintia ei löytynyt',
  unlocatedTitle: 'Lainausta ei löytynyt tekstistä. Malli on voinut mukailla sitä, tai kohta on muuttunut.',
  approx: 'likimääräinen sijainti',
  approxTitle: 'Lainaus löytyi vain osittain. Tarkista kohta itse.',
  suggestion: 'Ehdotus:',
  showFix: 'Näytä ehdotus',
  open: 'Avaa',
  openChapter: 'Avaa luku',
  noCompare: 'vertailukohtaa ei löytynyt taustatiedoista',
  guide: 'Kielitoimiston ohje',
  noHits: 'Ei osumia',
  noneHere: 'Ei havaintoja tällä rajauksella',
  works: 'Toimii',
  concerns: 'Huolet',
  tools: 'Kielen työkalut',
  typography: 'Tarkista typografia',
  proofread: 'Kielenhuolto…',
  toolsHint: 'Työkalut avautuvat omaan paneeliinsa. Samat toiminnot ovat Työkalut-valikossa.',
  proofreadBlocked: 'Tämä luku on merkitty ”Ei tekoälylle”.',
  modelLine: 'Virheelliseksi merkityt mallin havainnot: ',
  modelLineTitle: 'Laskettu tämän projektin havainnoista. Kertoo mallista, ei tekstistäsi.',
  clear: 'Tyhjennä tämän tarkistuksen havainnot'
});

const FILTERS = [
  ['open', 'Avoimet'],
  ['done', 'Tehdyt'],
  ['disagree', 'Eri mieltä'],
  ['invalid', 'Virheelliset'],
  ['all', 'Kaikki']
];

// The severity word of a concern and its chip (visual foundations entry VF-2); what works has none
const SEVERITY_CHIP = {
  high: { word: 'suuri', role: 'error' },
  medium: { word: 'keskisuuri', role: 'warning' },
  low: { word: 'pieni', role: 'info' }
};

// A button that acts on the editor keeps the editor's selection and focus
const keepEditor = (ev) => ev.preventDefault();

const isFeedbackFinding = (finding) => !!(finding.data && Object.prototype.hasOwnProperty.call(finding.data, 'severity'));

// The card's data-severity and icon (VF-2): local hits and what works are notes, a serious concern an
// error, the other findings the default (warning)
function severityOf(finding) {
  if (finding.kind === 'local') return { attr: 'note', icon: 'info' };
  if (isFeedbackFinding(finding)) {
    const severity = finding.data.severity;
    if (severity === 'works' || severity === 'low') return { attr: 'note', icon: 'info' };
    if (severity === 'high') return { attr: 'error', icon: 'error' };
  }
  return { attr: undefined, icon: 'warning' };
}

// A quote as the card shows it: notes and <u> tags left out, one line, at most 160 characters
function shownQuote(quote) {
  const plain = plainView(String(quote || '')).text.replace(/\s+/g, ' ').trim();
  if (!plain) return null;
  return plain.length > QUOTE_MAX ? plain.slice(0, QUOTE_MAX).trimEnd() + '…' : plain;
}

const wordsOn = (project) => (project && Array.isArray(project.avoidWords)
  ? project.avoidWords.filter(word => String(word || '').trim() !== '').length
  : 0);

/** The disabled control's reason in a tooltip: a disabled button shows none of its own (M B.8). */
function withReason(reason, control) {
  return reason ? e('span', { title: reason, style: { display: 'block' } }, control) : control;
}

export function ReviewPanel(props) {
  const {
    controller, view, project, text, aiOff,
    aiConfig, onOpenLanguageTool, onOpenProjectSettings, onOpenAISettings, onOpenCodexEntry, onSelectChapter,
    onEditCheck, askConfirm
  } = props;

  const [customChecks] = useSetting('review.customChecks', []);
  // What the "Mitä malli näkee" row switched off and added by hand: the row, the plan of the batches and
  // the run all take the same choice (the row keeps its own copy; both change in one event)
  const [choice, setChoice] = useState(() => ({ exclude: getContextSession().getExclude(TASK_ID), include: [] }));
  // The limit field while it is typed in: 1 on the way to 12 is not a limit
  const [limitDraft, setLimitDraft] = useState(null);
  const rootRef = useRef(null);

  const check = view.check;
  const isLocal = check.kind === 'local';
  const isOwn = check.builtin === false;
  const folder = folderName(project);
  const hasChapter = view.chapterId !== null;
  const running = view.running;
  const runningHere = !!(running && running.here);

  // The row's request: the first batch of the plan, built with the row's choice (sends nothing)
  const plan = !isLocal && hasChapter && !aiOff ? controller.preview(choice) : null;
  // A built-in check's instruction is FAUST's, not the author's: the row names it "ohje" (as Kielenhuolto's);
  // an own check's is "oma ohje". The label is the row's only; what is sent is the same.
  const task = plan && plan.batches > 0
    ? { ...plan.task, payload: plan.payload, ...(check.builtin === false ? {} : { instructionLabel: 'ohje' }) }
    : null;
  const preview = useContextPreview({
    task,
    project,
    chapterId: view.chapterId,
    text,
    role: 'analysis',
    answerTokens: task ? task.answerTokens : undefined,
    disabled: !task || view.blocked
  });
  const rowProps = preview.rowProps && {
    ...preview.rowProps,
    onExcludeChange: (ids) => { preview.rowProps.onExcludeChange(ids); setChoice(prev => ({ ...prev, exclude: ids })); },
    onIncludeChange: (ids) => { preview.rowProps.onIncludeChange(ids); setChoice(prev => ({ ...prev, include: ids })); }
  };

  // A finding chosen in the text: its card comes into view in the list
  useEffect(() => {
    if (view.selectedBy !== 'editor' || !view.selectedId || !rootRef.current) return;
    const card = Array.from(rootRef.current.querySelectorAll('[data-id]')).find(node => node.getAttribute('data-id') === view.selectedId);
    if (card && card.scrollIntoView) card.scrollIntoView({ block: 'nearest' });
  }, [view.selectedId, view.selectedBy]);

  // A draft left in the limit field belongs to the check it was typed for
  useEffect(() => { setLimitDraft(null); }, [view.check.id]);

  const startRun = () => controller.run(choice);

  // --- 1 Check ---
  const groups = checksFor(projectKind(project), { customChecks, aiOff });
  const storedOwn = isOwn ? (Array.isArray(customChecks) ? customChecks : []).find(entry => entry && entry.id === check.id) || null : null;
  const removeOwn = async () => {
    if (!storedOwn || typeof askConfirm !== 'function') return;
    const yes = await askConfirm(DELETE_QUESTION.title, DELETE_QUESTION.message, DELETE_QUESTION.confirm, 'Peruuta', { danger: true });
    if (yes) saveCustomCheck({ delete: true }, { check: storedOwn }, controller);
  };
  const picker = e(Field, { label: TEXT.check, hint: describeCheck(check, folder) },
    e('select', {
      className: 'faust-select faust-select--sm',
      value: check.id,
      onChange: (ev) => {
        const id = ev.target.value;
        if (id === NEW_CHECK) {
          if (onEditCheck) onEditCheck({ check: null });
          return;
        }
        const next = findCheck(id, customChecks);
        if (next) controller.selectCheck(next);
      }
    },
      groups.map(group => e('optgroup', { key: group.group, label: group.label },
        group.checks.map(item => e('option', { key: item.id, value: item.id }, item.label)))),
      !aiOff && onEditCheck && e('option', { value: NEW_CHECK }, TEXT.newCheck)));

  const checkPart = e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
    picker,
    storedOwn && e('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' } },
      e('button', { type: 'button', className: 'faust-btn faust-btn--quiet faust-btn--sm', onClick: () => onEditCheck && onEditCheck({ check: storedOwn }) }, TEXT.edit),
      e('button', { type: 'button', className: 'faust-btn faust-btn--quiet faust-btn--sm', onClick: removeOwn }, TEXT.remove)),
    aiOff && e(Callout, { role: 'info' }, TEXT.aiOff));

  if (!hasChapter) {
    return e('div', { ref: rootRef, className: 'faust-review' },
      e(Section, null, checkPart, e('div', { style: { marginTop: 'var(--sp-3)' } }, e(Callout, { role: 'hint' }, TEXT.noChapter))));
  }

  // --- 2 Scope ---
  const selectionOff = view.scopeLocked || !view.hasSelection;
  const scopePart = e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' } },
    e('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }, onMouseDown: keepEditor },
      e('span', { className: 'faust-field__label' }, TEXT.scope),
      e(Segmented, {
        label: 'Laajuus',
        value: view.scope,
        onChange: (scope) => controller.setScope(scope),
        items: [
          { value: 'chapter', label: 'Luku' },
          {
            value: 'selection',
            label: 'Valinta',
            disabled: selectionOff,
            title: view.scopeLocked ? TEXT.scopeLocked : !view.hasSelection ? TEXT.scopeHint : undefined
          }
        ]
      })),
    view.scopeLocked
      ? e('div', { className: 'faust-field__hint' }, TEXT.scopeLocked)
      : !view.hasSelection && e('div', { className: 'faust-field__hint' }, TEXT.scopeHint));

  // --- 3 Settings of the check ---
  let settings = null;
  if (check.id === 'avoid-words') {
    const words = wordsOn(project);
    settings = e('div', { style: { display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 'var(--sp-1) var(--sp-2)' } },
      words > 0 && e('span', { className: 'faust-meta' }, `Listalla ${count(words, 'sana')}.`),
      e('button', { type: 'button', className: 'faust-btn faust-btn--quiet faust-btn--sm', onClick: onOpenProjectSettings }, TEXT.editList));
  } else if (check.id === 'long-sentences') {
    const commit = (raw) => {
      const value = parseInt(raw, 10);
      if (Number.isFinite(value)) controller.setLongSentenceWords(value);
    };
    settings = e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' } },
      e('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' } },
        e('label', { className: 'faust-field__label', htmlFor: 'faust-review-limit' }, TEXT.limit),
        e('input', {
          id: 'faust-review-limit',
          type: 'number',
          className: 'faust-input faust-input--sm',
          min: 8,
          max: 120,
          style: { width: '6em' },
          'aria-describedby': 'faust-review-limit-hint',
          value: limitDraft !== null ? limitDraft : String(view.longSentenceWords),
          onChange: (ev) => {
            const raw = ev.target.value;
            setLimitDraft(raw);
            const value = parseInt(raw, 10);
            // A limit inside the range takes effect at once; anything else when the field is left
            if (Number.isFinite(value) && value >= 8 && value <= 120) commit(raw);
          },
          onBlur: (ev) => { commit(ev.target.value); setLimitDraft(null); }
        }),
        e('span', { className: 'faust-meta' }, TEXT.limitUnit)),
      e('div', { id: 'faust-review-limit-hint', className: 'faust-field__hint' }, TEXT.limitHint));
  } else if (!isLocal) {
    settings = e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
      e(Field, { label: TEXT.note, hint: TEXT.noteHint },
        e('textarea', {
          className: 'faust-textarea faust-textarea--author',
          rows: 3,
          maxLength: 1000,
          placeholder: TEXT.notePlaceholder,
          value: view.note,
          onChange: (ev) => controller.setNote(ev.target.value)
        })),
      e(AiModelBadge, { role: 'analysis', onOpenSettings: onOpenAISettings, config: aiConfig }),
      !view.blocked && rowProps && e(ContextRow, rowProps),
      !view.blocked && plan && plan.blocked && e('div', { className: 'faust-meta' }, plan.blocked),
      !view.blocked && plan && plan.batches > 1 && e('div', { className: 'faust-field__hint' }, `Teksti lähetetään ${formatCount(plan.batches)} osassa.`));
  }

  // --- 4 Action ---
  let action = null;
  if (isLocal) {
    action = e('div', { className: 'faust-meta' }, TEXT.live);
  } else {
    const stopButton = e('button', { type: 'button', className: 'faust-btn faust-btn--block', onClick: () => controller.stop() },
      icons.stop({ size: 14 }), TEXT.stop);
    if (running && runningHere) {
      const step = running.batches > 0 ? ` osa ${running.batch}/${running.batches}` : '';
      const found = running.found > 0 ? ` · ${count(running.found, 'havainto')}` : '';
      action = e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }, 'aria-live': 'polite' },
        e('div', { className: 'faust-meta', style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' } },
          e('span', { className: 'faust-spinner faust-spinner--sm', 'aria-hidden': 'true' }),
          `Tarkistetaan…${step}${found}`),
        e(Progress, { indeterminate: true, label: 'Tarkistus' }),
        stopButton);
    } else if (running) {
      action = e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
        e('div', { className: 'faust-meta' }, `Tarkistus on käynnissä luvussa ”${running.chapterTitle}”.`),
        stopButton);
    } else {
      let reason = null;
      let callout = null;
      if (view.blocked) {
        reason = TEXT.proofreadBlocked;
        callout = e(Callout, { role: 'hint' }, e('div', null, MESSAGES.noAI), e('div', null, TEXT.blockedLocal));
      } else if (!view.hasText) {
        reason = TEXT.empty;
        callout = e(Callout, { role: 'hint' }, TEXT.empty);
      } else if (view.scope === 'selection' && !view.hasSelection && !view.scopeLocked) {
        reason = 'Valitse ensin tekstiä tai vaihda laajuudeksi Luku.';
      }
      action = e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
        callout,
        withReason(reason, e('button', {
          type: 'button',
          className: 'faust-btn faust-btn--primary faust-btn--block',
          disabled: !!reason,
          onMouseDown: keepEditor,
          onClick: startRun
        }, icons.star8({ size: 14 }), TEXT.run)));
    }
  }

  // --- 5 Result of the last run, the controller's notice, the local check's message ---
  const result = [];
  const last = view.lastRun;
  if (last && !runningHere) {
    const lines = last.lines.map((line, index) => e('div', { key: index }, line));
    const canRetry = !running && !view.blocked && view.hasText;
    const retry = canRetry && e('button', {
      type: 'button',
      className: 'faust-btn faust-btn--sm',
      onMouseDown: keepEditor,
      onClick: startRun
    }, TEXT.retry);
    if (last.kind === 'error') result.push(e(Callout, { key: 'run', role: 'error', actions: retry || null }, lines));
    else if (last.kind === 'warn') result.push(e(Callout, { key: 'run', role: 'warning', actions: retry || null }, lines));
    else result.push(e('div', { key: 'run', className: 'faust-meta' }, lines));
    if (last.failed && last.failed.length > 0) {
      result.push(e('details', { key: 'failed', className: 'faust-disclosure' },
        e('summary', null, icons.chevronRight({ size: 14 }), TEXT.errors),
        e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)', marginTop: 'var(--sp-1)' } },
          last.failed.map(row => e('div', { key: row.index, className: 'faust-meta' },
            // The batch index counts from 0; the author counts the parts from 1, as the progress line does
            e('div', null, `Osa ${row.index + 1}: ${row.message}`),
            row.answer && e('div', null, TEXT.answerStart),
            row.answer && e('div', { className: 'faust-meta is-selectable' }, row.answer))))));
    }
  }
  if (view.localMessage) result.push(e('div', { key: 'local', className: 'faust-meta' }, view.localMessage));
  if (view.notice) {
    result.push(e(Callout, {
      key: 'notice',
      role: 'warning',
      actions: e('button', { type: 'button', className: 'faust-btn faust-btn--quiet faust-btn--sm', onClick: () => controller.dismissNotice() }, TEXT.close)
    }, view.notice));
  }

  // --- 6 Filter ---
  const counts = view.counts;
  const canBeInvalid = !isLocal || !view.filter.onlyCheck;
  const located = view.findings.filter(finding => finding.located).length;
  const filterPart = e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' } },
    e('div', { style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--sp-1) var(--sp-2)' } },
      e('label', { className: 'faust-field__label', htmlFor: 'faust-review-filter' }, TEXT.show),
      e('select', {
        id: 'faust-review-filter',
        className: 'faust-select faust-select--sm',
        style: { flex: '1 1 8em', width: 'auto', minWidth: 0 },
        value: view.filter.status,
        onChange: (ev) => controller.setFilter({ status: ev.target.value })
      },
        FILTERS.filter(([id]) => id !== 'invalid' || canBeInvalid || view.filter.status === 'invalid')
          .map(([id, label]) => e('option', { key: id, value: id }, `${label} (${formatCount(counts[id] || 0)})`))),
      e('span', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-1)' }, onMouseDown: keepEditor },
        e(IconButton, { icon: 'chevronUp', label: TEXT.previous, size: 'sm', disabled: located === 0, onClick: () => controller.step(-1) }),
        e('span', { className: 'faust-meta faust-num' },
          `${view.position ? formatCount(view.position.index) : '–'} / ${formatCount(view.findings.length)}`),
        e(IconButton, { icon: 'chevronDown', label: TEXT.next, size: 'sm', disabled: located === 0, onClick: () => controller.step(1) }))),
    e('label', { className: 'faust-check' },
      e('input', { type: 'checkbox', checked: view.filter.onlyCheck, onChange: (ev) => controller.setFilter({ onlyCheck: ev.target.checked }) }),
      TEXT.onlyCheck));

  // --- 7 Cards ---
  const card = (finding) => {
    const active = finding.id === view.selectedId;
    const { attr, icon } = severityOf(finding);
    const quote = shownQuote(finding.quote);
    const severity = isFeedbackFinding(finding) ? SEVERITY_CHIP[finding.data.severity] : null;
    const convert = finding.kind === 'local' && finding.data && finding.data.convert;
    const canFix = !isFeedbackFinding(finding) && (!!finding.suggestion || !!convert);
    const ref = finding.kind === 'continuity' ? finding.ref : null;
    const url = finding.data && typeof finding.data.url === 'string' ? finding.data.url : null;
    const select = () => controller.select(finding.id);
    const stop = (ev) => ev.stopPropagation();

    let openRef = null;
    if (ref && ref.id && ref.kind === 'codex' && onOpenCodexEntry) {
      const where = folder === 'Käsikirjoituksen kansio' ? 'Käsikirjoituksen kansiossa' : 'Tarinakansiossa';
      openRef = { title: `Avaa kohde ${where}`, act: () => onOpenCodexEntry(ref.id) };
    } else if (ref && ref.id && ref.kind === 'summary' && onSelectChapter) {
      openRef = { title: TEXT.openChapter, act: () => onSelectChapter(ref.id) };
    }

    return e('div', {
      key: finding.id,
      'data-id': finding.id,
      role: 'button',
      tabIndex: 0,
      'aria-pressed': active,
      className: 'faust-finding' + (active ? ' is-active' : '') + (finding.status !== 'open' ? ' is-resolved' : ''),
      'data-severity': attr,
      // A press on the card jumps in the text; its own buttons take their presses themselves
      onMouseDown: (ev) => { if (!(ev.target.closest && ev.target.closest('button, a, summary'))) ev.preventDefault(); },
      onClick: select,
      onKeyDown: (ev) => {
        if (ev.target !== ev.currentTarget) return;
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          select();
        }
      }
    },
      e('span', { className: 'faust-finding__icon' }, icons[icon]({ size: 14 })),
      e('span', { className: 'faust-finding__kind' }, finding.checkLabel),
      finding.kind !== 'local' && finding.model ? e('span', { className: 'faust-finding__where' }, finding.model) : null,
      e('span', { className: 'faust-finding__quote' }, quote ? `”${quote}”` : TEXT.noQuote),
      (!finding.located || finding.approx || severity) && e('span', { className: 'faust-finding__badges' },
        !finding.located && e('span', { className: 'faust-chip faust-chip--plain', title: TEXT.unlocatedTitle }, TEXT.unlocated),
        finding.located && finding.approx && e('span', { className: 'faust-chip faust-chip--plain', title: TEXT.approxTitle }, TEXT.approx),
        severity && e('span', { className: `faust-chip faust-chip--dot faust-chip--${severity.role}` }, severity.word)),
      active && finding.note && e('span', { className: 'faust-finding__note' }, finding.note),
      active && finding.suggestion && !isFeedbackFinding(finding) && e('span', { className: 'faust-finding__note' }, `${TEXT.suggestion} ${finding.suggestion}`),
      active && ref && e('span', { className: 'faust-finding__note' }, `Vertaa: ${ref.label}`),
      active && ref && (ref.located
        ? e('span', { className: 'faust-finding__quote' }, `”${shownQuote(ref.quote) || ''}”`)
        : e('span', { className: 'faust-finding__badges' }, e('span', { className: 'faust-chip faust-chip--plain' }, TEXT.noCompare))),
      active && (canFix || openRef || url) && e('span', { className: 'faust-finding__actions', onClick: stop },
        canFix && e('button', {
          type: 'button',
          className: 'faust-btn faust-btn--sm',
          onMouseDown: keepEditor,
          onClick: () => controller.showFix(finding.id)
        }, TEXT.showFix),
        openRef && e('button', {
          type: 'button',
          className: 'faust-btn faust-btn--quiet faust-btn--sm',
          title: openRef.title,
          'aria-label': openRef.title,
          onClick: openRef.act
        }, TEXT.open),
        url && e('button', {
          type: 'button',
          className: 'faust-btn faust-btn--quiet faust-btn--sm',
          onClick: () => { if (window.electronAPI && window.electronAPI.openExternal) window.electronAPI.openExternal(url); }
        }, TEXT.guide)),
      active && e('div', { className: 'faust-check-group faust-finding__status', role: 'group', 'aria-label': 'Tila', onClick: stop },
        statusesFor(finding).map(status => e('button', {
          key: status,
          type: 'button',
          className: 'faust-chip faust-chip--plain',
          'aria-pressed': finding.status === status,
          title: STATUS_HINTS[status],
          onClick: () => controller.setStatus(finding.id, status)
        }, STATUS_LABELS[status])))
    );
  };

  // --- 8 The list, or why it is empty ---
  let list;
  if (view.findings.length === 0) {
    if (isLocal && counts.all === 0) list = e(EmptyState, { size: 'compact', title: TEXT.noHits });
    else if (counts.all > 0) list = e(EmptyState, { size: 'compact', title: TEXT.noneHere });
    else list = null;
  } else if (view.feedback) {
    const { works, concerns } = view.feedback;
    list = e(React.Fragment, null,
      works.length > 0 && e(Section, { title: TEXT.works }, e('div', { className: 'faust-findings' }, works.map(card))),
      concerns.length > 0 && e(Section, { title: TEXT.concerns }, e('div', { className: 'faust-findings' }, concerns.map(card))));
  } else {
    list = e('div', { className: 'faust-findings' }, view.findings.map(card));
  }

  // --- 9 Foot ---
  const misjudged = (view.modelStats || []).filter(row => row.invalid > 0);
  const stored = counts.done + counts.disagree + counts.invalid > 0 || (!isLocal && counts.all > 0)
    || !!(last && last.kind !== 'none');
  const foot = onOpenLanguageTool && e(Section, { title: TEXT.tools },
    e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
      e('button', { type: 'button', className: 'faust-btn faust-btn--block', onClick: () => onOpenLanguageTool('typography') }, TEXT.typography),
      !aiOff && withReason(view.blocked ? TEXT.proofreadBlocked : null, e('button', {
        type: 'button',
        className: 'faust-btn faust-btn--block',
        disabled: view.blocked,
        onClick: () => onOpenLanguageTool('proofread')
      }, TEXT.proofread)),
      e('div', { className: 'faust-field__hint' }, TEXT.toolsHint),
      misjudged.length > 0 && e('div', { className: 'faust-meta', title: TEXT.modelLineTitle },
        TEXT.modelLine + misjudged.map(row => `${row.model} ${formatCount(row.invalid)} / ${formatCount(row.total)}`).join(', ')),
      stored && e('div', null,
        e('button', { type: 'button', className: 'faust-btn faust-btn--quiet faust-btn--sm faust-btn--flush-start', onClick: () => controller.clearCheck() }, TEXT.clear))));

  return e('div', { ref: rootRef, className: 'faust-review' },
    e(Section, null,
      e('div', { className: 'faust-review__part' }, checkPart),
      e('div', { className: 'faust-review__part' }, scopePart),
      settings && e('div', { className: 'faust-review__part' }, settings),
      e('div', { className: 'faust-review__part' }, action),
      result.length > 0 && e('div', { className: 'faust-review__part' }, result)),
    e(Section, null,
      e('div', { className: 'faust-review__part' }, filterPart),
      list && e('div', { className: 'faust-review__part' }, list)),
    foot);
}
