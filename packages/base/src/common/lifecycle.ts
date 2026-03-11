/**
 * Disposable pattern — adapted from VS Code's lifecycle.ts.
 * @see references/vscode/src/vs/base/common/lifecycle.ts
 */

export interface IDisposable {
  dispose(): void;
}

export function isDisposable(thing: unknown): thing is IDisposable {
  return (
    typeof thing === 'object' &&
    thing !== null &&
    typeof (thing as IDisposable).dispose === 'function'
  );
}

export function toDisposable(fn: () => void): IDisposable {
  return { dispose: fn };
}

// Tracking hooks for test infrastructure
let _trackDisposable: ((d: IDisposable) => void) | undefined;
let _markAsDisposed: ((d: IDisposable) => void) | undefined;

/** Called by test infrastructure to enable disposable leak tracking. */
export function setDisposableTracker(tracker: {
  trackDisposable(d: IDisposable): void;
  markAsDisposed(d: IDisposable): void;
} | null): void {
  _trackDisposable = tracker?.trackDisposable;
  _markAsDisposed = tracker?.markAsDisposed;
}

export abstract class Disposable implements IDisposable {
  private readonly _store = new DisposableStore();
  private _isDisposed = false;

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  constructor() {
    _trackDisposable?.(this);
  }

  dispose(): void {
    _markAsDisposed?.(this);
    this._isDisposed = true;
    this._store.dispose();
  }

  protected _register<T extends IDisposable>(disposable: T): T {
    if ((disposable as unknown) === this) {
      throw new Error('Cannot register a disposable on itself');
    }
    return this._store.add(disposable);
  }
}

export class DisposableStore implements IDisposable {
  private readonly _toDispose = new Set<IDisposable>();
  private _isDisposed = false;

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  add<T extends IDisposable>(disposable: T): T {
    if (this._isDisposed) {
      console.warn('Adding to a disposed DisposableStore');
      disposable.dispose();
      return disposable;
    }
    this._toDispose.add(disposable);
    return disposable;
  }

  delete(disposable: IDisposable): void {
    this._toDispose.delete(disposable);
  }

  clear(): void {
    for (const d of this._toDispose) {
      d.dispose();
    }
    this._toDispose.clear();
  }

  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this.clear();
  }
}

export class MutableDisposable<T extends IDisposable> implements IDisposable {
  private _value?: T;
  private _isDisposed = false;

  get value(): T | undefined {
    return this._isDisposed ? undefined : this._value;
  }

  set value(value: T | undefined) {
    if (this._isDisposed) {
      value?.dispose();
      return;
    }
    if (this._value === value) {
      return;
    }
    this._value?.dispose();
    this._value = value;
  }

  clear(): void {
    this.value = undefined;
  }

  dispose(): void {
    this._isDisposed = true;
    this._value?.dispose();
    this._value = undefined;
  }
}
