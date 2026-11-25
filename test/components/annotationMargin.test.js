// The annotation margin's markers stand at their own lines (final-pass review of T-004).
//
// Since T-004 the consistency checker writes its marks, and the margin placed each one by the share of its position
// in the whole scroll height: in a short chapter a mark stood about 190 px below its only line, because the page's
// bottom padding (30vh) and uneven lines are in that height. The editor now tells where a position's text stands
// (FaustEditor's lineTopOf); the margin puts the marker's middle on that line and leaves out a marker whose line is
// out of view instead of pinning it to the strip's edge. Without the editor it keeps the estimate.
const React = require('react');
// react-dom/server's browser build wants TextEncoder, which jsdom does not give
if (typeof global.TextEncoder === 'undefined') global.TextEncoder = require('util').TextEncoder;
const { renderToStaticMarkup } = require('react-dom/server');

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  global.React = React;
  require('../../src/utils/annotationTypes.js');
  require('../../src/components/AnnotationMargin.js');
});

afterAll(() => {
  console.log.mockRestore();
  delete global.React;
});

const mark = (id, position) => ({
  id, type: 'ai_consistency', position, length: 8, content: 'Toka (1.3.2019) tapahtuu ennen Eka (1.5.2020)',
  priority: 'critical', source: 'ai', resolved: false
});

// The markup's marker groups: their top (px) and the ids of their markers' labels, in order
function groups(props) {
  const html = renderToStaticMarkup(React.createElement(window.AnnotationMargin, props));
  const host = document.createElement('div');
  host.innerHTML = html;
  return Array.from(host.querySelectorAll('.faust-annot-margin > div > div')).map(group => ({
    top: parseFloat(group.style.top),
    markers: group.querySelectorAll('.faust-annot-marker').length
  }));
}

const CONTENT = 'Aino saapui Ekaan 1.5.2020 junalla.';
// A short chapter: one line at 225–265 px in a 600 px tall editor whose scroll height has the 30vh bottom padding
const SHORT = { scrollTop: 0, clientHeight: 600, scrollHeight: 870 };

describe('AnnotationMargin places a marker at its line', () => {
  test('the editor\'s measure decides: the marker\'s middle on the middle of its line', () => {
    const lineTopOf = jest.fn(() => ({ top: 233, bottom: 257 }));
    const placed = groups({ annotations: [mark('a1', 21)], content: CONTENT, editorDimensions: SHORT, lineTopOf });
    expect(lineTopOf).toHaveBeenCalledWith(21);
    expect(placed).toEqual([{ top: 235, markers: 1 }]);
  });

  test('without the editor the old estimate stays (and would put this one far below its line)', () => {
    const placed = groups({ annotations: [mark('a1', 21)], content: CONTENT, editorDimensions: SHORT });
    expect(placed).toHaveLength(1);
    expect(placed[0].top).toBeCloseTo(21 / CONTENT.length * 870, 5);
    // The same when the editor cannot say (gone with its chapter)
    expect(groups({ annotations: [mark('a1', 21)], content: CONTENT, editorDimensions: SHORT, lineTopOf: () => null }))
      .toEqual(placed);
  });

  test('a marker whose line is scrolled out of view is not drawn, never pinned to the strip\'s edge', () => {
    const tops = { 10: { top: -80, bottom: -56 }, 400: { top: 300, bottom: 324 }, 900: { top: 640, bottom: 664 } };
    const placed = groups({
      annotations: [mark('above', 10), mark('here', 400), mark('below', 900)],
      content: 'x'.repeat(1000),
      editorDimensions: { scrollTop: 500, clientHeight: 600, scrollHeight: 4000 },
      lineTopOf: (pos) => tops[pos]
    });
    expect(placed).toEqual([{ top: 302, markers: 1 }]);
  });

  test('two marks on lines close together still share one group, at their middle', () => {
    const tops = { 5: { top: 100, bottom: 124 }, 30: { top: 110, bottom: 134 } };
    const placed = groups({
      annotations: [mark('a', 5), mark('b', 30)],
      content: CONTENT,
      editorDimensions: SHORT,
      lineTopOf: (pos) => tops[pos]
    });
    expect(placed).toEqual([{ top: 107, markers: 2 }]);
  });

  test('app.js hands the editor\'s lineTopOf to the margin, and FaustEditor measures by CodeMirror\'s own coordinates', () => {
    const fs = require('fs');
    const path = require('path');
    const read = (file) => fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8');
    expect(read('app.js')).toContain('lineTopOf: (pos) => (editorRef.current && typeof editorRef.current.lineTopOf === \'function\'');
    const editor = read('src/components/FaustEditor.js');
    expect(editor).toContain('el.lineTopOf = (pos) => {');
    expect(editor).toContain('view.coordsAtPos(at, 1)');
    expect(editor).toContain('view.lineBlockAt(at)');
  });
});
