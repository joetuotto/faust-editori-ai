/**
 * Finnish typographic conventions while typing:
 *  "  -> ”   (Finnish uses the same closing quote on both sides)
 *  '  -> ’
 *  -- -> –   (ajatusviiva)
 *  -  -> –   at the start of a paragraph (repliikkiviiva)
 *  ...-> …
 * Undo (Cmd+Z) right after a replacement restores the typed character.
 */
import { Extension, textInputRule } from '@tiptap/core';

export const FinnishTypography = Extension.create({
  name: 'finnishTypography',

  addInputRules() {
    return [
      textInputRule({ find: /"$/, replace: '”' }),
      textInputRule({ find: /'$/, replace: '’' }),
      textInputRule({ find: /--$/, replace: '–' }),
      textInputRule({ find: /\.\.\.$/, replace: '…' }),
      // Dialogue dash: "- " typed at the very start of a paragraph
      textInputRule({ find: /^- $/, replace: '– ' })
    ];
  }
});
