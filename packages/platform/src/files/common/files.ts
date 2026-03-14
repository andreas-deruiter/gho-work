import { createServiceIdentifier } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import type { IDisposable } from '@gho-work/base';
import type { FileEntry, FileChangeEvent } from '../../ipc/common/ipc.js';

export type { FileEntry, FileChangeEvent };

export interface IFileService {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  readDir(path: string): Promise<string[]>;
  mkdir(path: string): Promise<void>;

  // Files panel methods
  readDirWithStats(path: string): Promise<FileEntry[]>;
  stat(path: string): Promise<FileEntry>;
  createFile(path: string, content?: string): Promise<void>;
  createDir(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  delete(path: string): Promise<void>;
  watch(path: string): Promise<IDisposable>;
  readonly onDidChangeFile: Event<FileChangeEvent>;
  search(rootPath: string, query: string, maxResults?: number): Promise<FileEntry[]>;
}

export const IFileService = createServiceIdentifier<IFileService>('IFileService');
