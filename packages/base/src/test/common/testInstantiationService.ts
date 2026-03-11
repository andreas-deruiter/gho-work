/**
 * Test helper — simplified DI container for unit tests.
 */
import { InstantiationService } from '../../common/instantiationService.js';
import { ServiceCollection } from '../../common/serviceCollection.js';
import type { ServiceIdentifier } from '../../common/instantiation.js';

export class TestInstantiationService extends InstantiationService {
  constructor(services?: ServiceCollection) {
    super(services ?? new ServiceCollection());
  }

  set<T>(id: ServiceIdentifier<T>, instance: T): T {
    (this as any)._services.set(id, instance);
    return instance;
  }

  stub<T extends object>(id: ServiceIdentifier<T>, partial: Partial<T>): T {
    const proxy = new Proxy(partial as T, {
      get(target: any, prop: string) {
        if (prop in target) {
          return target[prop];
        }
        return () => {
          throw new Error(`Stubbed method not implemented: ${id.id}.${prop}`);
        };
      },
    });
    this.set(id, proxy);
    return proxy;
  }
}
