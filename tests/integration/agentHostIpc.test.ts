/**
 * Integration test: MessagePort bidirectional communication.
 * Uses Node.js MessageChannel as a stand-in for Electron's MessagePort.
 */
import { describe, it, expect } from 'vitest';
import { MessagePortProtocol } from '@gho-work/platform';

describe('MessagePort bidirectional communication', () => {
  it('should exchange messages between two protocols', async () => {
    const { MessageChannel } = await import('node:worker_threads');
    const channel = new MessageChannel();

    const serverProtocol = new MessagePortProtocol(channel.port1);
    const clientProtocol = new MessagePortProtocol(channel.port2);

    serverProtocol.onRequest('ping', async () => ({ status: 'pong' }));
    serverProtocol.onRequest('echo', async (data) => ({ echo: data }));

    const pong = await clientProtocol.request('ping');
    expect(pong).toEqual({ status: 'pong' });

    const echo = await clientProtocol.request('echo', { message: 'hello' });
    expect(echo).toEqual({ echo: { message: 'hello' } });

    serverProtocol.dispose();
    clientProtocol.dispose();
  });

  it('should handle fire-and-forget messages', async () => {
    const { MessageChannel } = await import('node:worker_threads');
    const channel = new MessageChannel();

    const proto1 = new MessagePortProtocol(channel.port1);
    const proto2 = new MessagePortProtocol(channel.port2);

    const received = new Promise<any>((resolve) => {
      proto2.onMessage((data) => resolve(data));
    });

    proto1.send({ type: 'notification', content: 'test' });
    const msg = await received;
    expect(msg).toEqual({ type: 'notification', content: 'test' });

    proto1.dispose();
    proto2.dispose();
  });
});
