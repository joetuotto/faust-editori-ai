/**
 * @jest-environment node
 */
const { sanitizeContext, takeContext, buildAiSubmenu } = require('../../utils/aiContextMenu');

const actions = [
  { id: 'proofread', label: 'Kielenhuolto – vain virheet' },
  { id: 'tighten', label: 'Tiivistä' },
  { id: 'user-abc', label: 'Säilytä ”sitaatit”' }
];
const stored = (extra = {}) => ({ x: 400, y: 300, hasSelection: true, actions, at: 10000, ...extra });
const params = (extra = {}) => ({ x: 400, y: 300, isEditable: true, selectionText: 'valittu teksti', ...extra });

describe('sanitizeContext', () => {
  test('sanitizeContext drops malformed input and cuts the action list to 20', () => {
    expect(sanitizeContext(null, 1)).toBeNull();
    expect(sanitizeContext('x', 1)).toBeNull();
    expect(sanitizeContext({ y: 3, hasSelection: true }, 1)).toBeNull();
    expect(sanitizeContext({ x: '4', y: 3 }, 1)).toBeNull();
    expect(sanitizeContext({ x: 4, y: NaN }, 1)).toBeNull();
    expect(sanitizeContext({ x: Infinity, y: 3 }, 1)).toBeNull();

    const many = Array.from({ length: 30 }, (_, n) => ({ id: `user-${n}`, label: `Ohje ${n}` }));
    const result = sanitizeContext({ x: 4, y: 3, hasSelection: 1, actions: many, extra: 'pois' }, 777);
    expect(result).toEqual({ x: 4, y: 3, hasSelection: true, actions: many.slice(0, 20), at: 777 });

    // Only well-formed actions pass, and nothing but id and label is kept
    const mixed = sanitizeContext({
      x: 0,
      y: 0,
      actions: [
        null,
        'tighten',
        { id: 5, label: 'Numero' },
        { id: 'a', label: null },
        { id: '', label: 'Tyhjä tunniste' },
        { id: 'x'.repeat(65), label: 'Pitkä tunniste' },
        { id: 'pitka', label: 'ö'.repeat(61) },
        { id: 'x'.repeat(64), label: 'ö'.repeat(60) },
        { id: 'ok', label: 'Selkeytä', click: 'ei kuulu tänne' }
      ]
    }, 5);
    expect(mixed.hasSelection).toBe(false);
    expect(mixed.actions).toEqual([
      { id: 'x'.repeat(64), label: 'ö'.repeat(60) },
      { id: 'ok', label: 'Selkeytä' }
    ]);

    // No list at all is an empty list
    expect(sanitizeContext({ x: 1, y: 2, hasSelection: true }, 9).actions).toEqual([]);
    expect(sanitizeContext({ x: 1, y: 2, actions: 'ei lista' }, 9).actions).toEqual([]);
  });
});

describe('takeContext', () => {
  test('takeContext accepts a flag at the same point within two seconds', () => {
    const flag = stored();
    expect(takeContext(flag, params(), 10000)).toBe(flag);
    expect(takeContext(flag, params(), 12000)).toBe(flag);
    // The two events may report the point a few pixels apart
    expect(takeContext(flag, params({ x: 404, y: 296 }), 10500)).toBe(flag);
  });

  test('a right click on a word that was not selected: the report said no selection, Electron has the word, the menu is for it (I-05 review)', () => {
    // macOS selects the word under the pointer after the renderer reported
    const early = stored({ hasSelection: false });
    expect(takeContext(early, params({ selectionText: 'juna' }), 10500)).toBe(early);
    // No word under the pointer (empty space, a blank line): still nothing
    expect(takeContext(early, params({ selectionText: '' }), 10500)).toBeNull();
    expect(takeContext(early, params({ selectionText: ' \n ' }), 10500)).toBeNull();
    // Still only at its own point and only in an editable field
    expect(takeContext(early, params({ x: 405, selectionText: 'juna' }), 10500)).toBeNull();
    expect(takeContext(early, params({ isEditable: false, selectionText: 'juna' }), 10500)).toBeNull();
  });

  test('takeContext refuses another point, an old flag, a field without selection and a non-editable target', () => {
    const flag = stored();
    expect(takeContext(flag, params({ x: 405 }), 10500)).toBeNull();
    expect(takeContext(flag, params({ y: 295 }), 10500)).toBeNull();
    expect(takeContext(flag, params(), 12001)).toBeNull();
    expect(takeContext(flag, params({ isEditable: false }), 10500)).toBeNull();
    expect(takeContext(flag, params({ selectionText: '   ' }), 10500)).toBeNull();
    expect(takeContext(flag, params({ selectionText: '' }), 10500)).toBeNull();
    expect(takeContext(flag, params({ selectionText: undefined }), 10500)).toBeNull();
    expect(takeContext(null, params(), 10500)).toBeNull();
    expect(takeContext(flag, null, 10500)).toBeNull();
    // A click in another field never has matching coordinates
    expect(takeContext(flag, params({ x: undefined, y: undefined }), 10500)).toBeNull();
  });
});

describe('buildAiSubmenu', () => {
  test('buildAiSubmenu ends with Oma ohje… and sends the action id', () => {
    const chosen = [];
    const menu = buildAiSubmenu(stored(), (id) => chosen.push(id));

    expect(menu.label).toBe('Tekoäly');
    expect(menu.submenu.map((item) => item.label || item.type)).toEqual([
      'Kielenhuolto – vain virheet',
      'Tiivistä',
      'Säilytä ”sitaatit”',
      'separator',
      'Oma ohje…'
    ]);

    menu.submenu[1].click();
    menu.submenu[2].click();
    menu.submenu[menu.submenu.length - 1].click();
    expect(chosen).toEqual(['tighten', 'user-abc', 'custom']);
  });

  test('buildAiSubmenu without actions still offers the free instruction', () => {
    const chosen = [];
    const menu = buildAiSubmenu({ actions: [] }, (id) => chosen.push(id));
    expect(menu.submenu.map((item) => item.label || item.type)).toEqual(['separator', 'Oma ohje…']);
    menu.submenu[1].click();
    expect(chosen).toEqual(['custom']);
    expect(buildAiSubmenu(null, () => {}).submenu).toHaveLength(2);
  });
});
