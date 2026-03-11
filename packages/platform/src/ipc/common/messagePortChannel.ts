/**
 * MessagePort protocol — typed message passing for utility process communication.
 * Supports fire-and-forget messages and request/response patterns.
 */
import { Disposable, Emitter } from '@gho-work/base';
import type { Event, IDisposable } from '@gho-work/base';

interface ProtocolMessage {
  type: 'message' | 'request' | 'response';
  id?: number;
  channel?: string;
  data?: unknown;
  error?: string;
}

export class MessagePortProtocol extends Disposable {
  private _nextId = 0;
  private readonly _pendingRequests = new Map<number, { resolve: Function; reject: Function }>();
  private readonly _requestHandlers = new Map<string, (args: any) => Promise<any>>();
  private readonly _onMessage = this._register(new Emitter<any>());
  readonly onMessageEvent: Event<any> = this._onMessage.event;

  constructor(private readonly _port: any) {
    super();
    this._port.on('message', (msg: ProtocolMessage) => this._handleIncoming(msg));
  }

  send(data: unknown): void {
    this._port.postMessage({ type: 'message', data } satisfies ProtocolMessage);
  }

  async request<T>(channel: string, args?: unknown): Promise<T> {
    const id = this._nextId++;
    return new Promise<T>((resolve, reject) => {
      this._pendingRequests.set(id, { resolve, reject });
      this._port.postMessage({ type: 'request', id, channel, data: args } satisfies ProtocolMessage);
    });
  }

  onMessage(handler: (data: any) => void): IDisposable {
    return this._onMessage.event(handler);
  }

  onRequest(channel: string, handler: (args: any) => Promise<any>): void {
    this._requestHandlers.set(channel, handler);
  }

  private async _handleIncoming(msg: ProtocolMessage): Promise<void> {
    switch (msg.type) {
      case 'message':
        this._onMessage.fire(msg.data);
        break;
      case 'request': {
        const handler = this._requestHandlers.get(msg.channel!);
        if (handler) {
          try {
            const result = await handler(msg.data);
            this._port.postMessage({
              type: 'response',
              id: msg.id,
              data: result,
            } satisfies ProtocolMessage);
          } catch (err) {
            this._port.postMessage({
              type: 'response',
              id: msg.id,
              error: err instanceof Error ? err.message : String(err),
            } satisfies ProtocolMessage);
          }
        }
        break;
      }
      case 'response': {
        const pending = this._pendingRequests.get(msg.id!);
        if (pending) {
          this._pendingRequests.delete(msg.id!);
          if (msg.error) {
            pending.reject(new Error(msg.error));
          } else {
            pending.resolve(msg.data);
          }
        }
        break;
      }
    }
  }

  override dispose(): void {
    this._port.close?.();
    for (const [, { reject }] of this._pendingRequests) {
      reject(new Error('Protocol disposed'));
    }
    this._pendingRequests.clear();
    super.dispose();
  }
}
