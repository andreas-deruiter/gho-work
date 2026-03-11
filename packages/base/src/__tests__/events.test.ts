import { describe, it, expect, vi } from 'vitest';
import { Emitter, DisposableStore } from '../events.js';

describe('Emitter', () => {
  it('should fire events to listeners', () => {
    const emitter = new Emitter<string>();
    const listener = vi.fn();

    emitter.event(listener);
    emitter.fire('hello');

    expect(listener).toHaveBeenCalledWith('hello');
  });

  it('should support multiple listeners', () => {
    const emitter = new Emitter<number>();
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    emitter.event(listener1);
    emitter.event(listener2);
    emitter.fire(42);

    expect(listener1).toHaveBeenCalledWith(42);
    expect(listener2).toHaveBeenCalledWith(42);
  });

  it('should stop firing after dispose', () => {
    const emitter = new Emitter<string>();
    const listener = vi.fn();

    emitter.event(listener);
    emitter.dispose();
    emitter.fire('should not arrive');

    expect(listener).not.toHaveBeenCalled();
  });

  it('should allow unsubscribing via returned disposable', () => {
    const emitter = new Emitter<string>();
    const listener = vi.fn();

    const sub = emitter.event(listener);
    emitter.fire('first');
    sub.dispose();
    emitter.fire('second');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('first');
  });
});

describe('DisposableStore', () => {
  it('should dispose all added disposables', () => {
    const store = new DisposableStore();
    const d1 = { dispose: vi.fn() };
    const d2 = { dispose: vi.fn() };

    store.add(d1);
    store.add(d2);
    store.dispose();

    expect(d1.dispose).toHaveBeenCalled();
    expect(d2.dispose).toHaveBeenCalled();
  });
});
