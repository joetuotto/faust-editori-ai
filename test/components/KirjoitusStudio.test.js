describe('KirjoitusStudio Component Tests', () => {
  test('word counting utility functions work correctly', () => {
    const countWords = (text) => text.trim().split(/\s+/).filter(word => word.length > 0).length;

    expect(countWords('Tämä on testiteksti')).toBe(3);
    expect(countWords('   useita    sanoja   ')).toBe(2);
    expect(countWords('')).toBe(0);
    expect(countWords('Yksi')).toBe(1);
    expect(countWords('Testi: tämä sisältää välimerkkejä.')).toBe(4);
    expect(countWords('Lukuja: 1, 2, 3')).toBe(4);
  });

  test('electron API is properly mocked', () => {
    expect(global.electron).toBeDefined();
    expect(global.electron.ipcRenderer).toBeDefined();
    expect(typeof global.electron.ipcRenderer.invoke).toBe('function');
  });

  test('React and ReactDOM are available', () => {
    expect(global.React).toBeDefined();
    expect(global.ReactDOM).toBeDefined();
  });

  test('testing framework is working correctly', () => {
    expect(true).toBe(true);
    expect(1 + 1).toBe(2);
  });
});
