import type { ISecureStorageService } from '../common/auth.js';

interface SafeStorageAPI {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

interface KeyValueStore {
  read(key: string): string | null;
  write(key: string, value: string): void;
  delete(key: string): void;
}

export class SecureStorageService implements ISecureStorageService {
  constructor(
    private readonly _safeStorage: SafeStorageAPI,
    private readonly _store: KeyValueStore,
  ) {}

  store(key: string, value: string): void {
    if (!this._safeStorage.isEncryptionAvailable()) {
      throw new Error('Encryption is not available on this system');
    }
    const encrypted = this._safeStorage.encryptString(value);
    this._store.write(key, encrypted.toString('base64'));
  }

  retrieve(key: string): string | null {
    const stored = this._store.read(key);
    if (stored === null) {
      return null;
    }
    const encrypted = Buffer.from(stored, 'base64');
    return this._safeStorage.decryptString(encrypted);
  }

  delete(key: string): void {
    this._store.delete(key);
  }
}
