/**
 * Agent Host — runs in an Electron utility process.
 * Hosts the CopilotSDK + AgentService. Communicates with renderer via MessagePort.
 */
import { MessagePortProtocol } from '@gho-work/platform';
import { MockCopilotSDK, AgentServiceImpl } from '@gho-work/agent';
import type { AgentContext } from '@gho-work/base';

let protocol: MessagePortProtocol | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(process as any).parentPort.on('message', async (e: Electron.MessageEvent) => {
  if (e.data?.type === 'port' && e.ports.length > 0) {
    const port = e.ports[0];
    protocol = new MessagePortProtocol(port);

    const sdk = new MockCopilotSDK();
    await sdk.start();

    const agentService = new AgentServiceImpl(sdk, null, '');

    protocol.onRequest('agent:send-message', async (args) => {
      const { conversationId, content, model } = args as {
        conversationId: string;
        content: string;
        model?: string;
      };

      const context: AgentContext = {
        conversationId,
        workspaceId: 'default',
        model,
      };

      // Stream events back via fire-and-forget messages
      (async () => {
        try {
          for await (const event of agentService.executeTask(content, context)) {
            protocol?.send({ channel: 'agent:event', data: event });
          }
        } catch (err) {
          protocol?.send({
            channel: 'agent:event',
            data: { type: 'error', error: err instanceof Error ? err.message : String(err) },
          });
        }
      })();

      return { messageId: 'pending' };
    });

    protocol.onRequest('agent:cancel', async () => {
      const taskId = agentService.getActiveTaskId();
      if (taskId) {
        agentService.cancelTask(taskId);
      }
    });

    protocol.onRequest('agent:ping', async () => {
      return { status: 'pong', pid: process.pid };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process as any).parentPort.postMessage({ type: 'ready' });
  }
});
