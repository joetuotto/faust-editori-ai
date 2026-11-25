/**
 * src/components/ContextRow.js - "Mitä malli näkee" (report 4.6, smallest version).
 *
 *   useContextPreview(args) → { built, rowProps, blocked }
 *       args: { task, project, chapterId, text, cursor, selection, role, answerTokens, disabled? }
 *       builds the request with the one assembler (getContextSession().build) whenever an input
 *       changes, and keeps the parts the author switched off
 *   ContextRow(props)            the one line under an action: what is sent and how big it is
 *   PromptDialog(props)          Näytä kehote: the system and user text exactly as they are sent
 *   manualChoicesFor(project, built, include)   the Tarinakansio entries "Lisää kohde…" offers
 *   mountContextRow(el, props)   the same row for a host that is not React; returns the unmount
 *
 * The row's numbers are characters; its total is an estimate in tokens against the room the model
 * has. A chapter marked "Ei tekoälylle", a text over the budget and a caller's notice each replace
 * the line. Composition of visual foundations entry VF-26 and VF-27: classes of
 * styles/faust-components.css, style objects for layout only.
 *
 * Bundled with app.js by webpack. Uses the global React and ReactDOM like the rest of the app.
 */
import { Dialog, Callout, Field } from './ui.js';
import { icons } from './icons.js';
import { count } from './Dialogs.js';
import { getContextSession } from '../services/ai/contextSession.js';
import { getAIClient } from '../services/ai/aiClient.js';
import { describeParts, MESSAGES, DROP_ORDER } from '../services/ai/contextBuilder.js';
import { folderName, STATE_LABELS, TYPE_LABELS } from '../services/story/codex.js';
import { formatCount } from '../services/format.fi.js';

const { createElement: e, useState, useMemo } = React;

const NUMBERS_TITLE = 'Rivin luvut ovat merkkejä. Alla on arvio kehotteen koosta ja mallille varattu tila tokeneina.';
// The line's numbers are characters and the total under it tokens: the unit is named once, in the
// row (the pure module's line, 'Lähetetään: valinta 38 · …', is the contract's and stays as it is)
const withUnit = (line) => String(line || '').replace(/^Lähetetään: /, 'Lähetetään (merkkiä): ');
// A part's name standing alone on its row (menu spec B.1): 'tehtävän säännöt' → 'Tehtävän säännöt'
const alone = (label) => { const text = String(label || ''); return text.charAt(0).toLocaleUpperCase('fi') + text.slice(1); };
const ORDER_NOTE = 'Jos tila loppuu, osat jätetään pois tässä järjestyksessä: aiempien lukujen tiivistelmät, teksti valinnan jälkeen, mainitut kohteet, teksti ennen valintaa, aina mukana olevat kohteet, käsin lisätyt kohteet, erisnimet, vältettävät sanat, käsikirjoituksen ydin, tyyliohje. Käsiteltävä teksti ja oma ohjeesi lähetetään aina.';

const STATE_TEXT = { dropped: 'ei mahtunut', cut: 'osa ei mahtunut', excluded: 'pois' };

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const taskIdOf = (task) => (typeof task === 'string' ? task : isRecord(task) && typeof task.id === 'string' ? task.id : '');

// The parts that can be switched off as a whole (the assembler's drop order); the rest is the
// working text, the rules and the author's own instruction, which are always sent
const isPartId = (id) => DROP_ORDER.includes(id);

// What the model reads: the system text and the turns (the copy of Näytä kehote and the size of
// its footer). `sent` is a request whose turns are not the build's own (Tarkenna sends the first
// request, the model's answer and the refinement).
function promptOf(built, promptText, systemAsUser, sent) {
  if (typeof promptText === 'string') return { system: '', turns: [{ role: 'user', content: promptText }] };
  const source = sent && Array.isArray(sent.messages) && sent.messages.length > 0 ? sent : built;
  const system = (source && source.system) || '';
  const turns = source && Array.isArray(source.messages) && source.messages.length > 0
    ? source.messages.map(turn => ({ role: turn.role === 'assistant' ? 'assistant' : 'user', content: String(turn.content || '') }))
    : [{ role: 'user', content: '' }];
  // A model set to take its instructions in the user message gets them at its start (utils/aiRequest.js buildParams)
  if (systemAsUser && system) {
    return { system: '', turns: [{ ...turns[0], content: system + '\n\n' + turns[0].content }, ...turns.slice(1)] };
  }
  return { system, turns };
}

const TURN_LABELS = { user: 'Käyttäjäviesti', assistant: 'Mallin vastaus' };

// The line's parts ("oma ohje 28") each wrap as one unit: the line breaks only between them, so a
// number never stands alone on the next line. The text is the same; only the wrapping is held.
const SEPARATOR = ' · ';
function lineParts(line) {
  const parts = String(line || '').split(SEPARATOR);
  const out = [];
  parts.forEach((part, index) => {
    if (index > 0) out.push(SEPARATOR);
    out.push(e('span', { key: index, style: { whiteSpace: 'nowrap' } }, part));
  });
  return out;
}

/** Kehote: what is sent, as it is sent. A view: a press on the scrim closes it. */
export function PromptDialog({ open, built, promptText, systemAsUser, sent, onClose }) {
  const [copied, setCopied] = useState(false);
  if (!open) return null;
  const many = !!(sent && Array.isArray(sent.messages) && sent.messages.length > 0);
  const { system, turns } = promptOf(built, promptText, systemAsUser, sent);
  // The size of what is shown, which is what is sent (a folded system text adds its blank line)
  const chars = system.length + turns.reduce((sum, turn) => sum + turn.content.length, 0);
  const tokens = built && typeof promptText !== 'string' && !many
    ? built.totalTokens
    : Math.ceil(chars / ((built && built.charsPerToken) || 2.7));
  const all = [system, ...turns.map(turn => turn.content)].filter(Boolean).join('\n\n');
  const close = () => { setCopied(false); if (onClose) onClose(); };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(all);
      setCopied(true);
    } catch (error) {
      setCopied(false);
    }
  };

  return e(Dialog, {
    title: 'Kehote',
    sub: 'Tämä teksti lähetetään mallille sellaisenaan.',
    size: 'lg',
    dismissOnScrim: true,
    onClose: close,
    footerStart: e('span', { className: 'faust-stat' }, `${count(chars, 'merkki')}, noin ${formatCount(tokens)} tokenia`),
    footer: [
      e('button', { key: 'copy', type: 'button', className: 'faust-btn faust-btn--lg', onClick: copy }, copied ? 'Kopioitu' : 'Kopioi kehote'),
      e('button', { key: 'close', type: 'button', className: 'faust-btn faust-btn--lg', title: 'Sulje (Esc)', onClick: close }, 'Sulje')
    ]
  },
    systemAsUser && typeof promptText !== 'string' && e('div', { style: { marginBottom: 'var(--sp-4)' } },
      e(Callout, { role: 'info' }, 'Tälle mallille järjestelmäviesti lähetetään käyttäjäviestin alussa.')),
    // Each text is as tall as its content: the dialog's body is the one scroller (4.8: no scroller
    // inside the body scroller), no resize grip, no half line at a field's lower edge
    system && e(Field, { label: 'Järjestelmäviesti' },
      e('textarea', { className: 'faust-textarea faust-textarea--fit', readOnly: true, rows: 2, value: system, spellCheck: false })),
    turns.map((turn, index) => e(Field, { key: index, label: TURN_LABELS[turn.role] },
      e('textarea', { className: 'faust-textarea faust-textarea--fit', readOnly: true, rows: 2, value: turn.content, spellCheck: false })))
  );
}

/**
 * The row. Full mode takes `built`; plain mode takes `parts` ([{ label, chars }]) and `note`.
 * exclude / include are the switched-off part ids and the entries added by hand. `sent`
 * ({ system, messages }) is what a request built from `built` actually sent, when its turns differ.
 */
export function ContextRow(props) {
  const {
    built, parts, note, folder = 'Tarinakansio', taskId,
    exclude = [], include = [], onExcludeChange, onIncludeChange,
    manualChoices = [], notice, promptText, systemAsUser, sent
  } = props;
  const [expanded, setExpanded] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  const setExclude = (ids) => {
    if (onExcludeChange) onExcludeChange(ids);
    if (taskId) getContextSession().setExclude(taskId, ids.filter(isPartId));
  };
  const toggle = (key, on) => {
    const next = on ? exclude.filter(id => id !== key) : Array.from(new Set([...exclude, key]));
    setExclude(next);
  };

  // flush-end: the last action's text ends on the column's edge, where the fields end
  const promptButton = (built || typeof promptText === 'string') && e('button', {
    type: 'button',
    className: 'faust-btn faust-btn--quiet faust-btn--sm faust-btn--flush-end',
    onClick: () => setShowPrompt(true)
  }, 'Näytä kehote');
  const dialog = e(PromptDialog, { open: showPrompt, built, promptText, systemAsUser, sent, onClose: () => setShowPrompt(false) });

  // Plain mode: a description given by the caller (a batch of several requests)
  if (!built) {
    const list = Array.isArray(parts) ? parts : [];
    const line = withUnit('Lähetetään: ' + list.filter(p => p && p.chars > 0).map(p => `${p.label} ${formatCount(p.chars)}`).join(' · '));
    return e('div', { className: 'faust-context-row' },
      notice
        ? e(Callout, { role: 'warning' }, notice)
        : e(React.Fragment, null,
            e('div', { className: 'faust-meta', title: NUMBERS_TITLE }, ...lineParts(line), note ? ' ' + note : null),
            promptButton && e('div', { className: 'faust-context-row__foot' }, e('span', null), promptButton)),
      dialog
    );
  }

  // What replaces the line
  if (built.blocked === 'noAI') return e(Callout, { role: 'hint' }, MESSAGES.noAI);
  const replaced = notice
    ? e(Callout, { role: 'warning' }, notice)
    : built.overBudget
      ? e(Callout, { role: 'warning' },
          `Teksti on liian pitkä tälle mallille: noin ${formatCount(built.totalTokens)} tokenia, tilaa ${formatCount(built.budgetTokens)}. Lyhennä valintaa tai vaihda mallia.`)
      : built.blocked
        ? e('div', { className: 'faust-meta' }, 'Ei lähetettävää.')
        : null;

  const described = describeParts(built, folder);
  const summaries = (built.parts || []).find(part => part.id === 'summaries');
  const skipped = summaries && Array.isArray(summaries.skippedNoAI) ? summaries.skippedNoAI : [];
  const manualOffered = manualChoices.filter(choice => !include.includes(`codex:${choice.id}`));

  const partRow = (part) => {
    const locked = part.locked === true;
    const off = part.state === 'excluded';
    const stateText = locked ? 'aina mukana' : STATE_TEXT[part.state] || '';
    const size = count(part.state === 'excluded' ? part.fullChars : part.chars, 'merkki');
    // The size and state on their own line under the label, so a label that wraps in the
    // 288px column keeps its hint under it instead of in a column of its own
    const words = e('span', { style: { display: 'flex', flexDirection: 'column' } },
      alone(part.label),
      e('span', { className: 'faust-check__hint', style: { marginLeft: 0 } }, stateText ? `${size} · ${stateText}` : size));
    return e('div', { key: part.id, style: { display: 'flex', flexDirection: 'column' } },
      // A part that is always sent is information to read, not a control that is switched off: a plain
      // row with a check mark, its name in the reading colour (a disabled box made the name dimmer
      // than its own hint)
      locked
        ? e('div', { className: 'faust-check faust-check--fixed' }, icons.check({ size: 14 }), words)
        : e('label', { className: 'faust-check' },
            e('input', {
              type: 'checkbox',
              checked: !off,
              onChange: (ev) => toggle(part.id, ev.target.checked)
            }),
            words),
      // The entries of a Tarinakansio part, one by one
      Array.isArray(part.items) && /^codex/.test(part.id) && part.items.map(item => e('label', {
        key: item.key,
        className: 'faust-check',
        style: { marginLeft: 'var(--sp-5)' }
      },
        e('input', {
          type: 'checkbox',
          checked: !exclude.includes(item.key),
          disabled: off,
          onChange: (ev) => toggle(item.key, ev.target.checked)
        }),
        item.label,
        e('span', { className: 'faust-check__hint' }, count(item.chars, 'merkki')))),
      part.id === 'summaries' && skipped.length > 0 && e('div', { className: 'faust-field__hint' },
        `Ei tekoälylle merkityt luvut jätettiin pois: ${skipped.join(', ')}.`)
    );
  };

  return e('div', { className: 'faust-context-row' },
    // Two fixed lines: what is sent; under it the total at the left edge and the two actions at the
    // right one. (One wrapping row with two auto margins left the total afloat in the middle of its
    // line, or run into the summary: final polish round 1.)
    replaced || e(React.Fragment, null,
      e('div', { className: 'faust-meta', title: NUMBERS_TITLE }, ...lineParts(withUnit(described.line))),
      e('div', { className: 'faust-context-row__foot' },
        e('span', { className: 'faust-stat', title: NUMBERS_TITLE }, described.total),
        e('span', { className: 'faust-context-row__actions' },
          e('button', {
            type: 'button',
            className: 'faust-btn faust-btn--quiet faust-btn--sm',
            title: expanded ? undefined : 'Muuta, mitä pyynnön mukana lähetetään',
            'aria-expanded': expanded,
            onClick: () => setExpanded(open => !open)
          }, expanded ? 'Valmis' : 'Muuta'),
          promptButton))),
    !replaced && described.dropped && e('div', { className: 'faust-meta' }, described.dropped),
    expanded && !replaced && e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)', marginTop: 'var(--sp-1)' } },
      e('div', { className: 'faust-label' }, 'Mukana tässä pyynnössä'),
      (built.parts || []).filter(part => part.state !== 'empty').map(partRow),
      manualOffered.length > 0 && e('select', {
        className: 'faust-select faust-select--sm',
        value: '',
        'aria-label': 'Lisää kohde',
        onChange: (ev) => {
          const key = ev.target.value;
          if (key && onIncludeChange) onIncludeChange(Array.from(new Set([...include, key])));
        }
      },
        e('option', { value: '' }, 'Lisää kohde…'),
        manualOffered.map(choice => e('option', { key: choice.id, value: `codex:${choice.id}` },
          `${choice.name} · ${choice.typeLabel} · ${choice.stateLabel}`))),
      e('div', { className: 'faust-field__hint' }, ORDER_NOTE)
    ),
    dialog
  );
}

// Entries that can be added by hand: "Vain käsin", and "Kun mainitaan" when not mentioned now
export function manualChoicesFor(project, built, include) {
  const entries = project && Array.isArray(project.codex) ? project.codex : [];
  const inBuilt = new Set();
  for (const part of (built && built.parts) || []) {
    for (const item of part.items || []) inBuilt.add(item.key);
  }
  return entries
    .filter(entry => isRecord(entry) && typeof entry.id === 'string' && String(entry.name || '').trim() !== '')
    .filter(entry => (entry.state === 'manual' || entry.state === 'mentioned') && !inBuilt.has(`codex:${entry.id}`))
    .filter(entry => !include.includes(`codex:${entry.id}`))
    .map(entry => ({
      id: entry.id,
      name: String(entry.name).trim(),
      typeLabel: (TYPE_LABELS[entry.type] || '').toLowerCase(),
      stateLabel: STATE_LABELS[entry.state] || ''
    }));
}

/**
 * The built request of a task and the props of its row. Building is synchronous and cheap, so it
 * runs again whenever an input changes. disabled (or no project) builds nothing.
 */
export function useContextPreview(args = {}) {
  const { task, project, chapterId, text, cursor, selection, role, answerTokens, disabled } = args;
  const taskId = taskIdOf(task);
  const [exclude, setExclude] = useState(() => (taskId ? getContextSession().getExclude(taskId) : []));
  const [include, setInclude] = useState([]);
  // The parts the author switched off are remembered per task (contracts 6, context.exclude). A host
  // that is mounted before it has a task (Kielen työkalut stays mounted while closed, from before the
  // settings are loaded) reads them when the task's id appears, and again for another task; the same
  // id coming back keeps what was chosen meanwhile
  const [readFor, setReadFor] = useState(taskId);
  if (taskId && taskId !== readFor) {
    setReadFor(taskId);
    setExclude(getContextSession().getExclude(taskId));
    setInclude([]);
  }
  const spec = isRecord(task) ? task : null;
  const from = selection ? (selection.from ?? selection.start) : null;
  const to = selection ? (selection.to ?? selection.end) : null;

  const built = useMemo(() => {
    if (disabled || !project || !task) return null;
    return getContextSession().build({
      task, project, chapterId, text, cursor,
      selection: selection ? { from, to } : null,
      exclude, include, role, answerTokens
    });
  }, [disabled, taskId, spec && spec.role, spec && spec.instruction, spec && spec.payload, spec && spec.rules && spec.rules.join('\n'),
    project, chapterId, text, cursor, from, to, exclude, include, role, answerTokens]);

  const systemAsUser = built && built.model ? getAIClient().modelSettings(built.model).systemAsUser === true : false;
  const rowProps = built ? {
    built,
    folder: folderName(project),
    taskId,
    exclude,
    include,
    onExcludeChange: setExclude,
    onIncludeChange: setInclude,
    manualChoices: manualChoicesFor(project, built, include),
    systemAsUser
  } : null;

  return { built, rowProps, blocked: built ? built.blocked : null };
}

// One React root per host element; mounting again on the same element renders it anew
const roots = new WeakMap();

/** The row inside a host that is not React (the inline prompt's widget). Returns the unmount. */
export function mountContextRow(container, props) {
  let root = roots.get(container);
  if (!root) {
    root = ReactDOM.createRoot(container);
    roots.set(container, root);
  }
  root.render(e(ContextRow, props));
  return () => {
    const current = roots.get(container);
    if (!current) return;
    roots.delete(container);
    current.unmount();
  };
}
