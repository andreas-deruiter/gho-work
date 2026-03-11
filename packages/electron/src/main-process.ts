/**
 * Main process setup — wires up IPC handlers, DI container, and agent service.
 * This runs in Electron's main process.
 */
import { BrowserWindow, ipcMain } from 'electron';
import { ServiceCollection } from '@gho-work/base';
import type { AgentContext, AgentEvent } from '@gho-work/base';
import { IPC_CHANNELS, IIPCMain } from '@gho-work/platform';
import type { SendMessageRequest } from '@gho-work/platform';
import { ICopilotSDK, IAgentService, MockCopilotSDK, MockAgentService } from '@gho-work/agent';

/**
 * Sets up the main process: DI container, IPC handlers, agent service.
 * Returns a function to get the service collection (for testing).
 */
export function createMainProcess(mainWindow: BrowserWindow): ServiceCollection {
  const services = new ServiceCollection();

  // --- Register services ---

  // Mock Copilot SDK (will be replaced with real SDK)
  const mockSDK = new MockCopilotSDK();
  services.register(ICopilotSDK, mockSDK);

  // Agent service (uses the SDK)
  const agentService = new MockAgentService(mockSDK);
  services.register(IAgentService, agentService);

  // IPC Main adapter
  const ipcMainAdapter: import('@gho-work/platform').IIPCMain = {
    handle(channel: string, handler: (...args: unknown[]) => Promise<unknown>) {
      ipcMain.handle(channel, (_event, ...args) => handler(...args));
    },
    sendToRenderer(channel: string, ...args: unknown[]) {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, ...args);
      }
    },
  };
  services.register(IIPCMain, ipcMainAdapter);

  // --- Set up IPC handlers ---

  ipcMainAdapter.handle(IPC_CHANNELS.AGENT_SEND_MESSAGE, async (...args: unknown[]) => {
    const request = args[0] as SendMessageRequest;
    const context: AgentContext = {
      conversationId: request.conversationId,
      workspaceId: 'spike-workspace',
      model: request.model,
    };

    // Run agent in background, stream events to renderer
    (async () => {
      try {
        for await (const event of agentService.executeTask(request.content, context)) {
          ipcMainAdapter.sendToRenderer(IPC_CHANNELS.AGENT_EVENT, event);
        }
      } catch (err) {
        const errorEvent: AgentEvent = {
          type: 'error',
          error: err instanceof Error ? err.message : String(err),
        };
        ipcMainAdapter.sendToRenderer(IPC_CHANNELS.AGENT_EVENT, errorEvent);
      }
    })();

    return { messageId: 'pending' };
  });

  ipcMainAdapter.handle(IPC_CHANNELS.AGENT_CANCEL, async () => {
    agentService.cancelTask('current');
  });

  ipcMainAdapter.handle(IPC_CHANNELS.CONVERSATION_LIST, async () => {
    return { conversations: [] };
  });

  ipcMainAdapter.handle(IPC_CHANNELS.CONVERSATION_CREATE, async () => {
    return { id: 'spike-conversation', title: 'New Conversation' };
  });

  return services;
}
