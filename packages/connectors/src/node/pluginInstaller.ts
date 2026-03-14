import * as path from 'node:path';
import * as fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CatalogEntry } from '@gho-work/base/common';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MCPServerInlineConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface PluginManifest {
  name: string;
  version?: string;
  description?: string;
  skills?: string | string[];
  mcpServers?: string | Record<string, MCPServerInlineConfig>;
}

// ---------------------------------------------------------------------------
// PluginInstaller
// ---------------------------------------------------------------------------

/**
 * Handles the mechanics of downloading and caching plugins from various sources.
 *
 * Responsibilities:
 * - Clone plugins from git repositories (sparse clone, shallow clone)
 * - Parse plugin manifests (.claude-plugin/plugin.json)
 * - Count skill files
 * - Manage cache directories
 *
 * Does NOT manage plugin state — that is PluginService's responsibility.
 */
export class PluginInstaller {
  private readonly _cacheDir: string;

  constructor(cacheDir: string) {
    this._cacheDir = cacheDir;
  }

  // -------------------------------------------------------------------------
  // Cache paths
  // -------------------------------------------------------------------------

  /**
   * Returns the cache path for a specific plugin version.
   * Pattern: `<cacheDir>/<name>/<version>`
   */
  getCachePath(name: string, version: string): string {
    return path.join(this._cacheDir, name, version);
  }

  // -------------------------------------------------------------------------
  // Git operations
  // -------------------------------------------------------------------------

  /**
   * Verifies that git is available on the system PATH.
   * Throws a user-friendly error if git is not found.
   */
  async checkGitAvailable(): Promise<void> {
    try {
      await execFileAsync('git', ['--version']);
    } catch (err) {
      throw new Error(
        'git is required to install plugins but was not found on your PATH. ' +
          'Please install git from https://git-scm.com and try again.',
        { cause: err },
      );
    }
  }

  /**
   * Clones a plugin from its catalog entry location into the specified destination path.
   * Dispatches to the appropriate clone strategy based on the location type.
   */
  async clonePlugin(entry: CatalogEntry, destPath: string): Promise<void> {
    const location = entry.location;

    if (typeof location === 'string') {
      // Treat bare string location as a URL — shallow clone
      await this._shallowClone(location, destPath);
      return;
    }

    switch (location.type) {
      case 'git-subdir':
        await this._sparseClone(location.url, location.path, destPath, location.ref);
        break;

      case 'github':
        await this._shallowClone(
          `https://github.com/${location.repo}.git`,
          destPath,
          location.ref,
        );
        break;

      case 'url':
        await this._shallowClone(location.url, destPath, location.ref);
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Manifest parsing
  // -------------------------------------------------------------------------

  /**
   * Reads and parses the plugin manifest from `.claude-plugin/plugin.json`.
   *
   * If no manifest exists, auto-discovers:
   * - `skills/` directory → sets `skills: 'skills/'`
   * - `.mcp.json` file → sets `mcpServers: '.mcp.json'`
   *
   * Falls back to defaults using the directory basename as the plugin name.
   */
  async parseManifest(pluginDir: string): Promise<PluginManifest> {
    const manifestPath = path.join(pluginDir, '.claude-plugin', 'plugin.json');

    if (fs.existsSync(manifestPath)) {
      const raw = fs.readFileSync(manifestPath, 'utf8');
      const parsed = JSON.parse(raw) as PluginManifest;
      return parsed;
    }

    // Auto-discover from directory structure
    const name = path.basename(pluginDir);
    const manifest: PluginManifest = { name };

    const skillsDir = path.join(pluginDir, 'skills');
    if (fs.existsSync(skillsDir) && fs.statSync(skillsDir).isDirectory()) {
      manifest.skills = 'skills/';
    }

    const mcpJsonPath = path.join(pluginDir, '.mcp.json');
    if (fs.existsSync(mcpJsonPath)) {
      manifest.mcpServers = '.mcp.json';
    }

    return manifest;
  }

  /**
   * Parses the `mcpServers` field from a plugin manifest.
   *
   * Handles:
   * - `undefined` → returns empty map
   * - `string` → treats as a file path relative to pluginDir, reads and parses the file
   * - `Record<string, MCPServerInlineConfig>` → returns the inline config as a map
   */
  async parseMcpServers(
    pluginDir: string,
    mcpServers: string | Record<string, MCPServerInlineConfig> | undefined,
  ): Promise<Map<string, MCPServerInlineConfig>> {
    if (mcpServers === undefined) {
      return new Map();
    }

    if (typeof mcpServers === 'string') {
      const filePath = path.join(pluginDir, mcpServers);
      if (!fs.existsSync(filePath)) {
        console.warn(`parseMcpServers: file not found at ${filePath}, returning empty map`);
        return new Map();
      }
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw) as { mcpServers?: Record<string, MCPServerInlineConfig> };
        if (!parsed.mcpServers) {
          return new Map();
        }
        return new Map(Object.entries(parsed.mcpServers));
      } catch (err) {
        console.warn(`parseMcpServers: failed to parse ${filePath}:`, err);
        return new Map();
      }
    }

    // Inline Record config
    return new Map(Object.entries(mcpServers));
  }

  // -------------------------------------------------------------------------
  // Skill counting
  // -------------------------------------------------------------------------

  /**
   * Counts the number of skill files (.md) in the plugin's skill directories.
   *
   * If `skillPaths` is specified, counts .md files in those directories (relative to pluginDir).
   * Otherwise, defaults to looking in the `skills/` directory.
   */
  async countSkills(pluginDir: string, skillPaths?: string | string[]): Promise<number> {
    const dirs = this._resolveSkillDirs(pluginDir, skillPaths);
    let count = 0;

    for (const dir of dirs) {
      count += this._countMdFilesRecursive(dir);
    }

    return count;
  }

  // -------------------------------------------------------------------------
  // Cache management
  // -------------------------------------------------------------------------

  /**
   * Removes the cache directory for a specific plugin version.
   * Also removes the parent directory if it becomes empty.
   */
  async deleteCache(name: string, version: string): Promise<void> {
    const versionDir = this.getCachePath(name, version);
    if (!fs.existsSync(versionDir)) {
      return;
    }

    fs.rmSync(versionDir, { recursive: true, force: true });

    // Remove parent if it's now empty
    const parentDir = path.dirname(versionDir);
    if (fs.existsSync(parentDir)) {
      const remaining = fs.readdirSync(parentDir);
      if (remaining.length === 0) {
        fs.rmdirSync(parentDir);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Performs a shallow clone (depth=1) of a git repository.
   */
  private async _shallowClone(url: string, destPath: string, ref?: string): Promise<void> {
    const args = ['clone', '--depth', '1'];
    if (ref !== undefined) {
      args.push('--branch', ref);
    }
    args.push(url, destPath);
    await execFileAsync('git', args);
  }

  /**
   * Performs a sparse clone of a subdirectory within a git repository.
   *
   * Uses git sparse-checkout to only fetch the files needed for the specified subPath.
   */
  private async _sparseClone(
    repoUrl: string,
    subPath: string,
    destPath: string,
    ref?: string,
  ): Promise<void> {
    const cloneArgs = ['clone', '--filter=blob:none', '--no-checkout', '--depth', '1'];
    if (ref !== undefined) {
      cloneArgs.push('--branch', ref);
    }
    cloneArgs.push(repoUrl, destPath);
    await execFileAsync('git', cloneArgs);

    await execFileAsync('git', ['-C', destPath, 'sparse-checkout', 'set', subPath]);
    await execFileAsync('git', ['-C', destPath, 'checkout']);
  }

  /**
   * Resolves the list of skill directories to search.
   */
  private _resolveSkillDirs(pluginDir: string, skillPaths?: string | string[]): string[] {
    if (skillPaths === undefined) {
      return [path.join(pluginDir, 'skills')];
    }

    const paths = Array.isArray(skillPaths) ? skillPaths : [skillPaths];
    return paths.map((p) => path.join(pluginDir, p.replace(/\/$/, '')));
  }

  /**
   * Counts .md files recursively in a directory.
   * Returns 0 if the directory does not exist.
   */
  private _countMdFilesRecursive(dir: string): number {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      return 0;
    }

    let count = 0;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        count += this._countMdFilesRecursive(path.join(dir, entry.name));
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        count++;
      }
    }

    return count;
  }
}
