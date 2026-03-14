import type { CatalogEntry, PluginLocation } from '@gho-work/base';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MARKETPLACE_REPO_URL = 'https://github.com/anthropics/claude-plugins-official';

const DEFAULT_CATALOG_URL =
  'https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json';

// ---------------------------------------------------------------------------
// Raw types from marketplace.json
// ---------------------------------------------------------------------------

type RawSourceObject =
  | { source: 'github'; repo: string; ref?: string; sha?: string }
  | { source: 'url'; url: string; ref?: string; sha?: string }
  | { source: 'git-subdir'; url: string; path: string; ref?: string; sha?: string }
  | { source: 'npm'; package: string; version?: string; registry?: string };

type RawSource = string | RawSourceObject;

interface RawPlugin {
  name: string;
  description: string;
  version: string;
  author?: { name: string; email?: string };
  source: RawSource;
  keywords?: string[];
  category?: string;
  tags?: string[];
  homepage?: string;
  repository?: string;
  license?: string;
  strict?: boolean;
  // Component declarations
  skills?: string | string[];
  commands?: string | string[];
  agents?: string | string[];
  hooks?: string | Record<string, unknown>;
  mcpServers?: string | Record<string, unknown>;
}

interface RawMarketplace {
  name?: string;
  owner?: { name: string; email?: string };
  metadata?: { pluginRoot?: string; description?: string; version?: string };
  plugins: RawPlugin[];
}

// ---------------------------------------------------------------------------
// PluginCatalogFetcher
// ---------------------------------------------------------------------------

/**
 * Fetches and parses the official plugin marketplace catalog.
 *
 * Usage:
 *   const entries = await new PluginCatalogFetcher().fetch();
 */
export class PluginCatalogFetcher {
  private readonly _url: string;

  constructor(url: string = DEFAULT_CATALOG_URL) {
    this._url = url;
  }

  /**
   * Fetch the catalog from the remote URL and return parsed CatalogEntry array.
   * Throws with a user-friendly message on network or HTTP errors.
   */
  async fetch(): Promise<CatalogEntry[]> {
    let response: Response;
    try {
      response = await fetch(this._url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to fetch plugin catalog from ${this._url}: ${message}`);
    }

    if (!response.ok) {
      throw new Error(
        `Failed to fetch plugin catalog: HTTP ${response.status} from ${this._url}`,
      );
    }

    const raw = (await response.json()) as RawMarketplace;
    const pluginRoot = raw.metadata?.pluginRoot;

    return (raw.plugins ?? []).map((plugin) => this._toEntry(plugin, pluginRoot));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Maps a raw marketplace plugin entry to a CatalogEntry. */
  _toEntry(plugin: RawPlugin, pluginRoot: string | undefined): CatalogEntry {
    const hasSkills = _hasValue(plugin.skills) || _hasValue(plugin.commands);
    const hasCommands = _hasValue(plugin.commands);
    const hasAgents = _hasValue(plugin.agents);
    const hasHooks = _hasValue(plugin.hooks);
    const hasMcpServers =
      typeof plugin.mcpServers === 'string'
        ? plugin.mcpServers.length > 0
        : plugin.mcpServers !== undefined &&
          plugin.mcpServers !== null &&
          Object.keys(plugin.mcpServers).length > 0;

    // Build componentPaths only when at least one component field is present
    const hasAnyComponent =
      plugin.skills !== undefined ||
      plugin.commands !== undefined ||
      plugin.agents !== undefined ||
      plugin.hooks !== undefined ||
      plugin.mcpServers !== undefined;

    const componentPaths: CatalogEntry['componentPaths'] = hasAnyComponent
      ? {
          ...(plugin.skills !== undefined && { skills: plugin.skills }),
          ...(plugin.commands !== undefined && { commands: plugin.commands }),
          ...(plugin.agents !== undefined && { agents: plugin.agents }),
          ...(plugin.hooks !== undefined && { hooks: plugin.hooks }),
          ...(plugin.mcpServers !== undefined && { mcpServers: plugin.mcpServers }),
        }
      : undefined;

    return {
      name: plugin.name,
      description: plugin.description,
      version: plugin.version,
      ...(plugin.author !== undefined && { author: plugin.author }),
      location: this._resolveLocation(plugin.source, pluginRoot),
      ...(plugin.keywords !== undefined && { keywords: plugin.keywords }),
      ...(plugin.category !== undefined && { category: plugin.category }),
      ...(plugin.tags !== undefined && { tags: plugin.tags }),
      ...(plugin.homepage !== undefined && { homepage: plugin.homepage }),
      ...(plugin.repository !== undefined && { repository: plugin.repository }),
      ...(plugin.license !== undefined && { license: plugin.license }),
      strict: plugin.strict ?? true,
      hasSkills,
      hasMcpServers,
      hasCommands,
      hasAgents,
      hasHooks,
      ...(componentPaths !== undefined && { componentPaths }),
    };
  }

  /**
   * Converts the `source` field to a PluginLocation.
   *
   * - Bare string: treated as a path relative to `pluginRoot` within the
   *   official marketplace repo, resolved to a `git-subdir` location.
   * - Object with `type: 'github'`, `'url'`, `'git-subdir'`, or `'npm'`: passed through.
   */
  _resolveLocation(source: RawSource, pluginRoot: string | undefined): PluginLocation {
    if (typeof source === 'string') {
      const subPath = pluginRoot ? `${pluginRoot}/${source}` : source;
      return {
        type: 'git-subdir',
        url: MARKETPLACE_REPO_URL,
        path: subPath,
      };
    }

    switch (source.source) {
      case 'github':
        return {
          type: 'github',
          repo: source.repo,
          ...(source.ref !== undefined && { ref: source.ref }),
        };
      case 'url':
        return {
          type: 'url',
          url: source.url,
          ...(source.ref !== undefined && { ref: source.ref }),
        };
      case 'git-subdir':
        return {
          type: 'git-subdir',
          url: source.url,
          path: source.path,
          ...(source.ref !== undefined && { ref: source.ref }),
        };
      case 'npm':
        return {
          type: 'npm',
          package: source.package,
          ...(source.version !== undefined && { version: source.version }),
          ...(source.registry !== undefined && { registry: source.registry }),
        };
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when a component field has a non-empty value.
 * Handles string (non-empty), string[] (non-empty), and object (non-empty keys).
 */
function _hasValue(
  value: string | string[] | Record<string, unknown> | undefined,
): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return Object.keys(value).length > 0;
}
