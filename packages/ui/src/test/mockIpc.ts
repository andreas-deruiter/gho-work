/**
 * Shared mock IPC renderer for UI tests.
 * Returns an object satisfying IIPCRenderer with configurable responses.
 */
import { vi } from 'vitest';
import type { IIPCRenderer } from '@gho-work/platform/common';

/**
 * Creates a mock IPC renderer for testing.
 *
 * @param responses - Map of channel names to response values for `invoke()`.
 *   If a channel is not in the map, invoke returns `undefined`.
 */
export function createMockIPC(responses: Record<string, unknown> = {}): IIPCRenderer {
  return {
    invoke: vi.fn(async (channel: string) => responses[channel]) as unknown as IIPCRenderer['invoke'],
    on: vi.fn(),
    removeListener: vi.fn(),
  };
}
