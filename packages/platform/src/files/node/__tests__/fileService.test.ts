import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeFileService } from '../fileService.js';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('NodeFileService', () => {
  let service: NodeFileService;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'gho-test-'));
    service = new NodeFileService();
  });

  afterEach(async () => {
    service.dispose();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('readDirWithStats', () => {
    it('returns FileEntry array with stats for each entry', async () => {
      await writeFile(join(tempDir, 'hello.txt'), 'world');
      await mkdir(join(tempDir, 'subdir'));

      const entries = await service.readDirWithStats(tempDir);
      expect(entries).toHaveLength(2);

      const file = entries.find(e => e.name === 'hello.txt');
      expect(file).toBeDefined();
      expect(file!.type).toBe('file');
      expect(file!.size).toBeGreaterThan(0);
      expect(file!.isHidden).toBe(false);

      const dir = entries.find(e => e.name === 'subdir');
      expect(dir).toBeDefined();
      expect(dir!.type).toBe('directory');
    });

    it('marks dotfiles as hidden', async () => {
      await writeFile(join(tempDir, '.hidden'), '');
      const entries = await service.readDirWithStats(tempDir);
      expect(entries[0].isHidden).toBe(true);
    });
  });

  describe('stat', () => {
    it('returns FileEntry for a file', async () => {
      const filePath = join(tempDir, 'test.txt');
      await writeFile(filePath, 'content');
      const entry = await service.stat(filePath);
      expect(entry.name).toBe('test.txt');
      expect(entry.type).toBe('file');
      expect(entry.path).toBe(filePath);
    });

    it('returns FileEntry for a directory', async () => {
      const entry = await service.stat(tempDir);
      expect(entry.type).toBe('directory');
    });
  });

  describe('createFile', () => {
    it('creates a new file with optional content', async () => {
      const filePath = join(tempDir, 'new.txt');
      await service.createFile(filePath, 'hello');
      const exists = await service.exists(filePath);
      expect(exists).toBe(true);
      const content = await service.readFile(filePath);
      expect(content).toBe('hello');
    });

    it('creates an empty file when no content provided', async () => {
      const filePath = join(tempDir, 'empty.txt');
      await service.createFile(filePath);
      const content = await service.readFile(filePath);
      expect(content).toBe('');
    });
  });

  describe('createDir', () => {
    it('creates a new directory', async () => {
      const dirPath = join(tempDir, 'newdir');
      await service.createDir(dirPath);
      const entry = await service.stat(dirPath);
      expect(entry.type).toBe('directory');
    });
  });

  describe('rename', () => {
    it('renames a file', async () => {
      const oldPath = join(tempDir, 'old.txt');
      const newPath = join(tempDir, 'new.txt');
      await writeFile(oldPath, 'data');
      await service.rename(oldPath, newPath);
      expect(await service.exists(oldPath)).toBe(false);
      expect(await service.exists(newPath)).toBe(true);
    });
  });

  describe('delete', () => {
    it('deletes a file', async () => {
      const filePath = join(tempDir, 'doomed.txt');
      await writeFile(filePath, '');
      await service.delete(filePath);
      expect(await service.exists(filePath)).toBe(false);
    });

    it('deletes a directory recursively', async () => {
      const dirPath = join(tempDir, 'doomed');
      await mkdir(dirPath);
      await writeFile(join(dirPath, 'child.txt'), '');
      await service.delete(dirPath);
      expect(await service.exists(dirPath)).toBe(false);
    });
  });

  describe('watch', () => {
    it('emits FileChangeEvent when a file is created', async () => {
      const events: Array<{ type: string; path: string }> = [];
      const listener = service.onDidChangeFile(e => events.push(e));

      const watcher = await service.watch(tempDir);
      await new Promise(r => setTimeout(r, 100));

      await writeFile(join(tempDir, 'watched.txt'), 'hello');
      await new Promise(r => setTimeout(r, 500));

      expect(events.length).toBeGreaterThan(0);
      const createEvent = events.find(e => e.path.includes('watched.txt'));
      expect(createEvent).toBeDefined();

      watcher.dispose();
      listener.dispose();
    });
  });
});
