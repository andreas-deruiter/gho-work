/**
 * Agent Host IPC handler — processes incoming messages from Main via MessagePort.
 * Extracts the IPC concerns from agentHostMain.ts for clarity.
 */
import { MessagePortProtocol } from '@gho-work/platform';
import type { IDisposable } from '@gho-work/base';

/**
 * Handles MessagePort communication in the Agent Host utility process.
 * Uses request/response patterns via MessagePortProtocol.
 */
export class AgentHostIpc implements IDisposable {
  private _protocol: MessagePortProtocol | undefined;
  private _disposed = false;

  connect(port: MessagePort): void {
    this._protocol = new MessagePortProtocol(port);

    this._protocol.onRequest('agent:send-message', async (data) => {
      // Echo back for now — real SDK wiring in Phase 2
      return {
        type: 'text',
        content: `[Agent Host] Received: ${JSON.stringify(data)}`,
      };
    });

    this._protocol.onRequest('agent:ping', async () => {
      return { status: 'pong', timestamp: Date.now() };
    });
  }

  dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    this._protocol?.dispose();
  }
}
