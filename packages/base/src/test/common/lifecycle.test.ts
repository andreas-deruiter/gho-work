import { describe, it, expect, vi } from 'vitest';
import { Disposable, DisposableStore, MutableDisposable, toDisposable, setDisposableTracker } from '../../common/lifecycle.js';

describe('Disposable', () => {
  it('should dispose registered children', () => {
    const disposed = vi.fn();
    class MyClass extends Disposable {
      constructor() {
        super();
        this._register(toDisposable(disposed));
      }
    }
    const obj = new MyClass();
    expect(obj.isDisposed).toBe(false);
    obj.dispose();
    expect(obj.isDisposed).toBe(true);
    expect(disposed).toHaveBeenCalledOnce();
  });

  it('should throw if registering self', () => {
    class Bad extends Disposable {
      registerSelf(): void {
        this._register(this);
      }
    }
    const obj = new Bad();
    expect(() => obj.registerSelf()).toThrow('Cannot register a disposable on itself');
    obj.dispose();
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

  it('should be safe to dispose twice', () => {
    const store = new DisposableStore();
    const d = { dispose: vi.fn() };
    store.add(d);
    store.dispose();
    store.dispose();
    expect(d.dispose).toHaveBeenCalledOnce();
  });

  it('should warn and dispose when adding to disposed store', () => {
    const store = new DisposableStore();
    store.dispose();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const d = { dispose: vi.fn() };
    store.add(d);
    expect(warn).toHaveBeenCalled();
    expect(d.dispose).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('should clear without disposing the store itself', () => {
    const store = new DisposableStore();
    const d = { dispose: vi.fn() };
    store.add(d);
    store.clear();
    expect(d.dispose).toHaveBeenCalled();
    expect(store.isDisposed).toBe(false);
    const d2 = { dispose: vi.fn() };
    store.add(d2);
    store.dispose();
    expect(d2.dispose).toHaveBeenCalled();
  });
});

describe('MutableDisposable', () => {
  it('should dispose old value when setting new value', () => {
    const mut = new MutableDisposable();
    const d1 = { dispose: vi.fn() };
    const d2 = { dispose: vi.fn() };
    mut.value = d1;
    expect(mut.value).toBe(d1);
    mut.value = d2;
    expect(d1.dispose).toHaveBeenCalled();
    expect(mut.value).toBe(d2);
    mut.dispose();
    expect(d2.dispose).toHaveBeenCalled();
  });

  it('should clear value', () => {
    const mut = new MutableDisposable();
    const d = { dispose: vi.fn() };
    mut.value = d;
    mut.clear();
    expect(d.dispose).toHaveBeenCalled();
    expect(mut.value).toBeUndefined();
    mut.dispose();
  });
});

describe('toDisposable', () => {
  it('should wrap a function as IDisposable', () => {
    const fn = vi.fn();
    const d = toDisposable(fn);
    d.dispose();
    expect(fn).toHaveBeenCalledOnce();
  });
});

describe('setDisposableTracker', () => {
  it('should track disposable creation and disposal', () => {
    const tracked = new Set<any>();
    setDisposableTracker({
      trackDisposable: (d) => tracked.add(d),
      markAsDisposed: (d) => tracked.delete(d),
    });

    class LeakyClass extends Disposable {}
    const leaked = new LeakyClass();
    expect(tracked.size).toBe(1);

    leaked.dispose();
    expect(tracked.size).toBe(0);

    setDisposableTracker(null);
  });
});
