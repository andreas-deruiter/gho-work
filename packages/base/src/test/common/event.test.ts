import { describe, it, expect, vi } from 'vitest';
import { Emitter, Event } from '../../common/event.js';
import { DisposableStore } from '../../common/lifecycle.js';

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

describe('Event.map', () => {
  it('should transform event payload', () => {
    const emitter = new Emitter<number>();
    const mapped = Event.map(emitter.event, (n) => n * 2);
    const listener = vi.fn();
    mapped(listener);
    emitter.fire(5);
    expect(listener).toHaveBeenCalledWith(10);
    emitter.dispose();
  });
});

describe('Event.filter', () => {
  it('should only fire when predicate is true', () => {
    const emitter = new Emitter<number>();
    const filtered = Event.filter(emitter.event, (n) => n > 5);
    const listener = vi.fn();
    filtered(listener);
    emitter.fire(3);
    emitter.fire(7);
    emitter.fire(2);
    emitter.fire(10);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledWith(7);
    expect(listener).toHaveBeenCalledWith(10);
    emitter.dispose();
  });
});

describe('Event.once', () => {
  it('should fire only once then auto-dispose', () => {
    const emitter = new Emitter<string>();
    const listener = vi.fn();
    Event.once(emitter.event)(listener);
    emitter.fire('first');
    emitter.fire('second');
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith('first');
    emitter.dispose();
  });
});

describe('Event.debounce', () => {
  it('should debounce rapid fires', () => {
    vi.useFakeTimers();
    const emitter = new Emitter<number>();
    const debounced = Event.debounce(emitter.event, 100);
    const listener = vi.fn();
    debounced(listener);

    emitter.fire(1);
    emitter.fire(2);
    emitter.fire(3);

    expect(listener).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(3);

    emitter.dispose();
    vi.useRealTimers();
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
