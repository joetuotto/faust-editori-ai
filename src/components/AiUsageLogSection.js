/**
 * src/components/AiUsageLogSection.js — Tekoälyn käyttö in Projektin asetukset (report 4.12, stage I-03).
 *
 *   AiUsageLogSection({ log, projectTitle, chapters })
 *     log           project.aiLog (src/services/ai/usageLog.js; an old file may have none)
 *     projectTitle  the project's name, for the export's head and its file name
 *     chapters      [{ id, title }]: the export names each chapter by its title now
 *
 * The start date, the three counts, the coverage note and Vie tekstinä…. The export goes through
 * the main process's save dialog; its outcome is a notification (reconcile R-72), never a line here.
 * Composition of visual foundations entry VF-31: Section, .faust-kv rows, .faust-field__hint.
 *
 * Bundled with app.js by webpack. Uses the global React like the rest of the app.
 */
import { Section, notify } from './ui.js';
import { normalizeLog, summarize, exportText } from '../services/ai/usageLog.js';
import { fiDate, formatCount } from '../services/format.fi.js';

const { createElement: e } = React;

// The reason inside 'Vienti epäonnistui: <syy>.' carries no full stop of its own (rule B.12)
const reasonOf = (error) => String(error || 'tuntematon virhe').trim().replace(/\.+$/, '');

export function AiUsageLogSection({ log, projectTitle, chapters }) {
  const data = normalizeLog(log);
  const summary = summarize(data);
  const empty = data.rows.length === 0 && !data.archived;
  const title = String(projectTitle || '').trim() || 'Nimetön projekti';

  const exportLog = async () => {
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!api || typeof api.saveTextFile !== 'function') return;
    const now = new Date();
    const chapterTitles = {};
    for (const chapter of Array.isArray(chapters) ? chapters : []) {
      if (chapter && chapter.id != null) chapterTitles[chapter.id] = chapter.title || '';
    }
    const text = exportText(normalizeLog(log, now.toISOString()), { projectTitle: title, now, chapterTitles });
    try {
      const result = await api.saveTextFile({ title: 'Vie tekoälyn käyttöloki', defaultName: title + ' – tekoälyn käyttöloki', text });
      if (result && result.success) notify('success', 'Viety: ' + result.path);
      else if (result && !result.canceled) notify('error', 'Vienti epäonnistui: ' + reasonOf(result.error) + '.');
    } catch (error) {
      notify('error', 'Vienti epäonnistui: ' + reasonOf(error && error.message) + '.');
    }
  };

  const row = (label, value) => e('div', { className: 'faust-kv' }, e('span', null, label), e('span', null, formatCount(value)));

  return e(Section, { title: 'Tekoälyn käyttö' },
    e('div', { className: 'faust-meta', style: { marginBottom: 'var(--sp-2)' } }, `Loki on ollut käytössä ${fiDate(data.startedAt)} alkaen.`),
    empty
      ? e('div', { className: 'faust-meta' }, 'Ei vielä tapahtumia')
      : e('div', null,
        // Each row names what it counts. Ehdotukset come from requests and from Liitä muokkauksina (a text
        // edited elsewhere), so decisions can stand beside zero requests: the hint says so
        row('Tekoälypyyntöjä', summary.requests),
        row('Hyväksyttyjä ehdotuksia', summary.accepted.count),
        row('Hylättyjä ehdotuksia', summary.rejected.count)
      ),
    // "-toiminnon" keeps its hyphen (a line never ends in it), and the old functions are named with the
    // menu's own verbs (menu spec B.18: no "generointi" in a string that reaches the screen)
    e('div', { className: 'faust-field__hint' },
      'Loki kattaa uudet tekoälytoiminnot ja Liitä muokkauksina ',
      e('span', { style: { whiteSpace: 'nowrap' } }, '-toiminnon'),
      ' ehdotukset. Vanhat kirjoitus- ja analyysitoiminnot eivät kirjaudu lokiin.'),
    e('div', { className: 'faust-field__row' },
      e('button', { type: 'button', className: 'faust-btn faust-btn--sm', onClick: exportLog }, 'Vie tekstinä…')
    )
  );
}
