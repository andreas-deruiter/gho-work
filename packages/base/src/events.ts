/**
 * VS Code-inspired Event system.
 * Lightweight typed event emitter with Disposable support.
 */

export interface IDisposable {
  dispose(): void;
}

export interface Event<T> {
  (listener: (e: T) => void): IDisposable;
}

export class Emitter<T> implements IDisposable {
  private listeners: Set<(e: T) => void> = new Set();
  private _disposed = false;

  get event(): Event<T> {
    return (listener: (e: T) => void): IDisposable => {
      if (this._disposed) {
        return { dispose: () => {} };
      }
      this.listeners.add(listener);
      return {
        dispose: () => {
          this.listeners.delete(listener);
        },
      };
    };
  }

  fire(event: T): void {
    if (this._disposed) return;
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error('Error in event listener:', e);
      }
    }
  }

  dispose(): void {
    this._disposed = true;
    this.listeners.clear();
  }
}

/**
 * Collects disposables for batch disposal.
 */
export class DisposableStore implements IDisposable {
  private disposables: IDisposable[] = [];

  add<T extends IDisposable>(disposable: T): T {
    this.disposables.push(disposable);
    return disposable;
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
