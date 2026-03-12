// Service interfaces (common -- environment-agnostic)
export { IConnectorRegistry } from './common/connectorRegistry.js';
export { IMCPClientManager } from './common/mcpClientManager.js';
export type { ToolInfo } from './common/mcpClientManager.js';
export { ICLIDetectionService } from './common/cliDetection.js';
export type { CLIToolStatus } from './common/cliDetection.js';
export { IPlatformDetectionService } from './common/platformDetection.js';
export type { PlatformContext } from './common/platformDetection.js';

// Node implementations (main process only)
export { ConnectorRegistryImpl } from './node/connectorRegistryImpl.js';
export { MCPClientManagerImpl } from './node/mcpClientManagerImpl.js';
export { CLIDetectionServiceImpl } from './node/cliDetectionImpl.js';
export { PlatformDetectionServiceImpl } from './node/platformDetectionImpl.js';
