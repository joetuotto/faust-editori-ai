/**
 * src/components/SuggestionBar.js — Ehdotusten läpikäynti: the bar of the suggestion layer (stage I-03).
 *
 *   SuggestionBar({ info, controller, onOpenChapter, focusEditor })
 *     info          BarInfo of the suggestion controller (contracts.md 1.1), or null
 *     controller    the suggestion controller (acceptCurrent, rejectCurrent, acceptAll, rejectAll,
 *                   restoreRejected, step, setView, dismissNotice, closeBar)
 *     onOpenChapter (chapterId) => void, for "Muissa luvuissa odottaa …"
 *     focusEditor   () => void: the bar's menu gives the focus back to the manuscript
 *
 * It lives in the page's bottom dock (reconcile R-62), with the anatomy of visual foundations entry
 * VF-17 and the strings of the contract: the counter, step, Hylkää, Hyväksy, Hyväksy kaikki, and a
 * "more" menu for Hylkää kaikki, Palauta hylätyt, the three views and the other chapters. The keys
 * live in the editor (⌘↩, ⇧⌘⌫, ⌥⌘↓, ⌥⌘↑); the bar names them in its tooltips and handles no key
 * itself, Esc included. Every control keeps the focus in the manuscript (preventDefault on mousedown),
 * so the keys go on working after a click.
 *
 * Notices (a suggestion dropped by an edit, a restore that failed, a proposal skipped) are warning
 * notifications, never a row of the bar (VF-18). The sentence about dialogue suggestions that a bulk
 * accept leaves stands above the bar while any are pending.
 *
 * Bundled with app.js by webpack. Uses the global React like the rest of the app.
 */
import { icons } from './icons.js';
import { notify, Popover, usePopover, IconButton } from './ui.js';
import { shortcut, count } from './Dialogs.js';
import { formatCount } from '../services/format.fi.js';

const { createElement: e, useEffect } = React;

// Every control: the press does not take the focus from the manuscript
const keep = (ev) => ev.preventDefault();

const NOTICE_MS = 8000;

// contracts.md / brief 6.2, "Notice" rows
const NOTICE_TEXT = {
  'dropped-edit': (n) => (n === 1
    ? 'Yksi ehdotus poistui, koska muokkasit sen kohtaa.'
    : `${formatCount(n)} ehdotusta poistui, koska muokkasit niiden kohtaa.`),
  'dropped-external': (n) => (n === 1
    ? 'Yksi ehdotus poistui, koska teksti sen kohdalla muuttui.'
    : `${formatCount(n)} ehdotusta poistui, koska teksti niiden kohdalla muuttui.`),
  'restore-failed': (n) => (n === 1
    ? 'Yhtä hylättyä ehdotusta ei voitu palauttaa, koska teksti on muuttunut.'
    : `${formatCount(n)} hylättyä ehdotusta ei voitu palauttaa, koska teksti on muuttunut.`),
  skipped: (n) => (n === 1
    ? 'Yksi ehdotus jäi pois, koska samassa kohdassa on jo ehdotus.'
    : `${formatCount(n)} ehdotusta jäi pois, koska samassa kohdassa on jo ehdotus.`)
};

const noticeText = (notice) => {
  const text = notice && NOTICE_TEXT[notice.kind];
  return text ? text(Number(notice.count) || 1) : null;
};

// The notice on screen. There is one bar in the app, and the dock may give its place to the voice bar
// for a moment: the notification and its timer live here, outside the component, so that they go on
// (and are not shown twice) when the bar comes back.
const shown = { kind: null, count: 0, handle: null, timer: 0, controller: null };

function closeShown() {
  clearTimeout(shown.timer);
  if (shown.handle) shown.handle.close();
  shown.kind = null;
  shown.count = 0;
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
  useEffect(() => {
    const text = noticeText(notice);
    if (!text) {
      // The controller cleared it (another chapter, a new project, a newer notice of the editor)
      if (shown.handle) closeShown();
      return;
    }
    if (shown.handle && shown.kind === kind) {
      if (shown.count !== amount) {
        shown.count = amount;
        shown.handle.update({ text });
        startTimer();
      }
      shown.controller = controller;
      return;
    }
    if (shown.handle) closeShown();
    shown.kind = kind;
    shown.count = amount;
    shown.controller = controller;
    shown.handle = notify('warning', text, { duration: 0 });
    startTimer();
  }, [kind, amount]);
}

const VIEWS = [
  { mode: 'changes', label: 'Muutokset', title: 'Näytä poistot ja lisäykset' },
  { mode: 'original', label: 'Alkuperäinen', title: 'Näytä teksti ilman ehdotuksia' },
  { mode: 'new', label: 'Uusi', title: 'Näytä teksti sellaisena kuin se olisi hyväksyttynä' }
];

const elsewhereCount = (info) => info.elsewhere.reduce((sum, entry) => sum + (Number(entry.count) || 0), 0);
const elsewhereLabel = (info) => 'Muissa luvuissa odottaa ' + count(elsewhereCount(info), 'ehdotus');
const restoreLabel = (info) => `Palauta hylätyt (${formatCount(info.rejected)})`;
const RESTORE_TITLE = 'Palauta hylätyt ehdotukset, joiden alkuperäinen teksti on yhä paikallaan';

export function SuggestionBar({ info, controller, onOpenChapter, focusEditor }) {
  const more = usePopover();
  useNotice(info ? info.notice : null, controller);

  // The menu closes when the bar has nothing pending any more
  const pending = info ? info.pending : 0;
  useEffect(() => {
    if (pending === 0 && more.open) more.close();
  }, [pending]);

  if (!info || !controller) return null;

  const openElsewhere = () => {
    if (info.elsewhere.length && onOpenChapter) onOpenChapter(info.elsewhere[0].chapterId);
  };

  // Nothing pending in this chapter: all decided (rejected ones can come back), or other chapters wait.
  // A notice alone and a block alone show no bar: the notice is a notification, the block has its buttons.
  if (pending === 0) {
    const done = info.rejected > 0 && !info.closed;
    const elsewhere = info.elsewhere.length > 0;
    if (!done && !elsewhere) return null;
    return e('div', { className: 'faust-suggestbar', role: 'toolbar', 'aria-label': 'Ehdotusten läpikäynti' },
      e('span', { className: 'faust-suggestbar__label' },
        icons.star8({ size: 14 }),
        done && e('span', { className: 'faust-suggestbar__name' }, 'Kaikki ehdotukset käsitelty.')
      ),
      done && e('button', {
        type: 'button',
        className: 'faust-btn faust-btn--quiet faust-btn--sm',
        title: RESTORE_TITLE,
        onMouseDown: keep,
        onClick: () => controller.restoreRejected()
      }, restoreLabel(info)),
      elsewhere && e('button', {
        type: 'button',
        className: 'faust-btn faust-btn--quiet faust-btn--sm',
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

  const current = info.currentIndex >= 0;
  // Without a current suggestion the keys and these buttons first step to one (⌘↩ does the same)
  const accept = () => { if (!controller.acceptCurrent()) controller.step(1); };
  const reject = () => { if (!controller.rejectCurrent()) controller.step(1); };
  const dialogue = info.dialoguePending > 0;
  const choose = (run) => () => { more.close(); run(); };

  const menuItem = (label, title, onClick) => e('button', {
    type: 'button', className: 'faust-menu__item', role: 'menuitem', title, onMouseDown: keep, onClick
  }, label);

  const menu = more.open && e(Popover, {
    ...more.popoverProps,
    menu: true,
    label: 'Lisää toimintoja',
    restoreFocus: focusEditor
  },
    menuItem('Hylkää kaikki', 'Hylkää kaikki tämän luvun ehdotukset. Palauta hylätyt tuo ne takaisin.',
      choose(() => controller.rejectAll())),
    info.rejected > 0 && menuItem(restoreLabel(info), RESTORE_TITLE, choose(() => controller.restoreRejected())),
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
      info.viewMode === view.mode ? icons.check({ size: 14 }) : e('span', { className: 'faust-menu__slot', 'aria-hidden': true }),
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
        current && e('span', { className: 'faust-suggestbar__name' }, 'Ehdotus')
      ),
      e('span', { className: 'faust-suggestbar__count' },
        current ? `${formatCount(info.currentIndex + 1)} / ${formatCount(pending)}` : count(pending, 'ehdotus')),
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
        title: 'Hylkää tämä ehdotus (' + shortcut('CmdOrCtrl+Shift+Backspace') + ')',
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
        title: 'Hyväksy tämä ehdotus (' + shortcut('CmdOrCtrl+Enter') + ')',
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
        title: dialogue
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
      menu
    )
  );
}
