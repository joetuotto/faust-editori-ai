require('@testing-library/jest-dom');

// Mock Electron APIs for testing
global.electron = {
  ipcRenderer: {
    invoke: jest.fn(),
    on: jest.fn(),
    removeListener: jest.fn(),
  },
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn(),
    removeListener: jest.fn(),
  },
};

// Mock React for testing
global.React = require('react');
global.ReactDOM = require('react-dom');

// Mock window APIs
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock;
