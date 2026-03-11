/**
 * Disposable leak detector for Vitest.
 * Usage:
 *   import { ensureNoDisposablesAreLeakedInTestSuite } from './disposableTracker.js';
 *   describe('MyTest', () => {
 *     ensureNoDisposablesAreLeakedInTestSuite();
 *     // ... tests ...
 *   });
 */
import { beforeEach, afterEach, expect } from 'vitest';
import type { IDisposable } from '../../common/lifecycle.js';
import { setDisposableTracker } from '../../common/lifecycle.js';

const _trackedDisposables = new Set<IDisposable>();

const tracker = {
  trackDisposable(d: IDisposable): void {
    _trackedDisposables.add(d);
  },
  markAsDisposed(d: IDisposable): void {
    _trackedDisposables.delete(d);
  },
};

export function ensureNoDisposablesAreLeakedInTestSuite(): void {
  beforeEach(() => {
    _trackedDisposables.clear();
    setDisposableTracker(tracker);
  });

  afterEach(() => {
    setDisposableTracker(null);
    const leaks = [..._trackedDisposables];
    _trackedDisposables.clear();
    if (leaks.length > 0) {
      const leakInfo = leaks.map((d) => d.constructor.name).join(', ');
      expect.fail(
        `Disposable leak detected! ${leaks.length} disposable(s) not disposed: ${leakInfo}`,
      );
    }
  });
}
