import { createServiceIdentifier } from '@gho-work/base';

export interface IFileService {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  readDir(path: string): Promise<string[]>;
  mkdir(path: string): Promise<void>;
}

export const IFileService = createServiceIdentifier<IFileService>('IFileService');
