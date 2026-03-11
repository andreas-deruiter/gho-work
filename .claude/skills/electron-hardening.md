---
name: electron-hardening
description: Consult when working on Electron-specific code — security, packaging, signing, native modules, safeStorage, multi-process, auto-update. Covers Phase 0, 1, and 5 tasks.
---

# Electron Hardening Reference

## Security Baseline

Every `BrowserWindow` MUST use these settings:
```typescript
new BrowserWindow({
  webPreferences: {
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
    preload: path.join(app.getAppPath(), 'preload.js'),
  }
});
```

Never enable: `allowRunningInsecureContent`, `experimentalFeatures`, `enableBlinkFeatures`, `enableRemoteModule`.

## contextBridge Rules

**Expose only specific validated functions** — never expose raw `ipcRenderer`, `require`, `process`, `fs`, `child_process`, or `shell`.

```typescript
// preload.ts — CORRECT
contextBridge.exposeInMainWorld('api', {
  readFile: (path: string) => ipcRenderer.invoke('fs:read', path),
  onUpdate: (cb: (info: UpdateInfo) => void) => {
    const handler = (_e: IpcRendererEvent, info: UpdateInfo) => cb(info);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  }
});
```

**Validate again in main process handlers** — defense in depth:
```typescript
ipcMain.handle('fs:read', async (event, filePath) => {
  if (!isAllowedPath(filePath)) throw new Error('Path not allowed');
  return fs.promises.readFile(filePath, 'utf-8');
});
```

## Content Security Policy

Inject via session headers:
```typescript
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': [
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'"
      ]
    }
  });
});
```

Never use `*` wildcard or `unsafe-eval`.

## Native Modules (better-sqlite3, etc.)

1. Install `@electron/rebuild` as devDependency
2. Add postinstall hook: `"postinstall": "electron-rebuild"`
3. Externalize in electron-vite config:
   ```typescript
   main: { build: { rollupOptions: { external: ['better-sqlite3'] } } }
   ```
4. Unpack from ASAR in electron-builder:
   ```json
   { "build": { "asarUnpack": ["**/node_modules/better-sqlite3/**"] } }
   ```

## safeStorage (Token Storage)

```typescript
import { safeStorage } from 'electron';

function storeToken(key: string, token: string): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Encryption unavailable');
  const encrypted = safeStorage.encryptString(token);
  // Store encrypted buffer as base64 in a JSON file in userData
}

function retrieveToken(key: string): string | null {
  const encrypted = Buffer.from(stored, 'base64');
  return safeStorage.decryptString(encrypted);
}
```

**Linux caveat**: Check `safeStorage.getSelectedStorageBackend()` — if `'basic_text'`, warn the user (no real encryption available).

**Platform behavior**: macOS uses Keychain (protected from other apps), Windows uses DPAPI (protected from other users only), Linux varies by desktop environment.

## Multi-Process: Utility Process + MessagePort

Use `utilityProcess.fork()` for the Agent Host (CPU-intensive, crash-isolatable):

```typescript
// main.ts — spawn utility process, create MessagePort channel
const agentHost = utilityProcess.fork(workerPath);
const { port1, port2 } = new MessageChannelMain();
agentHost.postMessage({ type: 'port' }, [port1]);
mainWindow.webContents.postMessage('port', null, [port2]);
```

With electron-vite, import utility process scripts via `?modulePath`:
```typescript
import workerPath from './agent-host?modulePath';
```

## Crash Recovery

```typescript
function spawnAgentHost() {
  const child = utilityProcess.fork(workerPath);
  let restartCount = 0;
  child.on('exit', (code) => {
    if (code !== 0 && restartCount < 5) {
      restartCount++;
      setTimeout(spawnAgentHost, restartCount * 1000); // exponential backoff
    }
  });
  return child;
}
```

Track restart frequency — if > 3 restarts in 5 minutes, stop auto-restarting and surface an error.

## Packaging & Signing

**macOS**: Developer ID Application certificate + notarytool. Use App Store Connect API Key for CI (no 2FA issues). Minimum entitlement: `com.apple.security.cs.allow-unsigned-executable-memory`.

**Windows**: EV certificate or Azure Trusted Signing required since June 2023 (standard OV no longer suppresses SmartScreen). Cloud HSM-backed signing for CI.

**Auto-update**: electron-updater + GitHub Releases. Only check when `app.isPackaged`. macOS apps must be signed. Never force `quitAndInstall()` without user consent.

## Checklist

Before shipping any Electron code, verify:
- [ ] `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`
- [ ] No raw `ipcRenderer` exposed via contextBridge
- [ ] CSP headers set (no `unsafe-eval`, no `*` wildcards)
- [ ] Native modules externalized in Vite config
- [ ] Native modules unpacked from ASAR
- [ ] `@electron/rebuild` runs in postinstall
- [ ] IPC handlers validate sender and arguments
- [ ] safeStorage used for all secrets/tokens
- [ ] Navigation restricted (`will-navigate`, `setWindowOpenHandler`)
