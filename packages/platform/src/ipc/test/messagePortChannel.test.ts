import { describe, it, expect, vi } from 'vitest';
import { MessagePortProtocol } from '../common/messagePortChannel.js';

async function createMockPorts() {
  const { MessageChannel } = await import('node:worker_threads');
  const channel = new MessageChannel();
  return { port1: channel.port1, port2: channel.port2 };
}

describe('MessagePortProtocol', () => {
  it('should send and receive messages', async () => {
    const { port1, port2 } = await createMockPorts();
    const protocol1 = new MessagePortProtocol(port1);
    const protocol2 = new MessagePortProtocol(port2);

    const received = new Promise<any>((resolve) => {
      protocol2.onMessage((msg) => resolve(msg));
    });

    protocol1.send({ type: 'test', data: 'hello' });
    const msg = await received;
    expect(msg).toEqual({ type: 'test', data: 'hello' });

    protocol1.dispose();
    protocol2.dispose();
  });

  it('should support request/response pattern', async () => {
    const { port1, port2 } = await createMockPorts();
    const client = new MessagePortProtocol(port1);
    const server = new MessagePortProtocol(port2);

    server.onRequest('greet', async (args) => {
      return { greeting: `Hello, ${args.name}!` };
    });

    const result = await client.request('greet', { name: 'World' });
    expect(result).toEqual({ greeting: 'Hello, World!' });

    client.dispose();
    server.dispose();
  });

  it('should stop receiving after dispose', async () => {
    const { port1, port2 } = await createMockPorts();
    const protocol1 = new MessagePortProtocol(port1);
    const protocol2 = new MessagePortProtocol(port2);
    const listener = vi.fn();

    protocol2.onMessage(listener);
    protocol2.dispose();
    protocol1.send({ type: 'test' });

    await new Promise((r) => setTimeout(r, 50));
    expect(listener).not.toHaveBeenCalled();

    protocol1.dispose();
  });
});
