import type { CatalogEntry, PluginLocation } from '@gho-work/base';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MARKETPLACE_REPO_URL = 'https://github.com/anthropics/knowledge-work-plugins';

const DEFAULT_CATALOG_URL =
  'https://raw.githubusercontent.com/anthropics/knowledge-work-plugins/main/.claude-plugin/marketplace.json';

// ---------------------------------------------------------------------------
// Raw types from marketplace.json
// ---------------------------------------------------------------------------

type RawSourceObject =
  | { source: 'github'; repo: string; ref?: string; sha?: string }
  | { source: 'url'; url: string; ref?: string; sha?: string }
  | { source: 'git-subdir'; url: string; path: string; ref?: string; sha?: string };

type RawSource = string | RawSourceObject;

interface RawPlugin {
  name: string;
  description: string;
  version?: string;
  author?: { name: string; email?: string };
  source: RawSource;
  keywords?: string[];
  category?: string;
  skills?: string[];
  commands?: string[];
  mcpServers?: Record<string, unknown>;
}

interface RawMarketplace {
  metadata?: { pluginRoot?: string };
  owner?: { name: string };
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
    const defaultAuthor = raw.owner?.name;

    return (raw.plugins ?? []).map((plugin) => this._toEntry(plugin, pluginRoot, defaultAuthor));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Maps a raw marketplace plugin entry to a CatalogEntry. */
  _toEntry(plugin: RawPlugin, pluginRoot: string | undefined, defaultAuthor?: string): CatalogEntry {
    // Derive category from source path if not explicitly provided
    const category = plugin.category ?? this._deriveCategory(plugin);
    const author = plugin.author ?? (defaultAuthor ? { name: defaultAuthor } : undefined);

    return {
      name: plugin.name,
      description: plugin.description,
      version: plugin.version ?? '0.0.0',
      ...(author !== undefined && { author }),
      location: this._resolveLocation(plugin.source, pluginRoot),
      ...(plugin.keywords !== undefined && { keywords: plugin.keywords }),
      category,
      hasSkills:
        (Array.isArray(plugin.skills) && plugin.skills.length > 0) ||
        (Array.isArray(plugin.commands) && plugin.commands.length > 0),
      hasMcpServers:
        plugin.mcpServers !== undefined &&
        plugin.mcpServers !== null &&
        Object.keys(plugin.mcpServers).length > 0,
    };
  }

  /** Derive a category from the plugin's source path and author. */
  private _deriveCategory(plugin: RawPlugin): string {
    const source = typeof plugin.source === 'string' ? plugin.source : '';
    if (source.includes('partner-built')) {
      return 'Partner';
    }
    return 'Anthropic';
  }

  /**
   * Converts the `source` field to a PluginLocation.
   *
   * - Bare string: treated as a path relative to `pluginRoot` within the
   *   official marketplace repo, resolved to a `git-subdir` location.
   * - Object with `type: 'github'`, `'url'`, or `'git-subdir'`: passed through.
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
    }
  }
}
