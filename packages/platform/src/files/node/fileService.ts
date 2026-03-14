import {
  readFile as fsReadFile,
  writeFile as fsWriteFile,
  access,
  readdir,
  stat as fsStat,
  mkdir as fsMkdir,
  rename as fsRename,
  rm,
} from 'node:fs/promises';
import { watch as fsWatch, type FSWatcher, type Dirent } from 'node:fs';
import { join, basename } from 'node:path';
import { Disposable, Emitter } from '@gho-work/base';
import type { Event, IDisposable } from '@gho-work/base';
import type { IFileService, FileEntry, FileChangeEvent } from '../common/files.js';

export class NodeFileService extends Disposable implements IFileService {
  private readonly _onDidChangeFile = this._register(new Emitter<FileChangeEvent>());
  readonly onDidChangeFile: Event<FileChangeEvent> = this._onDidChangeFile.event;

  private readonly _watchers = new Map<string, FSWatcher>();
  private _nextWatchId = 0;

  constructor() {
    super();
  }

  async readFile(path: string): Promise<string> {
    return fsReadFile(path, 'utf-8');
  }

  async writeFile(path: string, content: string): Promise<void> {
    await fsWriteFile(path, content, 'utf-8');
  }

  async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  async readDir(path: string): Promise<string[]> {
    return readdir(path);
  }

  async mkdir(path: string): Promise<void> {
    await fsMkdir(path, { recursive: true });
  }

  async readDirWithStats(dirPath: string): Promise<FileEntry[]> {
    const names = await readdir(dirPath);
    const entries: FileEntry[] = [];
    for (const name of names) {
      try {
        const fullPath = join(dirPath, name);
        const s = await fsStat(fullPath);
        entries.push({
          name,
          path: fullPath,
          type: s.isDirectory() ? 'directory' : s.isSymbolicLink() ? 'symlink' : 'file',
          size: s.size,
          mtime: s.mtimeMs,
          isHidden: name.startsWith('.'),
        });
      } catch {
        // Skip entries that can't be stat'd (e.g., broken symlinks)
      }
    }
    return entries;
  }

  async stat(filePath: string): Promise<FileEntry> {
    const s = await fsStat(filePath);
    return {
      name: basename(filePath),
      path: filePath,
      type: s.isDirectory() ? 'directory' : s.isSymbolicLink() ? 'symlink' : 'file',
      size: s.size,
      mtime: s.mtimeMs,
      isHidden: basename(filePath).startsWith('.'),
    };
  }

  async createFile(filePath: string, content?: string): Promise<void> {
    await fsWriteFile(filePath, content ?? '', 'utf-8');
  }

  async createDir(dirPath: string): Promise<void> {
    await fsMkdir(dirPath, { recursive: true });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await fsRename(oldPath, newPath);
  }

  async delete(targetPath: string): Promise<void> {
    await rm(targetPath, { recursive: true, force: true });
  }

  async watch(dirPath: string): Promise<IDisposable> {
    const id = String(this._nextWatchId++);
    const watcher = fsWatch(dirPath, { recursive: true }, (eventType, filename) => {
      if (!filename) { return; }
      const fullPath = join(dirPath, filename);
      this._onDidChangeFile.fire({
        type: eventType === 'rename' ? 'created' : 'changed',
        path: fullPath,
      });
    });
    this._watchers.set(id, watcher);
    return {
      dispose: () => {
        watcher.close();
        this._watchers.delete(id);
      },
    };
  }

  async search(rootPath: string, query: string, maxResults = 50): Promise<FileEntry[]> {
    const results: FileEntry[] = [];
    const lowerQuery = query.toLowerCase();

    const walk = async (dir: string): Promise<void> => {
      if (results.length >= maxResults) { return; }
      let entries: Dirent[];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (results.length >= maxResults) { return; }
        const fullPath = join(dir, entry.name);
        if (entry.name.toLowerCase().includes(lowerQuery)) {
          results.push({
            name: entry.name,
            path: fullPath,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: 0,
            mtime: 0,
            isHidden: entry.name.startsWith('.'),
          });
        }
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await walk(fullPath);
        }
      }
    };

    await walk(rootPath);
    return results;
  }

  override dispose(): void {
    for (const watcher of this._watchers.values()) {
      watcher.close();
    }
    this._watchers.clear();
    super.dispose();
  }
}
