import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { InstructionResolver } from './instructionResolver.js';

describe('InstructionResolver', () => {
  let tmpDir: string;
  let userDir: string;
  let projectDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'instr-test-'));
    userDir = path.join(tmpDir, 'user');
    projectDir = path.join(tmpDir, 'project');
    fs.mkdirSync(userDir, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty when no files exist', async () => {
    const resolver = new InstructionResolver(userDir, [projectDir]);
    const result = await resolver.resolve();
    expect(result.content).toBe('');
    expect(result.sources).toHaveLength(0);
  });

  it('discovers GHO.md in user dir', async () => {
    fs.writeFileSync(path.join(userDir, 'GHO.md'), '# My Instructions');
    const resolver = new InstructionResolver(userDir, []);
    const result = await resolver.resolve();
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].origin).toBe('user');
    expect(result.sources[0].format).toBe('gho');
    expect(result.content).toContain('# My Instructions');
    expect(result.content).toContain('<!-- User instructions');
  });

  it('discovers files in priority order within project dir', async () => {
    fs.writeFileSync(path.join(projectDir, 'GHO.md'), 'gho content');
    fs.writeFileSync(path.join(projectDir, 'CLAUDE.md'), 'claude content');
    fs.writeFileSync(path.join(projectDir, '.cursorrules'), 'cursor content');

    const resolver = new InstructionResolver(userDir, [projectDir]);
    const result = await resolver.resolve();
    expect(result.sources).toHaveLength(3);
    expect(result.sources[0].format).toBe('gho');
    expect(result.sources[1].format).toBe('claude');
    expect(result.sources[2].format).toBe('cursor');
  });

  it('discovers copilot-instructions.md in .github subdir', async () => {
    const ghDir = path.join(projectDir, '.github');
    fs.mkdirSync(ghDir, { recursive: true });
    fs.writeFileSync(path.join(ghDir, 'copilot-instructions.md'), 'copilot content');

    const resolver = new InstructionResolver(userDir, [projectDir]);
    const result = await resolver.resolve();
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].format).toBe('copilot');
    expect(result.content).toContain('copilot content');
  });

  it('user instructions come before project instructions', async () => {
    fs.writeFileSync(path.join(userDir, 'GHO.md'), 'user first');
    fs.writeFileSync(path.join(projectDir, 'CLAUDE.md'), 'project second');

    const resolver = new InstructionResolver(userDir, [projectDir]);
    const result = await resolver.resolve();
    expect(result.sources).toHaveLength(2);
    expect(result.sources[0].origin).toBe('user');
    expect(result.sources[1].origin).toBe('project');
    const userIdx = result.content.indexOf('user first');
    const projIdx = result.content.indexOf('project second');
    expect(userIdx).toBeLessThan(projIdx);
  });

  it('merges files from multiple project dirs', async () => {
    const proj2 = path.join(tmpDir, 'project2');
    fs.mkdirSync(proj2, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'GHO.md'), 'proj1');
    fs.writeFileSync(path.join(proj2, 'CLAUDE.md'), 'proj2');

    const resolver = new InstructionResolver(userDir, [projectDir, proj2]);
    const result = await resolver.resolve();
    expect(result.sources).toHaveLength(2);
    expect(result.content).toContain('proj1');
    expect(result.content).toContain('proj2');
  });

  it('truncates files over 50KB', async () => {
    const bigContent = 'x'.repeat(60 * 1024);
    fs.writeFileSync(path.join(userDir, 'GHO.md'), bigContent);

    const resolver = new InstructionResolver(userDir, []);
    const result = await resolver.resolve();
    expect(result.sources).toHaveLength(1);
    expect(result.content).toContain('[Instructions truncated');
    // The actual content portion should be <= 50KB + the comment wrapper
    expect(result.content.length).toBeLessThan(55 * 1024);
  });
});
