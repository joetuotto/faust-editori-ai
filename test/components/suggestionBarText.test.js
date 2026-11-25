/**
 * @jest-environment node
 */
// Words of the suggestion bar (src/components/SuggestionBar.js, an ES module of the bundle that Jest does not
// load): the notices' table is read from the file and run with format.fi.js's formatCount.
//
// Final-pass review: a rejected draft (Tekoälyn luonnos) that cannot come back is named itself, not counted as a
// suggestion; the done state's other-chapters button carries its whole line as its title (T-057 may cut it).
const fs = require('fs');
const path = require('path');
const { formatCount } = require('../../src/services/format.fi');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'SuggestionBar.js'), 'utf8');

function noticeTable() {
  const from = SOURCE.indexOf('const NOTICE_TEXT = {');
  const to = SOURCE.indexOf('\n};\n', from);
  expect(from).toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  // eslint-disable-next-line no-new-func
  return new Function('formatCount', SOURCE.slice(from, to + 3) + '\nreturn NOTICE_TEXT;')(formatCount);
}

describe('the suggestion bar\'s notices', () => {
  const NOTICE = noticeTable();

  test('a restore that fails for suggestions only says so, as before', () => {
    expect(NOTICE['restore-failed'](1, false)).toBe('Yhtä hylättyä ehdotusta ei voitu palauttaa, koska teksti on muuttunut.');
    expect(NOTICE['restore-failed'](3, false)).toBe('3 hylättyä ehdotusta ei voitu palauttaa, koska teksti on muuttunut.');
  });

  test('a rejected draft that cannot come back is named itself (the count includes it)', () => {
    expect(NOTICE['restore-failed'](1, true)).toBe('Tekoälyn luonnosta ei voitu palauttaa, koska teksti on muuttunut.');
    expect(NOTICE['restore-failed'](2, true)).toBe('Yhtä hylättyä ehdotusta ja tekoälyn luonnosta ei voitu palauttaa, koska teksti on muuttunut.');
    expect(NOTICE['restore-failed'](4, true)).toBe('3 hylättyä ehdotusta ja tekoälyn luonnosta ei voitu palauttaa, koska teksti on muuttunut.');
  });

  test('the model\'s notice carries block, and the bar reads it', () => {
    expect(SOURCE).toContain("text(Number(notice.count) || 1, notice.block === true)");
  });
});

describe('the done state\'s buttons', () => {
  test('Muissa luvuissa odottaa … has its whole line as its title, and the long line is marked for the stylesheet', () => {
    expect(SOURCE).toMatch(/title: elsewhereLabel\(info\),\s*onMouseDown: keep,\s*onClick: openElsewhere/);
    expect(SOURCE).toContain("'data-elsewhere': long ? 'long' : undefined");
    const css = fs.readFileSync(path.join(__dirname, '..', '..', 'styles', 'faust-components.css'), 'utf8');
    expect(css).toMatch(/@container page \(max-width: 900px\) \{\s*\.faust-suggestbar\[data-elsewhere="long"\]:not\(:has\(\.faust-suggestbar__count\)\) \.faust-suggestbar__name \{ display: none; \}/);
  });
});
