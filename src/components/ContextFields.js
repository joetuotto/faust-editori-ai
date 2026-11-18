/**
 * src/components/ContextFields.js - the author's standing instructions and the per-chapter
 * exclusion (report 4.6, 4.7 smallest version).
 *
 *   BookBriefFields({ project, activeChapter, onChange, showAvoidWords = true })
 *       Ohjeet tekoälylle in Projektin asetukset: Käsikirjoituksen ydin, Tyyliohje and (from stage
 *       I-07 on) Vältettävät sanat. onChange(patch) merges into the project.
 *   ChapterNoAIField({ chapter, onChange })     Ei tekoälylle on the Luku tab; onChange(boolean)
 *   useNoAIGuard(project, projectKey)            keeps the main process's wire guard current
 *
 * Composition of visual foundations entry VF-30: Section, Field, the textarea and check classes.
 * Bundled with app.js by webpack. Uses the global React like the rest of the app.
 */
import { Section, Field } from './ui.js';
import { count } from './Dialogs.js';
import { parseTermList, formatTermList, countTerms } from '../editor/termMatch.js';
import { protectedChapters } from '../../utils/noAIGuard.js';

const { createElement: e, useState, useEffect, useMemo, useRef } = React;

const sameList = (a, b) => a.length === b.length && a.every((item, index) => item === b[index]);
const NO_WORDS = [];

/** Ohjeet tekoälylle: the texts that go with every writing and editing task. */
export function BookBriefFields({ project, activeChapter, onChange, showAvoidWords = true }) {
  const brief = typeof project.brief === 'string' ? project.brief : '';
  const style = typeof project.style === 'string' ? project.style : '';
  const avoid = Array.isArray(project.avoidWords) ? project.avoidWords : NO_WORDS;

  // The list keeps its own draft: a typed comma or line break must not vanish before the next
  // item is written. The draft follows the project only when the two lists really differ.
  const [draft, setDraft] = useState(() => formatTermList(avoid));
  useEffect(() => {
    if (!sameList(parseTermList(draft), avoid)) setDraft(formatTermList(avoid));
  }, [avoid]);
  // The hits of the whole list in the open chapter (countTerms gives one row per word; notes are skipped)
  const hits = useMemo(
    () => (showAvoidWords && activeChapter
      ? countTerms(activeChapter.content || '', avoid).reduce((sum, row) => sum + row.count, 0)
      : 0),
    [showAvoidWords, activeChapter && activeChapter.content, avoid]
  );

  return e(Section, { title: 'Ohjeet tekoälylle' },
    e('div', { className: 'faust-serif', style: { marginBottom: 'var(--sp-3)' } },
      'Nämä tekstit lähetetään jokaiseen kirjoitus- ja muokkaustehtävään. Näet ne Mitä malli näkee -riviltä.'),
    e(Field, { label: 'Käsikirjoituksen ydin', hint: count(brief.length, 'merkki') },
      e('textarea', {
        className: 'faust-textarea faust-textarea--author',
        rows: 4,
        value: brief,
        placeholder: 'Premissi tai tietokirjan aihe ja väite, aikamuoto ja näkökulma.',
        onChange: (ev) => onChange({ brief: ev.target.value })
      })),
    e(Field, { label: 'Tyyliohje', hint: count(style.length, 'merkki') },
      e('textarea', {
        className: 'faust-textarea faust-textarea--author',
        rows: 6,
        value: style,
        placeholder: 'Omat sääntösi, asiat joita ei koskaan tehdä ja yksi tai kaksi näytettä omasta proosastasi.',
        onChange: (ev) => onChange({ style: ev.target.value })
      })),
    showAvoidWords && e(Field, {
      label: 'Vältettävät sanat',
      hint: e('span', null,
        `${count(avoid.length, 'sana')} · tässä luvussa ${count(hits, 'osuma')}`,
        e('br'),
        'Osuma lasketaan sanan alusta: hehku löytää myös muodot hehkui ja hehkuva. Kirjoita sana lainausmerkkeihin, jos haluat vain täsmälleen sen: ”vain”.',
        e('br'),
        'Korostuksen saa pois valikosta Näytä → Korosta vältettävät sanat.')
    },
      e('textarea', {
        className: 'faust-textarea',
        rows: 4,
        value: draft,
        placeholder: 'Yksi sana tai ilmaus rivilleen',
        onChange: (ev) => {
          setDraft(ev.target.value);
          onChange({ avoidWords: parseTermList(ev.target.value) });
        }
      }))
  );
}

/** Ei tekoälylle: the chapter's text and summary go to no model. Shown also with "Tekoäly pois". */
export function ChapterNoAIField({ chapter, onChange }) {
  if (!chapter) return null;
  return e('div', { className: 'faust-field' },
    e('label', { className: 'faust-check' },
      e('input', {
        type: 'checkbox',
        checked: chapter.noAI === true,
        onChange: (ev) => onChange(ev.target.checked)
      }),
      'Ei tekoälylle'),
    e('div', { className: 'faust-field__hint' },
      'Tämän luvun tekstiä ja tiivistelmää ei lähetetä millekään mallille, eivätkä tekoälytoiminnot käynnisty tässä luvussa.')
  );
}

// The ids of the chapters marked "Ei tekoälylle", children walked
function protectedIds(project) {
  const ids = [];
  const walk = (items) => {
    for (const item of Array.isArray(items) ? items : []) {
      if (!item || typeof item !== 'object') continue;
      if (item.noAI === true) ids.push(String(item.id));
      walk(item.children);
    }
  };
  walk(project && project.structure);
  return ids.join('\n');
}

/**
 * Sends the text and summaries of the protected chapters to the main process, whose wire guard
 * refuses any request that carries them. At once when the set of protected chapters changes (a
 * box ticked or unticked) or another project is opened, 400 ms after their text or summary changed.
 * projectKey names the open project (its file path): projects reuse chapter ids such as
 * 'chapter-1', so the ids alone cannot tell that the protected text belongs to another project.
 * With no protected chapter it sends [] once.
 */
export function useNoAIGuard(project, projectKey) {
  const ids = protectedIds(project);
  const key = String(projectKey == null ? '' : projectKey) + '\u0002' + String((project && project.created) || '') + '\u0002' + ids;
  const chapters = useMemo(() => protectedChapters(project), [project && project.structure]);
  const textKey = useMemo(() => chapters.map(chapter => chapter.title + '\u0000' + chapter.text).join('\u0001'), [chapters]);
  const sentKeyRef = useRef(null);

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!api || typeof api.setProtectedText !== 'function') return undefined;
    const send = () => api.setProtectedText(chapters);
    if (sentKeyRef.current !== key) {
      sentKeyRef.current = key;
      send();
      return undefined;
    }
    const timer = setTimeout(send, 400);
    return () => clearTimeout(timer);
  }, [key, textKey]);
}
