import type { ConnectorConfig } from '@gho-work/base';
import type { MCPServerConfig } from '@gho-work/agent';

/**
 * Maps an array of ConnectorConfig (from packages/base) to the SDK's
 * Record<string, MCPServerConfig> format used when constructing a session.
 *
 * Rules:
 * - Uses connector.name as the key; deduplicates by appending " (id)" on collision.
 * - Builds the tools list from toolsConfig entries where the value is not false.
 *   If toolsConfig is absent, tools defaults to [].
 * - stdio transport → type: 'stdio'; streamable_http transport → type: 'http'.
 * - Only passes fields that are defined (avoids setting undefined keys).
 */
export function mapConnectorsToSDKConfig(connectors: ConnectorConfig[]): Record<string, MCPServerConfig> {
  const result: Record<string, MCPServerConfig> = {};
  const usedNames = new Set<string>();

  for (const c of connectors) {
    let name = c.name;
    if (usedNames.has(name)) {
      name = `${c.name} (${c.id})`;
    }
    usedNames.add(name);

    const tools: string[] = [];
    if (c.toolsConfig) {
      for (const [toolName, enabled] of Object.entries(c.toolsConfig)) {
        if (enabled !== false) {
          tools.push(toolName);
        }
      }
    }

    if (c.transport === 'stdio') {
      const entry: MCPServerConfig = { type: 'stdio', tools };
      if (c.command !== undefined) { entry.command = c.command; }
      if (c.args !== undefined) { entry.args = c.args; }
      if (c.env !== undefined) { entry.env = c.env; }
      result[name] = entry;
    } else {
      const entry: MCPServerConfig = { type: 'http', tools };
      if (c.url !== undefined) { entry.url = c.url; }
      if (c.headers !== undefined) { entry.headers = c.headers; }
      result[name] = entry;
    }
  }

  return result;
}
