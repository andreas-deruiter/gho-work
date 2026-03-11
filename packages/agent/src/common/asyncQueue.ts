/**
 * AsyncQueue — bridges callback-based SDK events to AsyncIterable.
 * Push items from callbacks, consume via for-await-of.
 */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private _buffer: T[] = [];
  private _resolve: ((value: IteratorResult<T>) => void) | null = null;
  private _done = false;
  private _error: Error | null = null;

  push(item: T): void {
    if (this._done) {
      return;
    }
    if (this._resolve) {
      const resolve = this._resolve;
      this._resolve = null;
      resolve({ value: item, done: false });
    } else {
      this._buffer.push(item);
    }
  }

  error(err: Error): void {
    this._error = err;
    this._done = true;
    if (this._resolve) {
      const resolve = this._resolve;
      this._resolve = null;
      resolve({ value: undefined as T, done: true });
    }
  }

  end(): void {
    this._done = true;
    if (this._resolve) {
      const resolve = this._resolve;
      this._resolve = null;
      resolve({ value: undefined as T, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this._buffer.length > 0) {
          return Promise.resolve({ value: this._buffer.shift()!, done: false });
        }
        if (this._error) {
          return Promise.reject(this._error);
        }
        if (this._done) {
          return Promise.resolve({ value: undefined as T, done: true });
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          this._resolve = (result) => {
            if (this._error) {
              resolve({ value: undefined as T, done: true });
              return;
            }
            resolve(result);
          };
        });
      },
    };
  }
}
