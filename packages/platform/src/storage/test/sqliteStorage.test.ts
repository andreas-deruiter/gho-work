import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteStorageService } from '../node/sqliteStorage.js';

describe('SqliteStorageService', () => {
  let service: SqliteStorageService;

  beforeEach(() => {
    service = new SqliteStorageService(':memory:', ':memory:');
  });

  afterEach(() => { service.close(); });

  it('should get and set settings', () => {
    service.setSetting('theme', '"dark"');
    expect(service.getSetting('theme')).toBe('"dark"');
  });

  it('should return undefined for missing settings', () => {
    expect(service.getSetting('nonexistent')).toBeUndefined();
  });

  it('should overwrite existing settings', () => {
    service.setSetting('theme', '"dark"');
    service.setSetting('theme', '"light"');
    expect(service.getSetting('theme')).toBe('"light"');
  });

  it('should provide global database access', () => {
    const db = service.getGlobalDatabase();
    expect(db).toBeTruthy();
  });

  it('should provide workspace database access', () => {
    const db = service.getWorkspaceDatabase('ws-1');
    expect(db).toBeTruthy();
  });
});
