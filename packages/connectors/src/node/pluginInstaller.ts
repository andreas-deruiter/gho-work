import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CatalogEntry, PluginAgentDefinition } from '@gho-work/base';

// Module-level async wrapper (promisified execFile).
// All class calls go through this._run() so tests can spy on the instance method.
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
  agents?: string | string[];
  commands?: string | string[];
  hooks?: string | Record<string, unknown>;
  settings?: Record<string, unknown>;
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
 * - Install plugins from npm packages
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
      await this._run('git', ['--version']);
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
      case 'npm':
        await this.installNpm(location.package, destPath, location.version, location.registry);
        break;

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

  /**
   * Install a plugin from npm.
   * Downloads the package to a temp dir, then copies plugin root to destPath.
   */
  async installNpm(
    packageName: string,
    destPath: string,
    version?: string,
    registry?: string,
  ): Promise<void> {
    const tmpDir = path.join(os.tmpdir(), `gho-npm-${Date.now()}`);
    try {
      await fs.promises.mkdir(tmpDir, { recursive: true });
      const args = [
        'install',
        '--prefix',
        tmpDir,
        version ? `${packageName}@${version}` : packageName,
      ];
      if (registry) {
        args.push('--registry', registry);
      }
      await this._run('npm', args);

      // Find the installed package in node_modules
      const pkgDir = path.join(tmpDir, 'node_modules', packageName);
      if (!fs.existsSync(pkgDir)) {
        throw new Error(`npm install succeeded but package not found at ${pkgDir}`);
      }

      // Copy to destination
      await fs.promises.cp(pkgDir, destPath, { recursive: true });
    } finally {
      await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
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

    let manifest: PluginManifest;

    if (fs.existsSync(manifestPath)) {
      const raw = fs.readFileSync(manifestPath, 'utf8');
      manifest = JSON.parse(raw) as PluginManifest;
    } else {
      manifest = { name: path.basename(pluginDir) };
    }

    // Auto-discover fields not declared in the manifest
    if (manifest.skills === undefined) {
      const skillsDir = path.join(pluginDir, 'skills');
      if (fs.existsSync(skillsDir) && fs.statSync(skillsDir).isDirectory()) {
        manifest.skills = 'skills/';
      }
    }

    if (manifest.agents === undefined) {
      const agentsDir = path.join(pluginDir, 'agents');
      if (fs.existsSync(agentsDir) && fs.statSync(agentsDir).isDirectory()) {
        manifest.agents = 'agents/';
      }
    }

    if (manifest.commands === undefined) {
      const commandsDir = path.join(pluginDir, 'commands');
      if (fs.existsSync(commandsDir) && fs.statSync(commandsDir).isDirectory()) {
        manifest.commands = 'commands/';
      }
    }

    if (manifest.mcpServers === undefined) {
      const mcpJsonPath = path.join(pluginDir, '.mcp.json');
      if (fs.existsSync(mcpJsonPath)) {
        manifest.mcpServers = '.mcp.json';
      }
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
    const dirs = this._resolveDirs(pluginDir, skillPaths, 'skills');
    return dirs.reduce((sum, dir) => sum + this._countMdFilesRecursive(dir), 0);
  }

  /**
   * Counts the number of agent files (.md) in the plugin's agent directories.
   *
   * If `agentPaths` is specified, counts .md files in those directories (relative to pluginDir).
   * Otherwise, defaults to looking in the `agents/` directory.
   */
  async countAgents(pluginDir: string, agentPaths?: string | string[]): Promise<number> {
    const dirs = this._resolveDirs(pluginDir, agentPaths, 'agents');
    return dirs.reduce((sum, dir) => sum + this._countMdFilesRecursive(dir), 0);
  }

  /**
   * Counts the number of command files (.md) in the plugin's command directories.
   *
   * If `commandPaths` is specified, counts .md files in those directories (relative to pluginDir).
   * Otherwise, defaults to looking in the `commands/` directory.
   */
  async countCommands(pluginDir: string, commandPaths?: string | string[]): Promise<number> {
    const dirs = this._resolveDirs(pluginDir, commandPaths, 'commands');
    return dirs.reduce((sum, dir) => sum + this._countMdFilesRecursive(dir), 0);
  }

  // -------------------------------------------------------------------------
  // Agent parsing
  // -------------------------------------------------------------------------

  /**
   * Parses agent `.md` files from the plugin's agent directories.
   *
   * Each file may have YAML frontmatter between `---` delimiters.
   * Recognised frontmatter fields: `name`, `description`, `model`, `allowed-tools` / `allowedTools`.
   * The body (after the closing `---`) becomes the system prompt.
   *
   * Returns an empty array when no agent directories are found.
   */
  async parseAgentFiles(
    pluginDir: string,
    pluginName: string,
    agentPaths?: string | string[],
  ): Promise<PluginAgentDefinition[]> {
    const dirs = this._resolveDirs(pluginDir, agentPaths, 'agents');
    const agents: PluginAgentDefinition[] = [];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) { continue; }
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(dir, file), 'utf-8');
        const { frontmatter, body } = this._parseFrontmatter(content);
        const name = frontmatter['name'] ?? path.basename(file, '.md');
        agents.push({
          id: `${pluginName}:${name}`,
          name,
          description: frontmatter['description'] ?? '',
          systemPrompt: body.trim(),
          pluginName,
          model: frontmatter['model'],
          allowedTools:
            frontmatter['allowed-tools'] !== undefined
              ? frontmatter['allowed-tools'].split(',').map((s) => s.trim())
              : frontmatter['allowedTools'] !== undefined
                ? frontmatter['allowedTools'].split(',').map((s) => s.trim())
                : undefined,
        });
      }
    }
    return agents;
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
  // Protected helpers (overridable in tests)
  // -------------------------------------------------------------------------

  /**
   * Thin wrapper around the module-level execFileAsync.
   * Exposed as a protected method so tests can spy on it via vi.spyOn(installer, '_run')
   * without needing to mock ESM native module namespaces.
   */
  protected _run(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync(cmd, args);
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
    await this._run('git', args);
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
    await this._run('git', cloneArgs);

    await this._run('git', ['-C', destPath, 'sparse-checkout', 'set', subPath]);
    await this._run('git', ['-C', destPath, 'checkout']);
  }

  /**
   * Resolves the list of component directories to search.
   * If `paths` is undefined, defaults to `<pluginDir>/<defaultDir>` (only if it exists).
   * If `paths` is a string or string[], resolves each relative to `pluginDir`.
   */
  private _resolveDirs(pluginDir: string, paths: string | string[] | undefined, defaultDir: string): string[] {
    if (paths === undefined) {
      const defaultPath = path.join(pluginDir, defaultDir);
      return fs.existsSync(defaultPath) ? [defaultPath] : [];
    }
    const pathArray = Array.isArray(paths) ? paths : [paths];
    return pathArray.map((p) => path.join(pluginDir, p.replace(/\/$/, '')));
  }

  /**
   * Parses YAML frontmatter from a markdown file.
   *
   * Expects the content to start with `---`, followed by key-value pairs
   * (`key: value`), terminated by another `---`. Returns the parsed fields
   * and the remaining body text.
   */
  private _parseFrontmatter(content: string): { frontmatter: Record<string, string | undefined>; body: string } {
    if (!content.startsWith('---')) {
      return { frontmatter: {}, body: content };
    }
    const endIndex = content.indexOf('---', 3);
    if (endIndex === -1) {
      return { frontmatter: {}, body: content };
    }
    const yaml = content.substring(3, endIndex);
    const body = content.substring(endIndex + 3);
    const frontmatter: Record<string, string | undefined> = {};
    for (const line of yaml.split('\n')) {
      const match = line.match(/^(\w[\w-]*):\s*(.+)$/);
      if (match) {
        frontmatter[match[1]] = match[2].trim();
      }
    }
    return { frontmatter, body };
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
