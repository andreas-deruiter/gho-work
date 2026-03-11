export * from './common/lifecycle.js';
export * from './common/instantiation.js';
export * from './common/event.js';
export * from './common/types.js';
export * from './common/uuid.js';

// --- Backward-compatibility shims (deprecated, use createServiceIdentifier) ---

import { createServiceIdentifier } from './common/instantiation.js';
import type { ServiceIdentifier } from './common/instantiation.js';

/** @deprecated Use createServiceIdentifier instead */
export type ServiceId<T> = ServiceIdentifier<T>;

/** @deprecated Use createServiceIdentifier instead */
export function createServiceId<T>(id: string): ServiceIdentifier<T> {
  return createServiceIdentifier<T>(id);
}

/**
 * Simple DI container (ServiceCollection).
 * No decorator magic — just register and resolve.
 * @deprecated Will be replaced by InstantiationService in Task 2.
 */
export class ServiceCollection {
  private services = new Map<string, unknown>();

  register<T>(id: ServiceIdentifier<T> | ServiceId<T>, instance: T): void {
    this.services.set(id.id, instance);
  }

  get<T>(id: ServiceIdentifier<T> | ServiceId<T>): T {
    const svc = this.services.get(id.id);
    if (svc === undefined) {
      throw new Error(`Service not registered: ${id.id}`);
    }
    return svc as T;
  }

  has<T>(id: ServiceIdentifier<T> | ServiceId<T>): boolean {
    return this.services.has(id.id);
  }
}
