import type { MCPServerConfig } from '@gho-work/base';
import type { IConnectorConfigStore } from '../common/connectorConfigStore.js';

export interface AddMCPServerInput {
  name: string;
  type: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
}

export interface RemoveMCPServerInput {
  name: string;
}

export interface AgentToolResult {
  success: boolean;
  error?: string;
}

export interface ListMCPServersResult {
  servers: Array<{ name: string; config: MCPServerConfig }>;
}

export async function handleAddMCPServer(
  store: IConnectorConfigStore,
  input: AddMCPServerInput,
): Promise<AgentToolResult> {
  if (!input.name || input.name.trim() === '') {
    return { success: false, error: 'Server name is required' };
  }
  if (input.type !== 'stdio' && input.type !== 'http') {
    return { success: false, error: 'Server type must be "stdio" or "http"' };
  }
  if (input.type === 'stdio' && !input.command) {
    return { success: false, error: 'stdio servers require a command' };
  }
  if (input.type === 'http' && !input.url) {
    return { success: false, error: 'http servers require a url' };
  }

  const config: MCPServerConfig = { type: input.type };
  if (input.type === 'stdio') {
    config.command = input.command;
    if (input.args) { config.args = input.args; }
    if (input.env) { config.env = input.env; }
    if (input.cwd) { config.cwd = input.cwd; }
  } else {
    config.url = input.url;
    if (input.headers) { config.headers = input.headers; }
  }

  try {
    await store.addServer(input.name, config);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function handleRemoveMCPServer(
  store: IConnectorConfigStore,
  input: RemoveMCPServerInput,
): Promise<AgentToolResult> {
  if (!input.name || input.name.trim() === '') {
    return { success: false, error: 'Server name is required' };
  }

  try {
    await store.removeServer(input.name);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function handleListMCPServers(
  store: IConnectorConfigStore,
): Promise<ListMCPServersResult> {
  const servers = store.getServers();
  return {
    servers: Array.from(servers.entries()).map(([name, config]) => ({ name, config })),
  };
}
