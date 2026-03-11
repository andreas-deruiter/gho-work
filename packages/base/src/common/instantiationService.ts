/**
 * InstantiationService — resolves services via constructor injection.
 * @see references/vscode/src/vs/platform/instantiation/common/instantiationService.ts
 */
import { getDependencies, IInstantiationService } from './instantiation.js';
import type { ServiceIdentifier } from './instantiation.js';
import { ServiceCollection } from './serviceCollection.js';
import { SyncDescriptor } from './descriptors.js';

export class InstantiationService implements IInstantiationService {
  private readonly _activeInstantiations = new Set<string>();

  constructor(private readonly _services: ServiceCollection) {
    this._services.set(IInstantiationService, this);
  }

  createInstance<T>(ctor: new (...args: any[]) => T, ...staticArgs: any[]): T {
    const deps = getDependencies(ctor);

    // Validate: service dependencies must come after static args
    for (const dep of deps) {
      if (dep.index < staticArgs.length) {
        throw new Error(
          `Service dependency @${dep.id.id} at parameter index ${dep.index} conflicts with static argument. ` +
          `Static args must precede all @Service parameters.`,
        );
      }
    }

    const serviceArgs = deps.map((d) => this._getOrCreateServiceInstance(d.id));
    const allArgs = [...staticArgs, ...serviceArgs];
    return new ctor(...allArgs);
  }

  getService<T>(id: ServiceIdentifier<T>): T {
    return this._getOrCreateServiceInstance(id);
  }

  private _getOrCreateServiceInstance<T>(id: ServiceIdentifier<T>): T {
    const entry = this._services.get(id);
    if (entry === undefined) {
      throw new Error(`Service not registered: ${id.id}`);
    }
    if (entry instanceof SyncDescriptor) {
      return this._createAndCacheServiceInstance(id, entry);
    }
    return entry as T;
  }

  private _createAndCacheServiceInstance<T>(
    id: ServiceIdentifier<T>,
    desc: SyncDescriptor<T>,
  ): T {
    if (this._activeInstantiations.has(id.id)) {
      throw new Error(
        `Circular dependency detected: ${id.id} (chain: ${[...this._activeInstantiations].join(' -> ')} -> ${id.id})`,
      );
    }

    this._activeInstantiations.add(id.id);
    try {
      const instance = this.createInstance(desc.ctor, ...desc.staticArguments);
      this._services.set(id, instance);
      return instance;
    } finally {
      this._activeInstantiations.delete(id.id);
    }
  }
}
