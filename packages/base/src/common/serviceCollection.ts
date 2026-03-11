/**
 * Service collection — a map of service identifiers to instances or descriptors.
 * @see references/vscode/src/vs/platform/instantiation/common/serviceCollection.ts
 */
import type { ServiceIdentifier } from './instantiation.js';
import type { SyncDescriptor } from './descriptors.js';

export class ServiceCollection {
  private readonly _entries = new Map<string, any>();

  constructor(...entries: [ServiceIdentifier<any>, any][]) {
    for (const [id, instanceOrDescriptor] of entries) {
      this.set(id, instanceOrDescriptor);
    }
  }

  set<T>(id: ServiceIdentifier<T>, instanceOrDescriptor: T | SyncDescriptor<T>): void {
    this._entries.set(id.id, instanceOrDescriptor);
  }

  get<T>(id: ServiceIdentifier<T>): T | SyncDescriptor<T> {
    return this._entries.get(id.id);
  }

  has(id: ServiceIdentifier<any>): boolean {
    return this._entries.has(id.id);
  }
}
