import { describe, it, expect } from 'vitest';
import { ServiceCollection } from '../../common/serviceCollection.js';
import { SyncDescriptor } from '../../common/descriptors.js';
import { createServiceIdentifier } from '../../common/instantiation.js';

interface IGreeter {
  greet(name: string): string;
}
const IGreeter = createServiceIdentifier<IGreeter>('IGreeter');

class GreeterImpl implements IGreeter {
  greet(name: string): string {
    return `Hello, ${name}!`;
  }
}

describe('ServiceCollection', () => {
  it('should register and resolve an instance', () => {
    const sc = new ServiceCollection();
    sc.set(IGreeter, new GreeterImpl());
    expect(sc.get(IGreeter)).toBeInstanceOf(GreeterImpl);
    expect(sc.has(IGreeter)).toBe(true);
  });

  it('should register a SyncDescriptor', () => {
    const sc = new ServiceCollection();
    sc.set(IGreeter, new SyncDescriptor(GreeterImpl));
    const entry = sc.get(IGreeter);
    expect(entry).toBeInstanceOf(SyncDescriptor);
  });

  it('should report false for unregistered services', () => {
    const sc = new ServiceCollection();
    expect(sc.has(IGreeter)).toBe(false);
  });

  it('should accept initial entries in constructor', () => {
    const sc = new ServiceCollection([IGreeter, new GreeterImpl()]);
    expect(sc.has(IGreeter)).toBe(true);
  });
});
