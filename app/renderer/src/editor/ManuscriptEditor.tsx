import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Placeholder } from '@tiptap/extensions';
import { FinnishTypography } from './finnishTypography';
import { Spellcheck } from './spellcheck';
import { RewriteTarget } from './rewrite';
import { ProvenanceGuard, ProvenanceMark, applyProvenance, cleanMarkdown, extractProvenance } from './provenance';
import { setActiveEditor } from './activeEditor';
import { SpellMenu, type SpellMenuState } from './SpellMenu';
import { RewriteReview, type RewriteRequest } from './RewriteReview';
import { RewriteMenu } from './RewriteMenu';
import { useStore } from '../store';

interface Props {
  docId: string;
  body: string;
  language: string;
}

/** Character, place and thread names from the story bible, cached per bible version */
let namesCache: { bible: unknown; names: Set<string> } | null = null;
function bibleNames(): Set<string> {
  const bible = useStore.getState().project?.bible;
  if (namesCache && namesCache.bible === bible) return namesCache.names;
  const names = new Set<string>();
  for (const entry of Object.values(bible ?? {})) {
    for (const part of entry.name.split(/\s+/)) if (part) names.add(part.toLowerCase());
  }
  namesCache = { bible, names };
  return names;
}

export function ManuscriptEditor({ docId, body, language }: Props) {
  const lastEmitted = useRef(body);
  const [spellMenu, setSpellMenu] = useState<SpellMenuState | null>(null);
  const [rewrite, setRewrite] = useState<RewriteRequest | null>(null);

  const finnish = language === 'fi';

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          bulletList: false,
          orderedList: false,
          listItem: false,
          listKeymap: false,
          code: false,
          codeBlock: false,
          strike: false,
          underline: false,
          link: false
        }),
        Markdown,
        Placeholder.configure({ placeholder: 'Aloita kirjoittaminen…' }),
        FinnishTypography,
        Spellcheck.configure({ knownWords: bibleNames, enabled: () => finnish && useStore.getState().spellcheck }),
        RewriteTarget,
        ProvenanceMark,
        ProvenanceGuard
      ],
      content: body,
      contentType: 'markdown',
      editorProps: {
        attributes: {
          class: 'manuscript',
          lang: language,
          // Voikko handles Finnish; other languages fall back to the system checker
          spellcheck: finnish ? 'false' : 'true'
        },
        handleDOMEvents: {
          contextmenu: (view, event) => {
            const target = (event.target as HTMLElement).closest('.spell-error, .grammar-error') as HTMLElement | null;
            if (!target) return false;
            event.preventDefault();
            const pos = view.posAtDOM(target, 0);
            const text = target.textContent ?? '';
            const grammar = target.dataset.grammar ? JSON.parse(target.dataset.grammar) : null;
            setSpellMenu({ x: event.clientX, y: event.clientY, from: pos, to: pos + text.length, word: text, grammar });
            return true;
          }
        }
      },
      onCreate: ({ editor }) => {
        setActiveEditor(docId, editor);
        const lost = applyProvenance(editor, useStore.getState().provenance[docId]);
        if (lost > 0) useStore.getState().notify(`${lost} AI-merkintää ei voitu kohdistaa, koska tekstiä on muokattu muualla.`);
      },
      onDestroy: () => setActiveEditor(docId, null),
      onUpdate: ({ editor }) => {
        const markdown = cleanMarkdown(editor);
        const { updateBody, setProvenance } = useStore.getState();
        if (markdown !== lastEmitted.current) {
          lastEmitted.current = markdown;
          updateBody(docId, markdown);
        }
        setProvenance(docId, extractProvenance(editor.state.doc));
      }
    },
    [docId, language]
  );

  // Re-run checks when spellchecking is switched on or off
  const spellcheck = useStore(s => s.spellcheck);
  useEffect(() => {
    editor?.commands.recheckSpelling();
  }, [spellcheck, editor]);

  // Changes from outside the editor (AI panel insert, history restore)
  useEffect(() => {
    if (!editor || body === lastEmitted.current) return;
    lastEmitted.current = body;
    editor.commands.setContent(body, { contentType: 'markdown', emitUpdate: false });
    useStore.getState().setProvenance(docId, extractProvenance(editor.state.doc));
  }, [body, editor, docId]);

  if (!editor) return null;

  return (
    <>
      <FormatBubble editor={editor} onRewrite={setRewrite} busy={!!rewrite} />
      <EditorContent editor={editor} />
      {spellMenu && <SpellMenu editor={editor} state={spellMenu} onClose={() => setSpellMenu(null)} />}
      {rewrite && <RewriteReview editor={editor} request={rewrite} onClose={() => setRewrite(null)} />}
    </>
  );
}

function FormatBubble({ editor, onRewrite, busy }: { editor: Editor; onRewrite(r: RewriteRequest): void; busy: boolean }) {
  // NOX is for writing: AI suggestions stay hidden unless the writer enabled them
  const aiAllowed = useStore(s => s.theme === 'DEIS' || s.noxAssist);
  return (
    <BubbleMenu editor={editor} className="bubble" options={{ placement: 'top' }} shouldShow={({ state }) => !busy && !state.selection.empty}>
      <button className={editor.isActive('bold') ? 'on' : ''} onClick={() => editor.chain().focus().toggleBold().run()} title="Lihavointi (⌘B)">
        <b>L</b>
      </button>
      <button className={editor.isActive('italic') ? 'on' : ''} onClick={() => editor.chain().focus().toggleItalic().run()} title="Kursiivi (⌘I)">
        <i>K</i>
      </button>
      <button className={editor.isActive('blockquote') ? 'on' : ''} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Sitaatti">
        ❝
      </button>
      {aiAllowed && (
        <>
          <span className="sep" />
          <RewriteMenu editor={editor} onRewrite={onRewrite} />
        </>
      )}
    </BubbleMenu>
  );
}
