import { describe, it, expect } from 'vitest';
import { ServiceCollection, createServiceIdentifier } from '../../index.js';

interface IGreeter {
  greet(name: string): string;
}

const IGreeter = createServiceIdentifier<IGreeter>('IGreeter');

class MockGreeter implements IGreeter {
  greet(name: string): string {
    return `Hello, ${name}!`;
  }
}

describe('ServiceCollection', () => {
  it('should register and resolve a service', () => {
    const container = new ServiceCollection();
    container.register(IGreeter, new MockGreeter());
    const greeter = container.get(IGreeter);
    expect(greeter.greet('World')).toBe('Hello, World!');
  });

  it('should throw when service is not registered', () => {
    const container = new ServiceCollection();
    expect(() => container.get(IGreeter)).toThrow('Service not registered: IGreeter');
  });

  it('should report whether a service is registered', () => {
    const container = new ServiceCollection();
    expect(container.has(IGreeter)).toBe(false);
    container.register(IGreeter, new MockGreeter());
    expect(container.has(IGreeter)).toBe(true);
  });
});
