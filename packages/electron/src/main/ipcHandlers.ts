/**
 * IPC handler registration — thin orchestrator.
 *
 * Delegates to domain-specific files in `./ipc/`. No handler logic lives here.
 */
import { registerAgentHandlers } from './ipc/agentHandlers.js';
import { registerAuthHandlers } from './ipc/authHandlers.js';
import { registerConnectorHandlers } from './ipc/connectorHandlers.js';
import { registerPluginHandlers } from './ipc/pluginHandlers.js';
import { registerSystemHandlers } from './ipc/systemHandlers.js';
import type { IpcHandlerDeps } from './ipc/types.js';

export type { IpcHandlerDeps } from './ipc/types.js';

/**
 * Registers ALL IPC handlers with the main-process IPC adapter.
 *
 * Each domain's handlers are registered in sequence; registration order does
 * not affect runtime behaviour.
 */
export function registerIpcHandlers(deps: IpcHandlerDeps): void {
  registerAgentHandlers(deps);
  registerAuthHandlers(deps);
  registerConnectorHandlers(deps);
  registerPluginHandlers(deps);
  registerSystemHandlers(deps);
}
