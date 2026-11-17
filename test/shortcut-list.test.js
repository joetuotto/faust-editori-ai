// Pikanäppäimet against the application menu (menu spec C.1, reconcile R-5).
//
// The shortcut list (src/components/Dialogs.js, SHORTCUT_GROUPS) has one row per accelerator that
// the menu (electron.js, createMenu) shows, labelled as the menu item without its ellipsis. Jest
// cannot load either file (Dialogs.js uses ES `export`, electron.js needs Electron), so both are
// read as text:
//  - electron.js, inside createMenu(): every item('Label', 'action', accelerator) call, every
//    object literal with a label and an accelerator, and every object literal with a label and a
//    role whose accelerator Electron supplies (ROLE_ACCELERATORS);
//  - Dialogs.js: only the literal block of SHORTCUT_GROUPS. EDITOR_SHORTCUT_GROUPS holds keys the
//    menu does not carry and is not read. A row is [label, accelerator] or [label, accelerator,
//    flag]; the flag does not take part in the comparison.
// Accelerators are compared after their spelling and modifier order are made canonical; one
// written as `isMac ? 'A' : 'B'` is compared as that pair. Group order is not compared (the macOS
// app menu is labelled app.name), duplicates collapse (Asetukset… stands in both platform
// branches), and Lopeta / Lopeta FAUST count as one command.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// Electron's default accelerators for the roles the menu uses without one of its own
// (electron 30, lib/browser/api/menu-item-roles.ts; checked in the running app with
// MenuItem#getDefaultRoleAccelerator). hide and hideOthers exist on macOS only, where Electron's
// Command+H and Command+Alt+H are CmdOrCtrl; SHORTCUT_GROUPS writes them that way too.
const ROLE_ACCELERATORS = {
  cut: 'CmdOrCtrl+X',
  copy: 'CmdOrCtrl+C',
  paste: 'CmdOrCtrl+V',
  selectAll: 'CmdOrCtrl+A',
  minimize: 'CmdOrCtrl+M',
  quit: 'CmdOrCtrl+Q',
  hide: 'CmdOrCtrl+H',
  hideOthers: 'CmdOrCtrl+Alt+H'
};
// Roles that Electron gives no accelerator
const ROLES_WITHOUT_ACCELERATOR = ['about', 'unhide', 'zoom', 'front'];

const SAME_COMMAND = { 'Lopeta FAUST': 'Lopeta' };

// One accelerator in one spelling: long modifier names shortened, modifiers in a fixed order
const MODIFIERS = { commandorcontrol: 'CmdOrCtrl', cmdorctrl: 'CmdOrCtrl', command: 'Cmd', cmd: 'Cmd', control: 'Ctrl', ctrl: 'Ctrl', alt: 'Alt', option: 'Alt', altgr: 'AltGr', shift: 'Shift', super: 'Super', meta: 'Meta' };
const ORDER = ['CmdOrCtrl', 'Cmd', 'Ctrl', 'Alt', 'AltGr', 'Shift', 'Super', 'Meta'];
const canonKeys = (accelerator) => {
  const parts = accelerator.split('+').map(p => p.trim());
  const key = parts.pop();
  const mods = parts.map(p => MODIFIERS[p.toLowerCase()] || p).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  return [...mods, key.length === 1 ? key.toUpperCase() : key].join('+');
};

const STRING = String.raw`'(?:[^'\\]|\\.)*'`;
const TERNARY = String.raw`isMac\s*\?\s*${STRING}\s*:\s*${STRING}`;
const ACCELERATOR = `${TERNARY}|${STRING}`;
const unquote = (literal) => literal.slice(1, -1).replace(/\\(.)/g, '$1');

// An accelerator expression as written in either file → one comparable string
const canonAccelerator = (expression) => {
  const ternary = expression.match(new RegExp(`^isMac\\s*\\?\\s*(${STRING})\\s*:\\s*(${STRING})$`));
  if (ternary) return `macOS: ${canonKeys(unquote(ternary[1]))} | muut: ${canonKeys(unquote(ternary[2]))}`;
  return canonKeys(unquote(expression));
};
const canonLabel = (label) => {
  const plain = label.replace(/(…|\.\.\.)$/, '').trim();
  return SAME_COMMAND[plain] || plain;
};

// The text of every object literal, with what lies inside nested brackets left out, so that
// only its own properties remain (strings are kept whole; comments are dropped)
function objectLiterals(source) {
  const out = [];
  const stack = [];
  const top = () => stack[stack.length - 1];
  const add = (text) => { if (top()) top().text += text; };
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') { i = source.indexOf('\n', i); if (i === -1) break; continue; }
    if (c === '/' && next === '*') { i = source.indexOf('*/', i) + 2; continue; }
    if (c === '\'' || c === '"' || c === '`') {
      let j = i + 1;
      while (j < source.length && source[j] !== c) j += source[j] === '\\' ? 2 : 1;
      add(source.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    if (c === '{' || c === '[' || c === '(') {
      add(c);
      stack.push({ open: c, text: '' });
    } else if (c === '}' || c === ']' || c === ')') {
      const frame = stack.pop();
      if (frame && frame.open === '{') out.push(frame.text);
      add(c);
    } else {
      add(c);
    }
    i++;
  }
  return out;
}

function menuRows() {
  const electron = read('electron.js');
  const start = electron.indexOf('function createMenu()');
  const end = electron.indexOf('Menu.setApplicationMenu(', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const body = electron.slice(start, end);

  const rows = [];
  const unknownRoles = [];

  // item('Label', 'action', accelerator, arg)
  const itemCall = new RegExp(`\\bitem\\(\\s*(${STRING})\\s*,\\s*${STRING}\\s*,\\s*(${ACCELERATOR})`, 'g');
  for (const m of body.matchAll(itemCall)) rows.push([unquote(m[1]), canonAccelerator(m[2])]);

  // { label: 'Label', accelerator: …, role: … }
  const prop = (text, name, value) => {
    const m = text.match(new RegExp(`(?:^|[,{])\\s*${name}\\s*:\\s*(${value})`));
    return m ? m[1] : null;
  };
  for (const text of objectLiterals(body)) {
    const label = prop(text, 'label', STRING);
    if (!label) continue;
    const accelerator = prop(text, 'accelerator', ACCELERATOR);
    const role = prop(text, 'role', STRING);
    if (accelerator) rows.push([unquote(label), canonAccelerator(accelerator)]);
    else if (role) {
      const name = unquote(role);
      if (ROLE_ACCELERATORS[name]) rows.push([unquote(label), canonAccelerator(`'${ROLE_ACCELERATORS[name]}'`)]);
      else if (!ROLES_WITHOUT_ACCELERATOR.includes(name)) unknownRoles.push(name);
    }
  }
  return { rows, unknownRoles };
}

function listGroups() {
  const dialogs = read('src/components/Dialogs.js');
  const block = dialogs.match(/export const SHORTCUT_GROUPS = \[([\s\S]*?)\n\];/);
  expect(block).not.toBeNull();
  const row = new RegExp(`\\[\\s*(${STRING})\\s*,\\s*(${ACCELERATOR})\\s*(?:,\\s*(${STRING})\\s*)?\\]`, 'g');
  // Each group runs from its title to the next title
  const titles = [...block[1].matchAll(new RegExp(`title:\\s*(${STRING})`, 'g'))];
  return titles.map((t, index) => {
    const slice = block[1].slice(t.index, index + 1 < titles.length ? titles[index + 1].index : undefined);
    return {
      title: unquote(t[1]),
      rows: [...slice.matchAll(row)].map(m => ({ label: unquote(m[1]), accelerator: canonAccelerator(m[2]), flag: m[3] ? unquote(m[3]) : null }))
    };
  });
}

const asSet = (pairs) => [...new Set(pairs.map(([label, accelerator]) => `${canonLabel(label)} = ${accelerator}`))].sort();

describe('Pikanäppäimet and the application menu', () => {
  test('both files yield rows (the readers still match the code)', () => {
    const { rows } = menuRows();
    const groups = listGroups();
    expect(rows.length).toBeGreaterThan(30);
    expect(groups.length).toBeGreaterThan(5);
    expect(groups.every(g => g.rows.length > 0)).toBe(true);
  });

  test('every role of the menu has a known accelerator or none', () => {
    expect(menuRows().unknownRoles).toEqual([]);
  });

  test('SHORTCUT_GROUPS lists exactly the accelerators the menu shows, under the menu labels', () => {
    const menu = asSet(menuRows().rows);
    const list = asSet(listGroups().flatMap(g => g.rows.map(r => [r.label, r.accelerator])));
    expect(list).toEqual(menu);
  });

  test('row labels are unique within a group (they are React keys)', () => {
    for (const group of listGroups()) {
      const labels = group.rows.map(r => r.label);
      expect({ group: group.title, labels: [...new Set(labels)] }).toEqual({ group: group.title, labels });
    }
  });

  test('a menu row carries no flag but ai (typed sequences belong to EDITOR_SHORTCUT_GROUPS)', () => {
    const flags = listGroups().flatMap(g => g.rows.map(r => r.flag)).filter(Boolean);
    expect(flags.filter(f => f !== 'ai')).toEqual([]);
  });
});
