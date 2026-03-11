export * from './common/lifecycle.js';
export * from './common/instantiation.js';
export * from './common/event.js';
export * from './common/types.js';
export * from './common/uuid.js';
export * from './common/descriptors.js';
export * from './common/serviceCollection.js';

// --- Backward-compatibility shims (deprecated, use createServiceIdentifier) ---

import { createServiceIdentifier } from './common/instantiation.js';
import type { ServiceIdentifier } from './common/instantiation.js';

/** @deprecated Use createServiceIdentifier instead */
export type ServiceId<T> = ServiceIdentifier<T>;

/** @deprecated Use createServiceIdentifier instead */
export function createServiceId<T>(id: string): ServiceIdentifier<T> {
  return createServiceIdentifier<T>(id);
}
