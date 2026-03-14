/**
 * Shared types for the plugin marketplace feature.
 * Used across packages: base, platform, agent, connectors, ui, electron.
 */

// --- Install Progress ---

/** Progress status for a plugin installation operation. */
export type InstallProgressStatus = 'downloading' | 'extracting' | 'registering' | 'done' | 'error';

// --- Plugin Location ---

/**
 * Discriminated union describing where a plugin is sourced from.
 * Uses a `type` field (not `source`) to avoid nesting confusion.
 */
export type PluginLocation =
  | {
      /** Plugin hosted on GitHub — resolved to a tarball download. */
      type: 'github';
      /** Repository in "owner/repo" format. */
      repo: string;
      /** Git ref (branch, tag, commit SHA). Defaults to the default branch if omitted. */
      ref?: string;
    }
  | {
      /** Plugin hosted at an arbitrary URL (zip/tarball or git remote). */
      type: 'url';
      /** Download or clone URL. */
      url: string;
      /** Git ref when the URL points to a git remote. */
      ref?: string;
    }
  | {
      /** Plugin lives in a subdirectory of a git repository (monorepo). */
      type: 'git-subdir';
      /** Clone URL of the repository. */
      url: string;
      /** Path within the repository to the plugin root. */
      path: string;
      /** Git ref (branch, tag, commit SHA). Defaults to the default branch if omitted. */
      ref?: string;
    };

// --- Catalog Entry ---

/**
 * A single entry in the plugin marketplace catalog.
 * Sourced from the remote marketplace.json registry.
 */
export interface CatalogEntry {
  /** Package name (must be unique in the catalog). */
  name: string;
  /** Human-readable description of what the plugin does. */
  description: string;
  /** Semver version string of the latest published release. May be undefined if the catalog entry omits it. */
  version?: string;
  /** Plugin author information. */
  author?: {
    name: string;
    email?: string;
  };
  /**
   * Where the plugin is hosted.
   * Can be a bare string (treated as a URL) or a structured PluginLocation.
   */
  location: string | PluginLocation;
  /** Searchable keywords for the plugin. */
  keywords?: string[];
  /** Broad category for display grouping (e.g. "tools", "productivity"). */
  category?: string;
  /** Whether the plugin bundles any agent skills. */
  hasSkills: boolean;
  /** Whether the plugin registers any MCP servers. */
  hasMcpServers: boolean;
}

// --- Installed Plugin ---

/**
 * Runtime record of a plugin that has been installed on the user's machine.
 * Persisted in the plugin database alongside the catalog metadata.
 */
export interface InstalledPlugin {
  /** Package name — matches CatalogEntry.name. */
  name: string;
  /** Installed version (may differ from catalog's latest if pinned). */
  version: string;
  /** Whether the plugin is currently active (skills loaded, servers started). */
  enabled: boolean;
  /** Absolute path to the plugin's cached files on disk. */
  cachePath: string;
  /** ISO 8601 timestamp of when the plugin was installed. */
  installedAt: string;
  /** Snapshot of catalog metadata at the time of installation. */
  catalogMeta: CatalogEntry;
  /** Number of skill files contributed by this plugin. */
  skillCount: number;
  /** Names of MCP servers registered by this plugin. */
  mcpServerNames: string[];
}
