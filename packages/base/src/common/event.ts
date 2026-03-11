/**
 * Typed event system — adapted from VS Code's event.ts.
 * @see references/vscode/src/vs/base/common/event.ts
 */
import { IDisposable } from './lifecycle.js';

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
    if (this._disposed) {
      return;
    }
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

// Event composition utilities — map and filter now, more added in Task 6
export namespace Event {
  export function map<I, O>(event: Event<I>, fn: (i: I) => O): Event<O> {
    return (listener: (e: O) => void): IDisposable => {
      return event((e) => listener(fn(e)));
    };
  }

  export function filter<T>(event: Event<T>, predicate: (e: T) => boolean): Event<T> {
    return (listener: (e: T) => void): IDisposable => {
      return event((e) => {
        if (predicate(e)) {
          listener(e);
        }
      });
    };
  }
}
