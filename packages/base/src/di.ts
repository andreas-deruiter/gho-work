/**
 * Lightweight Dependency Injection container.
 * Inspired by VS Code's ServiceCollection / InstantiationService pattern.
 *
 * Usage:
 *   const IMyService = createServiceId<IMyService>('IMyService');
 *   container.register(IMyService, new MyServiceImpl());
 *   const svc = container.get(IMyService);
 */

/**
 * A service identifier — a branded string that also carries the interface type.
 */
export interface ServiceId<T> {
  readonly _brand: T;
  readonly id: string;
}

/**
 * Create a typed service identifier.
 */
export function createServiceId<T>(id: string): ServiceId<T> {
  return { id } as ServiceId<T>;
}

/**
 * Simple DI container (ServiceCollection).
 * No decorator magic — just register and resolve.
 */
export class ServiceCollection {
  private services = new Map<string, unknown>();

  register<T>(id: ServiceId<T>, instance: T): void {
    this.services.set(id.id, instance);
  }

  get<T>(id: ServiceId<T>): T {
    const svc = this.services.get(id.id);
    if (svc === undefined) {
      throw new Error(`Service not registered: ${id.id}`);
    }
    return svc as T;
  }

  has<T>(id: ServiceId<T>): boolean {
    return this.services.has(id.id);
  }
}
