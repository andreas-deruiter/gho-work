import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeFileService } from '../node/fileService.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('NodeFileService', () => {
  let service: NodeFileService;
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'gho-test-'));
    service = new NodeFileService();
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should read a file', async () => {
    const filePath = join(testDir, 'test.txt');
    writeFileSync(filePath, 'hello world');
    const content = await service.readFile(filePath);
    expect(content).toBe('hello world');
  });

  it('should write a file', async () => {
    const filePath = join(testDir, 'output.txt');
    await service.writeFile(filePath, 'test content');
    const content = await service.readFile(filePath);
    expect(content).toBe('test content');
  });

  it('should check if file exists', async () => {
    const filePath = join(testDir, 'exists.txt');
    expect(await service.exists(filePath)).toBe(false);
    writeFileSync(filePath, '');
    expect(await service.exists(filePath)).toBe(true);
  });
});
