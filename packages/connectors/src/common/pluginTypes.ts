// Re-export shared types from base so consumers can import from @gho-work/connectors
export type {
  CatalogEntry,
  InstalledPlugin,
  PluginLocation,
  InstallProgressStatus,
} from '@gho-work/base';

// ---------------------------------------------------------------------------
// Connector-only types
// (Also exported from PluginInstaller but duplicated here so common/ code can
//  reference them without pulling in node/ imports.)
// ---------------------------------------------------------------------------

export interface PluginManifest {
  name: string;
  version?: string;
  description?: string;
  skills?: string | string[];
  mcpServers?: string | Record<string, MCPServerInlineConfig>;
}

export interface MCPServerInlineConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}
