console.log('Test electron starting...');
const electron = require('electron');
console.log('Electron module type:', typeof electron);
console.log('Electron module:', electron);

if (electron && electron.app) {
  console.log('app found!');
  electron.app.whenReady().then(() => {
    console.log('Electron ready!');
    const win = new electron.BrowserWindow({width: 800, height: 600});
    win.loadURL('https://www.google.com');
  });
} else {
  console.log('ERROR: app not found in electron module');
  console.log('Available keys:', electron ? Object.keys(electron) : 'none');
}
