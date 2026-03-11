/**
 * Platform common exports — safe to import from browser/renderer code.
 * Does NOT include Node.js-specific modules (storage, auth node impls).
 */
export * from './ipc/common/ipc.js';
export * from './ipc/common/ipcService.js';
export * from './ipc/common/messagePortChannel.js';
export * from './storage/common/storage.js';
export * from './auth/common/auth.js';
export * from './files/common/files.js';
