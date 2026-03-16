/**
 * GHO Work — Electron main process entry point.
 */
import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { createMainProcess } from '@gho-work/electron';

// Allow tests to override userData directory for isolation
if (process.env.GHO_USER_DATA_DIR) {
  app.setPath('userData', process.env.GHO_USER_DATA_DIR);
}

// --mock flag enables mock SDK mode (for testing without GitHub auth)
const useMockSDK = process.argv.includes('--mock');
if (useMockSDK) {
  console.warn('[main] Mock mode enabled via --mock flag');
}

// Parse --skills-path for test isolation
const skillsPathIdx = process.argv.indexOf('--skills-path');
const skillsPath = skillsPathIdx !== -1 ? process.argv[skillsPathIdx + 1] : undefined;

// Parse --plugin-dir flags for local plugin testing
const pluginDirs: string[] = [];
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--plugin-dir' && process.argv[i + 1]) {
    pluginDirs.push(process.argv[i + 1]);
    i++;
  }
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    title: 'GHO Work',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 12 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Set up main process services and IPC handlers
  createMainProcess(mainWindow, undefined, undefined, {
    useMockSDK,
    userDataPath: app.getPath('userData'),
    skillsPath,
    pluginDirs: pluginDirs.length > 0 ? pluginDirs : undefined,
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Load the renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
