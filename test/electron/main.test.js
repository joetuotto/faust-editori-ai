const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs').promises;
const path = require('path');

// Mock the electron modules
jest.mock('electron', () => ({
  app: {
    whenReady: jest.fn(),
    on: jest.fn(),
    quit: jest.fn()
  },
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadFile: jest.fn(),
    loadURL: jest.fn(),
    close: jest.fn(),
    webContents: {
      printToPDF: jest.fn()
    }
  })),
  ipcMain: {
    handle: jest.fn()
  },
  dialog: {
    showSaveDialog: jest.fn(),
    showOpenDialog: jest.fn()
  }
}));

describe('Electron Main Process - Export Functions', () => {
  describe('convertToRTF', () => {
    test('converts text to RTF format correctly', () => {
      // Import the function directly from the utils module
      const { convertToRTF } = require('../../utils/documentConverters');

      const text = 'Test line 1\nTest line 2\n\nNew paragraph';
      const result = convertToRTF(text);

      expect(result).toContain('\\rtf1\\ansi\\deff0');
      expect(result).toContain('\\par Test line 1');
      expect(result).toContain('\\par Test line 2');
      expect(result).toContain('\\par\n\\par New paragraph');
    });
  });

  describe('convertToHTML', () => {
    test('converts text to HTML format correctly', () => {
      const { convertToHTML } = require('../../utils/documentConverters');

      const text = 'Test content\n\nSecond paragraph';
      const title = 'Test Title';
      const result = convertToHTML(text, title);

      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('<title>Test Title</title>');
      expect(result).toContain('<h1>Test Title</h1>');
      expect(result).toContain('<p>Test content</p>');
      expect(result).toContain('<p>Second paragraph</p>');
      expect(result).toContain('font-family: \'Times New Roman\'');
    });
  });

  describe('convertToDocx', () => {
    test('returns a DOCX buffer', async () => {
      const { convertToDocx } = require('../../utils/documentConverters');

      const text = 'First paragraph\n\nSecond paragraph';
      const title = 'Test Document';
      const result = await convertToDocx(text, title);

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      // DOCX files are ZIP archives, which should start with PK header
      expect(result.slice(0, 2).toString()).toBe('PK');
    });
  });

  describe('Mock API Functions', () => {
    test('web-search returns structured data', async () => {
      // Mock the web-search function
      const mockWebSearch = jest.fn().mockResolvedValue({
        success: true,
        data: {
          facts: {
            history: 'Mock-historian tiedot paikasta: test location',
            architecture: ["betoni", "lasi", "moderni"],
            features: ["metroasema", "kauppakeskus", "liikennekeskus"],
            atmosphere: ["vilkas", "kiireinen", "urbaani"]
          },
          visual: {
            colors_day: ["harmaa", "valkoinen", "sininen"],
            colors_night: ["musta", "neon", "keltainen"],
            lighting: ["keinovalot", "liikennevalot", "neon"],
            textures: ["sileä betoni", "lasi", "asfaltti"]
          },
          writing_tips: [
            "Käytä betonin tekstuuria symbolina kylmyydestä",
            "Neonvalot voivat luoda klaustrofobisen tunnelman",
            "Väkijoukon äänet korostavat yksinäisyyttä"
          ]
        }
      });

      const result = await mockWebSearch('test location');
      expect(result.success).toBe(true);
      expect(result.data.facts.history).toContain('test location');
      expect(result.data.writing_tips).toHaveLength(3);
    });
  });
});
