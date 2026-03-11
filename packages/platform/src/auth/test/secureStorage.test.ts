import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SecureStorageService } from '../node/secureStorage.js';

const mockSafeStorage = {
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((s: string) => Buffer.from(`encrypted:${s}`)),
  decryptString: vi.fn((b: Buffer) => b.toString().replace('encrypted:', '')),
};

describe('SecureStorageService', () => {
  let service: SecureStorageService;
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);
    service = new SecureStorageService(mockSafeStorage as any, {
      read: (key: string) => store.get(key) ?? null,
      write: (key: string, value: string) => { store.set(key, value); },
      delete: (key: string) => { store.delete(key); },
    });
  });

  it('should store and retrieve a value', () => {
    service.store('token', 'my-secret-token');
    const result = service.retrieve('token');
    expect(result).toBe('my-secret-token');
    expect(mockSafeStorage.encryptString).toHaveBeenCalledWith('my-secret-token');
  });

  it('should return null for missing keys', () => {
    expect(service.retrieve('missing')).toBeNull();
  });

  it('should delete a stored value', () => {
    service.store('token', 'my-secret');
    service.delete('token');
    expect(service.retrieve('token')).toBeNull();
  });

  it('should throw if encryption unavailable', () => {
    mockSafeStorage.isEncryptionAvailable.mockReturnValueOnce(false);
    expect(() => service.store('token', 'value')).toThrow(/[Ee]ncryption/);
  });
});
