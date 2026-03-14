// Service interfaces (common -- environment-agnostic)
export { IMCPClientManager } from './common/mcpClientManager.js';
export type { ToolInfo } from './common/mcpClientManager.js';
export * from './common/connectorConfigStore.js';
export { IPluginService } from './common/pluginService.js';
export type {
  InstallProgress,
  PluginSkillRegistration,
  PluginSettingsStore,
} from './common/pluginService.js';
export * from './common/pluginTypes.js';

// Node implementations (main process only)
export { MCPClientManagerImpl } from './node/mcpClientManagerImpl.js';
export * from './node/connectorConfigStore.js';
export * from './node/agentTools.js';
export { PluginServiceImpl } from './node/pluginServiceImpl.js';
export { PluginCatalogFetcher } from './node/pluginCatalogFetcher.js';
export { PluginInstaller } from './node/pluginInstaller.js';
