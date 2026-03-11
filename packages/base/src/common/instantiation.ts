/**
 * Service identifier system with parameter decorator support.
 * Adapted from VS Code's createDecorator pattern.
 * @see references/vscode/src/vs/platform/instantiation/common/instantiation.ts
 */

export interface ServiceIdentifier<T> {
  (...args: any[]): void; // parameter decorator signature
  readonly _brand: T;
  readonly id: string;
}

// Global registry to detect duplicate IDs
const _serviceIds = new Map<string, ServiceIdentifier<any>>();

// Dependency metadata stored per constructor
const DI_DEPENDENCIES = new Map<Function, { id: ServiceIdentifier<any>; index: number }[]>();

export function createServiceIdentifier<T>(serviceId: string): ServiceIdentifier<T> {
  if (_serviceIds.has(serviceId)) {
    return _serviceIds.get(serviceId)! as ServiceIdentifier<T>;
  }

  const id = function (target: any, _key: string | undefined, index: number): void {
    const deps = DI_DEPENDENCIES.get(target) ?? [];
    deps.push({ id: id as any, index });
    DI_DEPENDENCIES.set(target, deps);
  } as unknown as ServiceIdentifier<T>;

  (id as any).id = serviceId;
  _serviceIds.set(serviceId, id);
  return id;
}

export function getDependencies(ctor: Function): { id: ServiceIdentifier<any>; index: number }[] {
  return (DI_DEPENDENCIES.get(ctor) ?? []).sort((a, b) => a.index - b.index);
}

/**
 * IInstantiationService — the DI resolver itself is a service.
 */
export interface IInstantiationService {
  createInstance<T>(ctor: new (...args: any[]) => T, ...args: any[]): T;
  getService<T>(id: ServiceIdentifier<T>): T;
}

export const IInstantiationService = createServiceIdentifier<IInstantiationService>(
  'IInstantiationService',
);
