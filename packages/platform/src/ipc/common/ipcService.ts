/**
 * IPC service interfaces — abstractions over Electron IPC for testability.
 */
import { createServiceIdentifier } from '@gho-work/base';

export interface IIPCRenderer {
  invoke<T>(channel: string, ...args: unknown[]): Promise<T>;
  on(channel: string, callback: (...args: unknown[]) => void): void;
  removeListener(channel: string, callback: (...args: unknown[]) => void): void;
}

export const IIPCRenderer = createServiceIdentifier<IIPCRenderer>('IIPCRenderer');

export interface IIPCMain {
  handle(channel: string, handler: (...args: unknown[]) => Promise<unknown>): void;
  sendToRenderer(channel: string, ...args: unknown[]): void;
}

export const IIPCMain = createServiceIdentifier<IIPCMain>('IIPCMain');
