// Service interfaces (common -- environment-agnostic)
export { IMCPClientManager } from './common/mcpClientManager.js';
export type { ToolInfo } from './common/mcpClientManager.js';
export * from './common/connectorConfigStore.js';
export { IPluginService } from './common/pluginService.js';
export type {
  InstallProgress,
  PluginSkillRegistration,
  PluginAgentRegistration,
  PluginHookRegistration,
  PluginSettingsStore,
} from './common/pluginService.js';
export * from './common/pluginTypes.js';
export * from './common/marketplaceTypes.js';

// Node implementations (main process only)
export { MCPClientManagerImpl } from './node/mcpClientManagerImpl.js';
export * from './node/connectorConfigStore.js';
export * from './node/agentTools.js';
export { PluginServiceImpl } from './node/pluginServiceImpl.js';
export { PluginCatalogFetcher } from './node/pluginCatalogFetcher.js';
export { PluginInstaller } from './node/pluginInstaller.js';
export { MarketplaceRegistryImpl } from './node/marketplaceRegistryImpl.js';
export { PluginAgentLoader } from './node/pluginAgentLoader.js';
export type { LoadedAgent } from './node/pluginAgentLoader.js';
