// Service interfaces (common -- environment-agnostic)
export { IMCPClientManager } from './common/mcpClientManager.js';
export type { ToolInfo } from './common/mcpClientManager.js';
export * from './common/connectorConfigStore.js';

// Node implementations (main process only)
export { MCPClientManagerImpl } from './node/mcpClientManagerImpl.js';
export * from './node/connectorConfigStore.js';
export * from './node/agentTools.js';
