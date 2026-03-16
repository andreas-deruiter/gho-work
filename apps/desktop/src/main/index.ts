/**
 * GHO Work — Electron main process entry point.
 */
import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { createWriteStream } from 'fs';
import { mkdirSync } from 'fs';
import { createMainProcess } from '@gho-work/electron';

// Allow tests to override userData directory for isolation
if (process.env.GHO_USER_DATA_DIR) {
  app.setPath('userData', process.env.GHO_USER_DATA_DIR);
}

// File-based logging — writes main process logs to userData/logs/main.log
const logsDir = join(app.getPath('userData'), 'logs');
try { mkdirSync(logsDir, { recursive: true }); } catch { /* exists */ }
const logPath = join(logsDir, 'main.log');
const logStream = createWriteStream(logPath, { flags: 'a' });
const originalWarn = console.warn;
const originalError = console.error;
const timestamp = () => new Date().toISOString();
console.warn = (...args: unknown[]) => {
  originalWarn(...args);
  logStream.write(`[${timestamp()}] WARN: ${args.map(String).join(' ')}\n`);
};
console.error = (...args: unknown[]) => {
  originalError(...args);
  logStream.write(`[${timestamp()}] ERROR: ${args.map(String).join(' ')}\n`);
};
console.warn('[main] Log file:', logPath);

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
  // On Windows/Linux, set the window icon explicitly (macOS uses the .icns from the bundle).
  // In packaged builds, extraResources are in process.resourcesPath; in dev, use repo root.
  const windowIcon = process.platform !== 'darwin'
    ? (app.isPackaged
      ? join(process.resourcesPath, 'icon.png')
      : join(__dirname, '../../../../resources/icon.png'))
    : undefined;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    title: 'GHO Work',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 15, y: 12 } } : {}),
    ...(windowIcon ? { icon: windowIcon } : {}),
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
