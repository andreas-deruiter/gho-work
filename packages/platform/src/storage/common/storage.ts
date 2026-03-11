import { createServiceIdentifier } from '@gho-work/base';

export interface IStorageService {
  getSetting(key: string): string | undefined;
  setSetting(key: string, value: string): void;
  getGlobalDatabase(): unknown;
  getWorkspaceDatabase(workspaceId: string): unknown;
  close(): void;
}

export const IStorageService = createServiceIdentifier<IStorageService>('IStorageService');
