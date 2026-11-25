/**
 * src/components/SuggestionBar.js — Ehdotusten läpikäynti: the bar of the suggestion layer (stage I-03).
 *
 *   SuggestionBar({ info, controller, onOpenChapter, focusEditor, explain })
 *     info          BarInfo of the suggestion controller (contracts.md 1.1), or null
 *     controller    the suggestion controller (acceptCurrent, rejectCurrent, acceptAll, rejectAll,
 *                   restoreRejected, step, setView, dismissNotice, closeBar)
 *     onOpenChapter (chapterId) => void, for "Muissa luvuissa odottaa …"
 *     focusEditor   () => void: the bar's menu gives the focus back to the manuscript
 *     explain       (current) => Promise<{ ok, text } | { ok: false }>: "Miksi?" for a Kielenhuolto
 *                   suggestion (stage I-06). Passed only while AI is on and the chapter may be sent;
 *                   without it the bar has no Miksi? at all (contracts rule 12)
 *
 * It lives in the page's bottom dock (reconcile R-62), with the anatomy of visual foundations entry
 * VF-17 and the strings of the contract: the counter, step, Hylkää, Hyväksy, Hyväksy kaikki, and a
 * "more" menu for Hylkää kaikki, Palauta hylätyt, the three views and the other chapters. The keys
 * live in the editor (⌘↩, ⇧⌘⌫, ⌥⌘↓, ⌥⌘↑); the bar names them in its tooltips and handles no key
 * itself, Esc included. Every control keeps the focus in the manuscript (preventDefault on mousedown),
 * so the keys go on working after a click.
 *
 * Miksi? is the first item of the "more" menu for a Kielenhuolto suggestion (VF-19): the answer, one
 * sentence, stands in a popover under the "more" button while the same suggestion is current.
 *
 * Notices (a suggestion dropped by an edit, a restore that failed, a proposal skipped) are warning
 * notifications, never a row of the bar (VF-18). The sentence about dialogue suggestions that a bulk
 * accept leaves stands above the bar while any are pending.
 *
 * Bundled with app.js by webpack. Uses the global React like the rest of the app.
 */
import { icons } from './icons.js';
import { notify, Popover, usePopover, IconButton, Callout } from './ui.js';
import { shortcut, count } from './Dialogs.js';
import { formatCount } from '../services/format.fi.js';

const { createElement: e, useEffect, useRef, useState } = React;

// Every control: the press does not take the focus from the manuscript
const keep = (ev) => ev.preventDefault();

const NOTICE_MS = 8000;
// How long "Kaikki ehdotukset käsitelty." stays when nothing touches it
const DONE_MS = 8000;
const MODIFIER_KEYS = ['Shift', 'Meta', 'Control', 'Alt', 'CapsLock', 'Tab'];

// contracts.md / brief 6.2, "Notice" rows
const NOTICE_TEXT = {
  'dropped-edit': (n) => (n === 1
    ? 'Yksi ehdotus poistui, koska muokkasit sen kohtaa.'
    : `${formatCount(n)} ehdotusta poistui, koska muokkasit niiden kohtaa.`),
  'dropped-external': (n) => (n === 1
    ? 'Yksi ehdotus poistui, koska teksti sen kohdalla muuttui.'
    : `${formatCount(n)} ehdotusta poistui, koska teksti niiden kohdalla muuttui.`),
  // block: the rejected draft (Tekoälyn luonnos) is one of them and is named itself (final-pass review)
  'restore-failed': (n, block) => {
    const suggestions = block ? n - 1 : n;
    const named = suggestions === 1 ? 'Yhtä hylättyä ehdotusta' : `${formatCount(suggestions)} hylättyä ehdotusta`;
    const what = !block ? named : suggestions > 0 ? `${named} ja tekoälyn luonnosta` : 'Tekoälyn luonnosta';
    return `${what} ei voitu palauttaa, koska teksti on muuttunut.`;
  },
  skipped: (n) => (n === 1
    ? 'Yksi ehdotus jäi pois, koska samassa kohdassa on jo ehdotus.'
    : `${formatCount(n)} ehdotusta jäi pois, koska samassa kohdassa on jo ehdotus.`)
};

const noticeText = (notice) => {
  const text = notice && NOTICE_TEXT[notice.kind];
  return text ? text(Number(notice.count) || 1, notice.block === true) : null;
};

// The notice on screen. There is one bar in the app, and the dock may give its place to the voice bar
// for a moment: the notification and its timer live here, outside the component, so that they go on
// (and are not shown twice) when the bar comes back.
const shown = { kind: null, count: 0, block: false, handle: null, timer: 0, controller: null };

function closeShown() {
  clearTimeout(shown.timer);
  if (shown.handle) shown.handle.close();
  shown.kind = null;
  shown.count = 0;
  shown.block = false;
  shown.handle = null;
  shown.timer = 0;
  shown.controller = null;
}

// The notice goes 8 s after it appeared, or after its count last changed, and the controller forgets it
function startTimer() {
  clearTimeout(shown.timer);
  shown.timer = setTimeout(() => {
    const controller = shown.controller;
    closeShown();
    if (controller) controller.dismissNotice();
  }, NOTICE_MS);
}

function useNotice(notice, controller) {
  const kind = notice ? notice.kind : null;
  const amount = notice ? Number(notice.count) || 1 : 0;
  const block = !!(notice && notice.block === true);
  useEffect(() => {
    const text = noticeText(notice);
    if (!text) {
      // The controller cleared it (another chapter, a new project, a newer notice of the editor)
      if (shown.handle) closeShown();
      return;
    }
    if (shown.handle && shown.kind === kind) {
      if (shown.count !== amount || shown.block !== block) {
        shown.count = amount;
        shown.block = block;
        shown.handle.update({ text });
        startTimer();
      }
      shown.controller = controller;
      return;
    }
    if (shown.handle) closeShown();
    shown.kind = kind;
    shown.count = amount;
    shown.block = block;
    shown.controller = controller;
    shown.handle = notify('warning', text, { duration: 0 });
    startTimer();
  }, [kind, amount, block]);
}

const VIEWS = [
  { mode: 'changes', label: 'Muutokset', title: 'Näytä poistot ja lisäykset' },
  { mode: 'original', label: 'Alkuperäinen', title: 'Näytä teksti ilman ehdotuksia' },
  { mode: 'new', label: 'Uusi', title: 'Näytä teksti sellaisena kuin se olisi hyväksyttynä' }
];

// The other chapters' suggestions by their count and their drafts by the name of the draft's head, apart
// (contracts 8.1; lead decision "Counts" of the final pass): `Muissa luvuissa odottaa 9 ehdotusta ja tekoälyn luonnos`
const elsewhereSum = (info, key) => info.elsewhere.reduce((sum, entry) => sum + (Number(entry[key]) || 0), 0);
const draftWords = (n) => (n === 1 ? 'tekoälyn luonnos' : `${formatCount(n)} tekoälyn luonnosta`);
const elsewhereLabel = (info) => {
  const suggestions = elsewhereSum(info, 'count');
  const drafts = elsewhereSum(info, 'blocks');
  const parts = [];
  if (suggestions > 0 || drafts === 0) parts.push(count(suggestions, 'ehdotus'));
  if (drafts > 0) parts.push(draftWords(drafts));
  return 'Muissa luvuissa odottaa ' + parts.join(' ja ');
};
// What Palauta hylätyt brings back, by name: the rejected suggestions and, apart from their number, a
// rejected draft (it used to be one of the number: "Palauta hylätyt (4)" for three suggestions and an
// earlier draft, which then came back unnamed)
const restoreLabel = (info) => {
  const suggestions = Math.max(0, (Number(info.rejected) || 0) - (info.rejectedBlock ? 1 : 0));
  if (!info.rejectedBlock) return `Palauta hylätyt (${formatCount(suggestions)})`;
  return suggestions > 0 ? `Palauta hylätyt (${formatCount(suggestions)} ja luonnos)` : 'Palauta hylätty luonnos';
};
const RESTORE_TITLE = 'Palauta hylätyt ehdotukset, joiden alkuperäinen teksti on yhä paikallaan';
const restoreTitle = (info) => (info.rejectedBlock
  ? 'Palauta hylätyt ehdotukset ja hylätty tekoälyn luonnos, jos teksti niiden kohdalla on yhä ennallaan'
  : RESTORE_TITLE);

export function SuggestionBar({ info, controller, onOpenChapter, focusEditor, explain }) {
  const more = usePopover();
  useNotice(info ? info.notice : null, controller);

  // Miksi?: the answer for one suggestion; it goes when another suggestion becomes current
  const why = usePopover();
  const [answer, setAnswer] = useState(null);       // { id, status: 'waiting' | 'done' | 'failed', text }
  const askedRef = useRef(0);
  const currentId = info && info.current ? info.current.id : null;
  useEffect(() => {
    if (answer && answer.id !== currentId) {
      askedRef.current += 1;
      setAnswer(null);
      why.close();
    }
  }, [currentId]);
  useEffect(() => {
    if (!why.open && answer) { askedRef.current += 1; setAnswer(null); }
  }, [why.open]);
  // The prop goes (AI switched off, a protected chapter): so does an open answer
  useEffect(() => { if (!explain && why.open) why.close(); }, [explain]);

  // The menu closes when the bar has nothing pending any more
  const pending = info ? info.pending : 0;
  useEffect(() => {
    if (pending === 0 && more.open) more.close();
  }, [pending]);

  // The done state (nothing pending, the rejected ones restorable) is a passing word, not a fixture of
  // the dock (visual foundations 9.2 "last one handled: the bar leaves"; 6.5: nothing permanent floats
  // over the text). It goes after 8 s, at the next key and at a press in the manuscript or in the
  // Pikamuokkaus prompt; the pointer on the bar holds it. Palauta hylätyt stays in Muokkaa ▸ Ehdotukset.
  // A draft of this chapter that still waits (Tekoälyn luonnos) is an ehdotus too: no done sentence over it.
  const doneShown = !!info && !!controller && pending === 0 && info.rejected > 0 && !info.closed && !info.blockStatus;
  const doneRef = useRef(null);
  const holdRef = useRef({ start: () => {}, stop: () => {} });
  const doneKey = doneShown ? `${info.chapterId}:${info.rejected}` : '';
  useEffect(() => {
    if (!doneShown) return undefined;
    let timer = 0;
    const leave = () => controller.closeBar();
    const stop = () => clearTimeout(timer);
    const start = () => { stop(); timer = setTimeout(leave, DONE_MS); };
    const inBar = (target) => !!(doneRef.current && target instanceof Node && doneRef.current.contains(target));
    const onKey = (ev) => {
      if (ev.repeat || MODIFIER_KEYS.includes(ev.key) || inBar(ev.target)) return;
      leave();
    };
    const onPress = (ev) => {
      if (ev.target instanceof Element && ev.target.closest('.faust-editor-host, .cm-faust-prompt')) leave();
    };
    holdRef.current = { start, stop };
    start();
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onPress, true);
    return () => {
      stop();
      holdRef.current = { start: () => {}, stop: () => {} };
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onPress, true);
    };
  }, [doneKey]);

  if (!info || !controller) return null;

  const openElsewhere = () => {
    if (info.elsewhere.length && onOpenChapter) onOpenChapter(info.elsewhere[0].chapterId);
  };

  // Nothing pending in this chapter: all decided (rejected ones can come back; this form leaves by itself,
  // see doneShown), or other chapters wait.
  // A notice alone and a block alone show no bar: the notice is a notification, the block has its buttons.
  if (pending === 0) {
    const done = doneShown;
    const elsewhere = info.elsewhere.length > 0;
    if (!done && !elsewhere) return null;
    // The other chapters' line names a draft beside the suggestions: the long form, which needs a wider page before
    // the sentence Kaikki ehdotukset käsitelty. may stay (faust-components.css section 12)
    const long = elsewhere && elsewhereSum(info, 'blocks') > 0 && elsewhereSum(info, 'count') > 0;
    return e('div', {
      ref: doneRef,
      className: 'faust-suggestbar',
      role: 'toolbar',
      'aria-label': 'Ehdotusten läpikäynti',
      'data-elsewhere': long ? 'long' : undefined,
      onMouseEnter: () => holdRef.current.stop(),
      onMouseLeave: () => holdRef.current.start()
    },
      e('span', { className: 'faust-suggestbar__label' },
        icons.star8({ size: 14 }),
        done && e('span', { className: 'faust-suggestbar__name' }, 'Kaikki ehdotukset käsitelty.')
      ),
      done && e('button', {
        type: 'button',
        className: 'faust-btn faust-btn--quiet faust-btn--sm',
        title: restoreTitle(info),
        onMouseDown: keep,
        onClick: () => controller.restoreRejected()
      }, restoreLabel(info)),
      elsewhere && e('button', {
        type: 'button',
        className: 'faust-btn faust-btn--quiet faust-btn--sm',
        // The whole line, readable also when a narrow page cuts the label (T-057)
        title: elsewhereLabel(info),
        onMouseDown: keep,
        onClick: openElsewhere
      }, elsewhereLabel(info)),
      done && e(IconButton, {
        icon: 'close',
        size: 'sm',
        label: 'Sulje',
        onMouseDown: keep,
        onClick: () => controller.closeBar()
      })
    );
  }

  const hasCurrent = info.currentIndex >= 0;
  // The finished draft (Tekoälyn luonnos) is the current item of the review order: the bar's Hyväksy and
  // Hylkää act on it, so the bar names it; the count stays the suggestions' own (lead decision "Counts")
  const draftCurrent = !hasCurrent && info.blockCurrent === true;
  // Without a current suggestion the keys and these buttons first step to one (⌘↩ does the same)
  const accept = () => { if (!controller.acceptCurrent()) controller.step(1); };
  const reject = () => { if (!controller.rejectCurrent()) controller.step(1); };
  const dialogue = info.dialoguePending > 0;
  // Only dialogue suggestions left: a bulk accept would take none of them (M B.8: a reason, not a dead click)
  const onlyDialogue = dialogue && info.dialoguePending >= pending;
  const choose = (run) => () => { more.close(); run(); };

  const current = info.current;
  const canExplain = typeof explain === 'function' && !!current && !!current.meta && current.meta.action === 'proofread';
  const askWhy = () => {
    more.close();
    const asked = ++askedRef.current;
    const id = current.id;
    setAnswer({ id, status: 'waiting', text: '' });
    why.setOpen(true);
    Promise.resolve()
      .then(() => explain(current))
      .then((result) => {
        if (askedRef.current !== asked) return;
        setAnswer(result && result.ok ? { id, status: 'done', text: result.text } : { id, status: 'failed', text: '' });
      }, () => {
        if (askedRef.current === asked) setAnswer({ id, status: 'failed', text: '' });
      });
  };

  // Every item starts with the slot of the view items' check, so all labels share one left edge (V 4.9)
  const slot = () => e('span', { className: 'faust-menu__slot', 'aria-hidden': true });
  const menuItem = (label, title, onClick) => e('button', {
    type: 'button', className: 'faust-menu__item', role: 'menuitem', title, onMouseDown: keep, onClick
  }, slot(), label);

  const menu = more.open && e(Popover, {
    ...more.popoverProps,
    menu: true,
    label: 'Lisää toimintoja',
    restoreFocus: focusEditor
  },
    canExplain && menuItem('Miksi?', undefined, askWhy),
    canExplain && e('div', { className: 'faust-menu__sep', role: 'separator' }),
    menuItem('Hylkää kaikki', 'Hylkää kaikki tämän luvun ehdotukset. Palauta hylätyt tuo ne takaisin.',
      choose(() => controller.rejectAll())),
    info.rejected > 0 && menuItem(restoreLabel(info), restoreTitle(info), choose(() => controller.restoreRejected())),
    e('div', { className: 'faust-menu__sep', role: 'separator' }),
    e('div', { className: 'faust-menu__label' }, 'Näytä'),
    VIEWS.map(view => e('button', {
      key: view.mode,
      type: 'button',
      className: 'faust-menu__item',
      role: 'menuitemradio',
      'aria-checked': info.viewMode === view.mode,
      title: view.title,
      onMouseDown: keep,
      onClick: choose(() => controller.setView(view.mode))
    },
      info.viewMode === view.mode ? icons.check({ size: 14 }) : slot(),
      view.label
    )),
    info.elsewhere.length > 0 && e('div', { className: 'faust-menu__sep', role: 'separator' }),
    info.elsewhere.length > 0 && menuItem(elsewhereLabel(info), undefined, choose(openElsewhere))
  );

  return e(React.Fragment, null,
    // A bulk accept leaves the suggestions on dialogue lines (contracts.md 4.3)
    dialogue && e('div', { className: 'faust-suggestbar__note', role: 'status' },
      `Vuorosanojen ehdotuksia: ${formatCount(info.dialoguePending)}. Käy ne läpi yksitellen.`),
    e('div', { className: 'faust-suggestbar', role: 'toolbar', 'aria-label': 'Ehdotusten läpikäynti' },
      e('span', { className: 'faust-suggestbar__label' },
        icons.star8({ size: 14 }),
        hasCurrent && e('span', { className: 'faust-suggestbar__name' }, 'Ehdotus'),
        draftCurrent && e('span', { className: 'faust-suggestbar__name' }, 'Tekoälyn luonnos')
      ),
      // With the draft current: "Tekoälyn luonnos  ja 9 ehdotusta"; the compact form drops the name and its "ja"
      e('span', { className: 'faust-suggestbar__count' },
        hasCurrent
          ? `${formatCount(info.currentIndex + 1)} / ${formatCount(pending)}`
          : draftCurrent
            ? e(React.Fragment, null, e('span', { className: 'faust-suggestbar__name' }, 'ja '), count(pending, 'ehdotus'))
            : count(pending, 'ehdotus')),
      e(IconButton, {
        icon: 'chevronUp',
        size: 'sm',
        label: 'Edellinen ehdotus (' + shortcut('CmdOrCtrl+Alt+Up') + ')',
        onMouseDown: keep,
        onClick: () => controller.step(-1)
      }),
      e(IconButton, {
        icon: 'chevronDown',
        size: 'sm',
        label: 'Seuraava ehdotus (' + shortcut('CmdOrCtrl+Alt+Down') + ')',
        onMouseDown: keep,
        onClick: () => controller.step(1)
      }),
      e('span', { className: 'faust-suggestbar__sep faust-suggestbar__sep--lead' }),
      e('button', {
        type: 'button',
        className: 'faust-btn faust-btn--quiet faust-btn--sm faust-suggestbar__reject',
        'aria-label': 'Hylkää',
        title: (draftCurrent ? 'Hylkää tämä luonnos (' : 'Hylkää tämä ehdotus (') + shortcut('CmdOrCtrl+Shift+Backspace') + ')',
        onMouseDown: keep,
        onClick: reject
      },
        icons.close({ size: 14, className: 'faust-suggestbar__compact' }),
        e('span', { className: 'faust-btn__label' }, 'Hylkää')
      ),
      e('button', {
        type: 'button',
        className: 'faust-btn faust-btn--primary faust-btn--sm faust-suggestbar__accept',
        'aria-label': 'Hyväksy',
        title: (draftCurrent ? 'Hyväksy tämä luonnos (' : 'Hyväksy tämä ehdotus (') + shortcut('CmdOrCtrl+Enter') + ')',
        onMouseDown: keep,
        onClick: accept
      },
        icons.check({ size: 14, className: 'faust-suggestbar__compact' }),
        e('span', { className: 'faust-btn__label' }, 'Hyväksy')
      ),
      e('span', { className: 'faust-suggestbar__sep' }),
      e('button', {
        type: 'button',
        className: 'faust-btn faust-btn--quiet faust-btn--sm faust-suggestbar__all',
        'aria-label': 'Hyväksy kaikki',
        disabled: onlyDialogue,
        title: onlyDialogue
          ? 'Käy vuorosanojen ehdotukset läpi yksitellen.'
          : dialogue
            ? 'Hyväksy tämän luvun ehdotukset, paitsi vuorosanojen. Yksi kumoaminen palauttaa ne.'
            : 'Hyväksy kaikki tämän luvun ehdotukset. Yksi kumoaminen palauttaa ne.',
        onMouseDown: keep,
        onClick: () => controller.acceptAll()
      },
        icons.checkAll({ size: 14, className: 'faust-suggestbar__compact' }),
        e('span', { className: 'faust-btn__label' }, 'Hyväksy kaikki')
      ),
      e('button', {
        ...more.triggerProps,
        type: 'button',
        className: 'faust-btn faust-btn--icon faust-btn--sm' + (info.viewMode !== 'changes' ? ' is-selected' : ''),
        'aria-label': 'Lisää toimintoja',
        'aria-haspopup': 'menu',
        title: 'Lisää toimintoja',
        onMouseDown: keep
      }, icons.more({ size: 14 })),
      menu,
      // The answer of Miksi? under the "more" button (VF-19); Esc, a press outside and another current
      // suggestion close it, and the focus goes back to the manuscript
      why.open && answer && e(Popover, {
        anchorRef: more.anchorRef,
        onClose: why.close,
        width: 360,
        label: 'Miksi?',
        restoreFocus: focusEditor
      },
        answer.status === 'waiting'
          ? e('div', { className: 'faust-meta', role: 'status', style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' } },
              e('span', { className: 'faust-spinner faust-spinner--sm' }), 'Kysytään…')
          : answer.status === 'done'
            ? e('div', { className: 'faust-serif is-selectable' }, 'Perustelu: ' + answer.text)
            : e(Callout, { role: 'error' }, 'Perustelua ei saatu.'))
    )
  );
}
