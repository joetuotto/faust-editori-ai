const { convertToRTF, convertToHTML, convertToDocx } = require('../../utils/documentConverters');

describe('documentConverters', () => {
  test('convertToRTF wraps content with RTF header', () => {
    const text = 'Rivi 1\nRivi 2';
    const rtf = convertToRTF(text);
    expect(rtf.startsWith('{\\rtf1\\ansi')).toBe(true);
    expect(rtf).toContain('\\par Rivi 1');
    expect(rtf).toContain('\\par Rivi 2');
  });

  test('convertToHTML produces simple HTML document', () => {
    const html = convertToHTML('Ensimmäinen kappale\n\nToinen kappale', 'Otsikko');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>Otsikko</title>');
    expect(html).toContain('<p>Ensimmäinen kappale</p>');
    expect(html).toContain('<p>Toinen kappale</p>');
  });

  test('convertToDocx returns a buffer', async () => {
    const buffer = await convertToDocx('Sisältöä', 'Otsikko');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });
});
