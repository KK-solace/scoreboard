import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let adminWindow = null;
let presentationWindow = null;
let serverPort = 3847;

function createAdminWindow() {
  adminWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    title: 'Quizmaster Control Panel',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  adminWindow.loadURL(`http://localhost:${serverPort}`);
  adminWindow.on('closed', () => {
    adminWindow = null;
    if (presentationWindow) {
      presentationWindow.close();
    }
  });
}

function openPresentationWindow() {
  if (presentationWindow && !presentationWindow.isDestroyed()) {
    presentationWindow.focus();
    return;
  }

  const displays = screen.getAllDisplays();
  const externalDisplay = displays.find((d) => d.bounds.x !== 0 || d.bounds.y !== 0);

  const opts = {
    width: 1280,
    height: 720,
    title: 'Quiz Scoreboard - Presentation Mode',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  if (externalDisplay) {
    opts.x = externalDisplay.bounds.x + 40;
    opts.y = externalDisplay.bounds.y + 40;
  }

  presentationWindow = new BrowserWindow(opts);
  presentationWindow.loadURL(`http://localhost:${serverPort}/?mode=presentation`);
  presentationWindow.on('closed', () => {
    presentationWindow = null;
  });
}

app.whenReady().then(async () => {
  if (!process.env.SCOREBOARD_DATA_DIR) {
    process.env.SCOREBOARD_DATA_DIR = path.join(app.getPath('userData'), 'scoreboard-data');
  }

  const clientDistDir = path.resolve(__dirname, '../client/dist');
  const srv = await startServer({ port: serverPort, clientDistDir });
  serverPort = srv.port;

  ipcMain.handle('open-presentation', () => {
    openPresentationWindow();
  });

  createAdminWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createAdminWindow();
  }
});
