import { describe, it, expect } from 'vitest';
import { InstantiationService } from '../../common/instantiationService.js';
import { ServiceCollection } from '../../common/serviceCollection.js';
import { SyncDescriptor } from '../../common/descriptors.js';
import { createServiceIdentifier } from '../../common/instantiation.js';

// --- Test services ---
interface IServiceA { a(): string; }
const IServiceA = createServiceIdentifier<IServiceA>('test.IServiceA');

interface IServiceB { b(): string; }
const IServiceB = createServiceIdentifier<IServiceB>('test.IServiceB');

interface IServiceC { c(): string; }
const IServiceC = createServiceIdentifier<IServiceC>('test.IServiceC');

class ServiceA implements IServiceA {
  a(): string { return 'A'; }
}

class ServiceB implements IServiceB {
  constructor(@IServiceA private readonly serviceA: IServiceA) {}
  b(): string { return `B+${this.serviceA.a()}`; }
}

class ServiceC implements IServiceC {
  constructor(
    @IServiceA private readonly serviceA: IServiceA,
    @IServiceB private readonly serviceB: IServiceB,
  ) {}
  c(): string { return `C+${this.serviceA.a()}+${this.serviceB.b()}`; }
}

describe('InstantiationService', () => {
  it('should resolve a service with no dependencies', () => {
    const sc = new ServiceCollection([IServiceA, new SyncDescriptor(ServiceA)]);
    const inst = new InstantiationService(sc);
    const a = inst.getService(IServiceA);
    expect(a.a()).toBe('A');
  });

  it('should resolve a chain of 2 services', () => {
    const sc = new ServiceCollection(
      [IServiceA, new SyncDescriptor(ServiceA)],
      [IServiceB, new SyncDescriptor(ServiceB)],
    );
    const inst = new InstantiationService(sc);
    const b = inst.getService(IServiceB);
    expect(b.b()).toBe('B+A');
  });

  it('should resolve a chain of 3+ services', () => {
    const sc = new ServiceCollection(
      [IServiceA, new SyncDescriptor(ServiceA)],
      [IServiceB, new SyncDescriptor(ServiceB)],
      [IServiceC, new SyncDescriptor(ServiceC)],
    );
    const inst = new InstantiationService(sc);
    const c = inst.getService(IServiceC);
    expect(c.c()).toBe('C+A+B+A');
  });

  it('should cache resolved instances', () => {
    const sc = new ServiceCollection([IServiceA, new SyncDescriptor(ServiceA)]);
    const inst = new InstantiationService(sc);
    const a1 = inst.getService(IServiceA);
    const a2 = inst.getService(IServiceA);
    expect(a1).toBe(a2);
  });

  it('should detect circular dependencies', () => {
    interface ICycleA { x(): void; }
    const ICycleA = createServiceIdentifier<ICycleA>('test.ICycleA');
    interface ICycleB { y(): void; }
    const ICycleB = createServiceIdentifier<ICycleB>('test.ICycleB');

    class CycleA implements ICycleA {
      constructor(@ICycleB private b: ICycleB) {}
      x(): void {}
    }
    class CycleB implements ICycleB {
      constructor(@ICycleA private a: ICycleA) {}
      y(): void {}
    }

    const sc = new ServiceCollection(
      [ICycleA, new SyncDescriptor(CycleA)],
      [ICycleB, new SyncDescriptor(CycleB)],
    );
    const inst = new InstantiationService(sc);
    expect(() => inst.getService(ICycleA)).toThrow(/[Cc]ircular/);
  });

  it('should resolve pre-registered instances directly', () => {
    const instance = new ServiceA();
    const sc = new ServiceCollection([IServiceA, instance]);
    const inst = new InstantiationService(sc);
    expect(inst.getService(IServiceA)).toBe(instance);
  });

  it('should createInstance with static args + injected services', () => {
    const sc = new ServiceCollection([IServiceA, new SyncDescriptor(ServiceA)]);
    const inst = new InstantiationService(sc);

    class Consumer {
      constructor(
        public readonly label: string,
        @IServiceA public readonly serviceA: IServiceA,
      ) {}
    }

    const consumer = inst.createInstance(Consumer, 'test-label');
    expect(consumer.label).toBe('test-label');
    expect(consumer.serviceA.a()).toBe('A');
  });
});

import { TestInstantiationService } from './testInstantiationService.js';

describe('TestInstantiationService', () => {
  it('should stub services with partial implementations', () => {
    const testInst = new TestInstantiationService();
    testInst.stub(IServiceA, { a: () => 'mocked-A' });
    const a = testInst.getService(IServiceA);
    expect(a.a()).toBe('mocked-A');
  });

  it('should throw on unimplemented stub methods', () => {
    const testInst = new TestInstantiationService();
    testInst.stub<IServiceA>(IServiceA, {});
    const a = testInst.getService(IServiceA);
    expect(() => a.a()).toThrow('Stubbed method not implemented');
  });

  it('should support createInstance with stubs', () => {
    const testInst = new TestInstantiationService();
    testInst.stub(IServiceA, { a: () => 'stub-A' });

    class Consumer {
      constructor(@IServiceA public readonly svc: IServiceA) {}
    }

    const consumer = testInst.createInstance(Consumer);
    expect(consumer.svc.a()).toBe('stub-A');
  });
});
