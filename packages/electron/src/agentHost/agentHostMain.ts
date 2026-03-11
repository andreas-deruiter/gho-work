/**
 * Agent Host — runs in an Electron utility process.
 * Receives a MessagePort from the main process for communication with the renderer.
 */
import { MessagePortProtocol } from '@gho-work/platform';

let protocol: MessagePortProtocol | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(process as any).parentPort.on('message', (e: Electron.MessageEvent) => {
  if (e.data?.type === 'port' && e.ports.length > 0) {
    const port = e.ports[0];
    protocol = new MessagePortProtocol(port);

    protocol.onRequest('agent:send-message', async (args) => {
      // TODO: wire up real Copilot SDK in Phase 2
      return { status: 'received', echo: args };
    });

    protocol.onRequest('agent:ping', async () => {
      return { status: 'pong', pid: process.pid };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process as any).parentPort.postMessage({ type: 'ready' });
  }
});
