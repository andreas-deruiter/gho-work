import type { MCPServerConfig } from '@gho-work/base';

/**
 * The SDK-facing MCP server config shape.
 * Differs from MCPServerConfig in two ways:
 *   - `tools: string[]` is required (SDK needs it, even if empty)
 *   - `source` is absent (SDK doesn't understand it)
 */
export interface SdkMcpServerConfig {
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  timeout?: number;
  tools: string[];
}

/**
 * Maps a canonical MCPServerConfig to the SDK-facing shape.
 * - Strips `source` (SDK-unknown field)
 * - Adds `tools: []` (Phase 1: no filtering, SDK requires the field)
 */
export function toSdkMcpConfig(config: MCPServerConfig): SdkMcpServerConfig {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { source: _source, ...rest } = config;
  return { ...rest, tools: [] };
}
