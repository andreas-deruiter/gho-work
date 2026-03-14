import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { PluginInstaller } from '../node/pluginInstaller.js';
import type { CatalogEntry } from '@gho-work/base';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-installer-test-'));
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function makeCatalogEntry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    name: 'test-plugin',
    description: 'A test plugin',
    version: '1.0.0',
    location: { type: 'github', repo: 'owner/test-plugin' },
    hasSkills: false,
    hasMcpServers: false,
    hasCommands: false,
    hasAgents: false,
    hasHooks: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PluginInstaller', () => {
  let tempDir: string;
  let installer: PluginInstaller;

  beforeEach(() => {
    tempDir = makeTempDir();
    installer = new PluginInstaller(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // getCachePath
  // -------------------------------------------------------------------------

  describe('getCachePath', () => {
    it('returns cacheDir/name/version', () => {
      const result = installer.getCachePath('my-plugin', '1.2.3');
      expect(result).toBe(path.join(tempDir, 'my-plugin', '1.2.3'));
    });

    it('handles names with special characters', () => {
      const result = installer.getCachePath('@scope/my-plugin', '0.0.1');
      expect(result).toBe(path.join(tempDir, '@scope/my-plugin', '0.0.1'));
    });
  });

  // -------------------------------------------------------------------------
  // parseManifest
  // -------------------------------------------------------------------------

  describe('parseManifest', () => {
    it('parses a valid .claude-plugin/plugin.json', async () => {
      const pluginDir = path.join(tempDir, 'plugin');
      writeFile(
        path.join(pluginDir, '.claude-plugin', 'plugin.json'),
        JSON.stringify({
          name: 'sentry',
          version: '1.2.0',
          description: 'Fix production issues with Sentry error context.',
          skills: 'skills/',
          mcpServers: { 'sentry-server': { command: 'npx', args: ['-y', 'sentry-mcp'] } },
        }),
      );

      const manifest = await installer.parseManifest(pluginDir);
      expect(manifest.name).toBe('sentry');
      expect(manifest.version).toBe('1.2.0');
      expect(manifest.description).toBe('Fix production issues with Sentry error context.');
      expect(manifest.skills).toBe('skills/');
      expect(manifest.mcpServers).toEqual({
        'sentry-server': { command: 'npx', args: ['-y', 'sentry-mcp'] },
      });
    });

    it('auto-discovers skills/ directory when no manifest exists', async () => {
      const pluginDir = path.join(tempDir, 'plugin-no-manifest');
      fs.mkdirSync(path.join(pluginDir, 'skills'), { recursive: true });
      writeFile(path.join(pluginDir, 'skills', 'SKILL.md'), '---\ndescription: A skill\n---\n');

      const manifest = await installer.parseManifest(pluginDir);
      expect(manifest.skills).toBeDefined();
    });

    it('auto-discovers .mcp.json file when no manifest exists', async () => {
      const pluginDir = path.join(tempDir, 'plugin-mcp-only');
      fs.mkdirSync(pluginDir, { recursive: true });
      writeFile(
        path.join(pluginDir, '.mcp.json'),
        JSON.stringify({
          mcpServers: { 'my-server': { command: 'node', args: ['server.js'] } },
        }),
      );

      const manifest = await installer.parseManifest(pluginDir);
      expect(manifest.mcpServers).toBe('.mcp.json');
    });

    it('returns defaults when no manifest and no skills/ or .mcp.json present', async () => {
      const pluginDir = path.join(tempDir, 'empty-plugin');
      fs.mkdirSync(pluginDir, { recursive: true });

      const manifest = await installer.parseManifest(pluginDir);
      expect(manifest.name).toBe('empty-plugin');
      expect(manifest.skills).toBeUndefined();
      expect(manifest.mcpServers).toBeUndefined();
    });

    it('auto-discovers commands/ directory when no manifest exists', async () => {
      const pluginDir = path.join(tempDir, 'plugin-with-commands');
      fs.mkdirSync(path.join(pluginDir, 'commands'), { recursive: true });
      fs.writeFileSync(path.join(pluginDir, 'commands', 'draft.md'), '# Draft');

      const manifest = await installer.parseManifest(pluginDir);
      expect(manifest.commands).toBe('commands/');
    });

    it('auto-discovers both skills/ and .mcp.json when present', async () => {
      const pluginDir = path.join(tempDir, 'full-plugin');
      fs.mkdirSync(path.join(pluginDir, 'skills'), { recursive: true });
      writeFile(path.join(pluginDir, 'skills', 'SKILL.md'), '---\ndescription: A skill\n---\n');
      writeFile(
        path.join(pluginDir, '.mcp.json'),
        JSON.stringify({ mcpServers: {} }),
      );

      const manifest = await installer.parseManifest(pluginDir);
      expect(manifest.skills).toBeDefined();
      expect(manifest.mcpServers).toBe('.mcp.json');
    });
  });

  // -------------------------------------------------------------------------
  // parseMcpServers
  // -------------------------------------------------------------------------

  describe('parseMcpServers', () => {
    it('returns empty map when mcpServers is undefined', async () => {
      const pluginDir = path.join(tempDir, 'plugin');
      fs.mkdirSync(pluginDir, { recursive: true });

      const result = await installer.parseMcpServers(pluginDir, undefined);
      expect(result.size).toBe(0);
    });

    it('parses inline Record config', async () => {
      const pluginDir = path.join(tempDir, 'plugin');
      fs.mkdirSync(pluginDir, { recursive: true });

      const result = await installer.parseMcpServers(pluginDir, {
        'my-server': { command: 'npx', args: ['-y', 'my-mcp'] },
        'another-server': { command: 'node', args: ['server.js'], env: { PORT: '3000' } },
      });

      expect(result.size).toBe(2);
      expect(result.get('my-server')).toEqual({ command: 'npx', args: ['-y', 'my-mcp'] });
      expect(result.get('another-server')).toEqual({
        command: 'node',
        args: ['server.js'],
        env: { PORT: '3000' },
      });
    });

    it('parses .mcp.json file path (string config)', async () => {
      const pluginDir = path.join(tempDir, 'plugin-mcp-file');
      fs.mkdirSync(pluginDir, { recursive: true });
      writeFile(
        path.join(pluginDir, '.mcp.json'),
        JSON.stringify({
          mcpServers: {
            'file-server': { command: 'npx', args: ['-y', 'file-mcp'] },
          },
        }),
      );

      const result = await installer.parseMcpServers(pluginDir, '.mcp.json');
      expect(result.size).toBe(1);
      expect(result.get('file-server')).toEqual({ command: 'npx', args: ['-y', 'file-mcp'] });
    });

    it('returns empty map when .mcp.json file is missing', async () => {
      const pluginDir = path.join(tempDir, 'plugin-missing-mcp');
      fs.mkdirSync(pluginDir, { recursive: true });

      const result = await installer.parseMcpServers(pluginDir, '.mcp.json');
      expect(result.size).toBe(0);
    });

    it('returns empty map when .mcp.json has no mcpServers key', async () => {
      const pluginDir = path.join(tempDir, 'plugin-empty-mcp');
      fs.mkdirSync(pluginDir, { recursive: true });
      writeFile(path.join(pluginDir, '.mcp.json'), JSON.stringify({}));

      const result = await installer.parseMcpServers(pluginDir, '.mcp.json');
      expect(result.size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // countSkills
  // -------------------------------------------------------------------------

  describe('countSkills', () => {
    it('counts .md files in a skills/ directory', async () => {
      const pluginDir = path.join(tempDir, 'skill-plugin');
      writeFile(path.join(pluginDir, 'skills', 'skill-a.md'), '# Skill A\n');
      writeFile(path.join(pluginDir, 'skills', 'skill-b.md'), '# Skill B\n');

      const count = await installer.countSkills(pluginDir);
      expect(count).toBe(2);
    });

    it('counts .md files when skillPaths is specified as a string', async () => {
      const pluginDir = path.join(tempDir, 'skill-plugin-path');
      writeFile(path.join(pluginDir, 'custom-skills', 'skill-1.md'), '# Skill 1\n');
      writeFile(path.join(pluginDir, 'custom-skills', 'skill-2.md'), '# Skill 2\n');
      writeFile(path.join(pluginDir, 'custom-skills', 'skill-3.md'), '# Skill 3\n');

      const count = await installer.countSkills(pluginDir, 'custom-skills/');
      expect(count).toBe(3);
    });

    it('counts .md files when skillPaths is an array', async () => {
      const pluginDir = path.join(tempDir, 'skill-plugin-array');
      writeFile(path.join(pluginDir, 'skills-a', 'skill-a.md'), '# Skill A\n');
      writeFile(path.join(pluginDir, 'skills-b', 'skill-b.md'), '# Skill B\n');
      writeFile(path.join(pluginDir, 'skills-b', 'skill-c.md'), '# Skill C\n');

      const count = await installer.countSkills(pluginDir, ['skills-a/', 'skills-b/']);
      expect(count).toBe(3);
    });

    it('returns 0 when skills/ directory does not exist', async () => {
      const pluginDir = path.join(tempDir, 'no-skill-plugin');
      fs.mkdirSync(pluginDir, { recursive: true });

      const count = await installer.countSkills(pluginDir);
      expect(count).toBe(0);
    });

    it('returns 0 when specified skillPaths directory does not exist', async () => {
      const pluginDir = path.join(tempDir, 'missing-skill-dir');
      fs.mkdirSync(pluginDir, { recursive: true });

      const count = await installer.countSkills(pluginDir, 'nonexistent/');
      expect(count).toBe(0);
    });

    it('counts SKILL.md files in subdirectories', async () => {
      const pluginDir = path.join(tempDir, 'subdir-skills');
      writeFile(path.join(pluginDir, 'skills', 'tool-a', 'SKILL.md'), '# Tool A\n');
      writeFile(path.join(pluginDir, 'skills', 'tool-b', 'SKILL.md'), '# Tool B\n');
      writeFile(path.join(pluginDir, 'skills', 'readme.md'), '# Skills\n');

      const count = await installer.countSkills(pluginDir);
      expect(count).toBeGreaterThanOrEqual(2);
    });

    it('does not count non-.md files', async () => {
      const pluginDir = path.join(tempDir, 'mixed-skills');
      writeFile(path.join(pluginDir, 'skills', 'skill.md'), '# Skill\n');
      writeFile(path.join(pluginDir, 'skills', 'not-a-skill.ts'), 'export {};');
      writeFile(path.join(pluginDir, 'skills', 'not-a-skill.json'), '{}');

      const count = await installer.countSkills(pluginDir);
      expect(count).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // countCommands
  // -------------------------------------------------------------------------

  describe('countCommands', () => {
    it('counts .md files in commands directory', async () => {
      const pluginDir = path.join(tempDir, 'cmd-plugin');
      const cmdDir = path.join(pluginDir, 'commands');
      fs.mkdirSync(cmdDir, { recursive: true });
      fs.writeFileSync(path.join(cmdDir, 'draft.md'), '# Draft');
      fs.writeFileSync(path.join(cmdDir, 'review.md'), '# Review');
      const count = await installer.countCommands(pluginDir);
      expect(count).toBe(2);
    });

    it('returns 0 when no commands directory', async () => {
      const pluginDir = path.join(tempDir, 'no-cmd');
      fs.mkdirSync(pluginDir, { recursive: true });
      const count = await installer.countCommands(pluginDir);
      expect(count).toBe(0);
    });

    it('counts .md files when commandPaths is specified as a string', async () => {
      const pluginDir = path.join(tempDir, 'custom-cmd-plugin');
      const cmdDir = path.join(pluginDir, 'slash-commands');
      fs.mkdirSync(cmdDir, { recursive: true });
      fs.writeFileSync(path.join(cmdDir, 'fix.md'), '# Fix');
      const count = await installer.countCommands(pluginDir, 'slash-commands/');
      expect(count).toBe(1);
    });

    it('does not count non-.md files', async () => {
      const pluginDir = path.join(tempDir, 'mixed-cmd-plugin');
      const cmdDir = path.join(pluginDir, 'commands');
      fs.mkdirSync(cmdDir, { recursive: true });
      fs.writeFileSync(path.join(cmdDir, 'cmd.md'), '# Cmd');
      fs.writeFileSync(path.join(cmdDir, 'cmd.ts'), 'export {};');
      const count = await installer.countCommands(pluginDir);
      expect(count).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // checkGitAvailable
  // -------------------------------------------------------------------------

  describe('checkGitAvailable', () => {
    it('does not throw when git is available', async () => {
      await expect(installer.checkGitAvailable()).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // deleteCache
  // -------------------------------------------------------------------------

  describe('deleteCache', () => {
    it('removes the cache directory for a plugin version', async () => {
      const pluginCacheDir = path.join(tempDir, 'my-plugin', '1.0.0');
      fs.mkdirSync(pluginCacheDir, { recursive: true });
      writeFile(path.join(pluginCacheDir, 'file.txt'), 'content');

      await installer.deleteCache('my-plugin', '1.0.0');

      expect(fs.existsSync(pluginCacheDir)).toBe(false);
    });

    it('removes empty parent directory after deleting version cache', async () => {
      const pluginCacheDir = path.join(tempDir, 'my-plugin', '1.0.0');
      fs.mkdirSync(pluginCacheDir, { recursive: true });

      await installer.deleteCache('my-plugin', '1.0.0');

      expect(fs.existsSync(path.join(tempDir, 'my-plugin'))).toBe(false);
    });

    it('does not remove parent directory if other versions remain', async () => {
      const v1Dir = path.join(tempDir, 'my-plugin', '1.0.0');
      const v2Dir = path.join(tempDir, 'my-plugin', '2.0.0');
      fs.mkdirSync(v1Dir, { recursive: true });
      fs.mkdirSync(v2Dir, { recursive: true });

      await installer.deleteCache('my-plugin', '1.0.0');

      expect(fs.existsSync(path.join(tempDir, 'my-plugin'))).toBe(true);
      expect(fs.existsSync(v2Dir)).toBe(true);
    });

    it('does not throw when cache directory does not exist', async () => {
      await expect(installer.deleteCache('nonexistent', '1.0.0')).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // installNpm
  // -------------------------------------------------------------------------

  describe('installNpm', () => {
    // _run is a protected method on PluginInstaller; cast to access it for spying.
    type InstallerWithRun = PluginInstaller & {
      _run(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }>;
    };

    /**
     * Sets up a vi.spyOn on installer._run.
     * The mock creates node_modules/<packageName> inside the tmpDir
     * (extracted from the '--prefix' arg) to simulate what npm would do.
     */
    function mockRunForNpm(
      packageName: string,
      extraFiles?: Record<string, string>,
      captureArgs?: string[],
    ) {
      return vi
        .spyOn(installer as InstallerWithRun, '_run')
        .mockImplementation(async (_cmd: string, args: string[]) => {
          if (captureArgs) {
            captureArgs.push(...args);
          }
          const prefixIdx = args.indexOf('--prefix');
          if (prefixIdx !== -1) {
            const dir = args[prefixIdx + 1];
            const pkgDir = path.join(dir, 'node_modules', ...packageName.split('/'));
            fs.mkdirSync(pkgDir, { recursive: true });
            fs.writeFileSync(path.join(pkgDir, 'index.js'), 'module.exports = {};');
            if (extraFiles) {
              for (const [name, content] of Object.entries(extraFiles)) {
                fs.writeFileSync(path.join(pkgDir, name), content);
              }
            }
          }
          return { stdout: '', stderr: '' };
        });
    }

    it('installs npm package to dest path', async () => {
      const destPath = path.join(tempDir, 'install-dest');
      const spy = mockRunForNpm('my-plugin');

      await installer.installNpm('my-plugin', destPath);

      expect(spy).toHaveBeenCalledOnce();
      expect(fs.existsSync(destPath)).toBe(true);
      expect(fs.existsSync(path.join(destPath, 'index.js'))).toBe(true);
      spy.mockRestore();
    });

    it('supports scoped packages', async () => {
      const destPath = path.join(tempDir, 'scoped-dest');
      const spy = mockRunForNpm('@scope/plugin', {
        'package.json': JSON.stringify({ name: '@scope/plugin' }),
      });

      await installer.installNpm('@scope/plugin', destPath);

      expect(spy).toHaveBeenCalledOnce();
      expect(fs.existsSync(destPath)).toBe(true);
      expect(fs.existsSync(path.join(destPath, 'package.json'))).toBe(true);
      spy.mockRestore();
    });

    it('passes version and registry when specified', async () => {
      const destPath = path.join(tempDir, 'versioned-dest');
      const capturedArgs: string[] = [];
      const spy = mockRunForNpm('my-plugin', undefined, capturedArgs);

      await installer.installNpm('my-plugin', destPath, '2.0.0', 'https://registry.example.com');

      expect(capturedArgs).toContain('my-plugin@2.0.0');
      expect(capturedArgs).toContain('--registry');
      expect(capturedArgs).toContain('https://registry.example.com');
      spy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // clonePlugin — npm location type
  // -------------------------------------------------------------------------

  describe('clonePlugin (npm)', () => {
    it('dispatches to installNpm for npm location type', async () => {
      const destPath = path.join(tempDir, 'npm-clone-dest');
      const installNpmSpy = vi.spyOn(installer, 'installNpm').mockResolvedValue(undefined);

      const entry = makeCatalogEntry({
        location: { type: 'npm', package: 'my-npm-plugin', version: '1.0.0' },
      });

      await installer.clonePlugin(entry, destPath);

      expect(installNpmSpy).toHaveBeenCalledOnce();
      expect(installNpmSpy).toHaveBeenCalledWith('my-npm-plugin', destPath, '1.0.0', undefined);
      installNpmSpy.mockRestore();
    });
  });
});
