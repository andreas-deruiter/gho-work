# Phase 1: Core Shell and Foundations — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Multi-process architecture works. DI container resolves services with constructor injection. IPC channels are typed and validated. Auth flow completes. SQLite stores and retrieves data. Workbench shell renders with activity bar, sidebar, status bar, and theming.

**Architecture:** VS Code-inspired layered architecture with strict import rules. DI uses parameter decorators for constructor injection (adapted from VS Code's `createDecorator` pattern). IPC uses Electron's contextBridge for Main-Renderer and MessagePort for Renderer-AgentHost. SQLite via better-sqlite3 in main process, exposed to renderer via IPC. All services extend Disposable and follow the `on[Will|Did]VerbNoun` event naming convention.

**Tech Stack:** Electron 35 + TypeScript 5.x + Vite + electron-vite, better-sqlite3 for storage, zod for IPC validation, Vitest for tests.

**Reference skills:** Consult these before implementing each area:
- `@vscode-patterns` — DI (Pattern 1), Events (Pattern 2), Disposables (Pattern 3), IPC (Pattern 5), Widgets (Pattern 6)
- `@sqlite-patterns` — Database setup, migrations, PRAGMAs, schema
- `@electron-hardening` — safeStorage, MessagePort, contextBridge security

---

## File Structure

### packages/base/src/ (reorganized from flat to common/)

```
packages/base/src/
  common/
    lifecycle.ts          # IDisposable, Disposable, DisposableStore, MutableDisposable, toDisposable
    instantiation.ts      # createServiceIdentifier, ServiceIdentifier, getDependencies, IInstantiationService
    serviceCollection.ts  # ServiceCollection (holds instances or SyncDescriptors)
    instantiationService.ts # InstantiationService (resolver, cycle detection)
    descriptors.ts        # SyncDescriptor for lazy instantiation
    event.ts              # Event<T>, Emitter<T>, Event.map/filter/debounce/latch
    types.ts              # Core domain models (moved from src/types.ts)
    uuid.ts               # generateUUID (moved from src/uuid.ts)
    cancellation.ts       # CancellationToken, CancellationTokenSource
    async.ts              # Barrier, RunOnceScheduler, Queue
  test/
    common/
      instantiationService.test.ts  # DI resolution, cycle detection, SyncDescriptor
      lifecycle.test.ts             # Disposable, DisposableStore, MutableDisposable, leak detection
      event.test.ts                 # Emitter, Event composition
      testInstantiationService.ts   # TestInstantiationService helper (reusable)
      disposableTracker.ts          # ensureNoDisposablesAreLeakedInTestSuite() helper
  index.ts                # Barrel re-exports from common/
```

### packages/platform/src/ (new services)

```
packages/platform/src/
  ipc/
    common/
      ipc.ts              # IPC channel definitions, typed message schemas (zod)
      ipcService.ts       # IIPCRenderer, IIPCMain service interfaces
      messagePortChannel.ts # MessagePort protocol wrapper
    node/
      ipcMain.ts          # Electron main process IPC implementation
    browser/
      ipcRenderer.ts      # Renderer-side IPC implementation
  storage/
    common/
      storage.ts          # IStorageService interface + service identifier
    node/
      sqliteStorage.ts    # SQLite implementation (better-sqlite3)
      migrations.ts       # Schema migration framework
      globalSchema.ts     # Global database schema (v0→v1)
      workspaceSchema.ts  # Per-workspace database schema (v0→v1)
  auth/
    common/
      auth.ts             # IAuthService interface, AuthState types
    node/
      authService.ts      # GitHub OAuth PKCE implementation
      secureStorage.ts    # ISecureStorageService (safeStorage wrapper)
  files/
    common/
      files.ts            # IFileService interface
    node/
      fileService.ts      # Node.js fs implementation
  index.ts                # Barrel re-exports
```

### packages/ui/src/ (workbench shell)

```
packages/ui/src/
  browser/
    dom.ts                # h() DOM helper, addDisposableListener (uses document)
    widget.ts             # Widget base class (extends Disposable, uses DOM)
    theme.ts              # ThemeService, CSS custom properties (uses window/document)
    workbench.ts          # Workbench layout shell (refactored)
    activityBar.ts        # Activity bar with icon buttons
    sidebar.ts            # Sidebar with panel switching
    statusBar.ts          # Status bar with segments
    chatPanel.ts          # Chat panel (refactored from src/chat-panel.ts)
    keyboardShortcuts.ts  # Keyboard navigation manager
  test/
    browser/
      dom.test.ts         # h() helper tests (jsdom)
      workbench.test.ts   # Workbench rendering tests (jsdom)
      activityBar.test.ts # Activity bar tests
  index.ts                # Barrel re-exports
```

Note: `dom.ts`, `widget.ts`, and `theme.ts` use DOM APIs (`document`, `window`) so they belong in `browser/`, not `common/`. Per CLAUDE.md: "`common/` — Pure TypeScript, no DOM, no Node."

### packages/electron/src/ (multi-process)

```
packages/electron/src/
  main/
    mainProcess.ts        # Refactored from src/main-process.ts
    agentHostManager.ts   # Spawns Agent Host utility process, MessagePort handoff
    windowManager.ts      # BrowserWindow creation, lifecycle, tray
  preload/
    preload.ts            # Refactored from src/preload.ts
  agentHost/
    agentHostMain.ts      # Agent Host entry point (utility process)
    agentHostIpc.ts       # MessagePort handler in Agent Host
  index.ts
```

### New dependencies to install

```
npm install better-sqlite3 zod
npm install -D @types/better-sqlite3 @electron/rebuild
```

---

## Chunk 1: DI System + Disposable Foundation

Tasks 1-6 establish the dependency injection system with constructor injection, the enhanced Disposable hierarchy, and test infrastructure. Everything else in Phase 1 depends on this.

### Task 1: Reorganize packages/base into common/ subdirectory

Move existing files into the `common/` subdirectory. This sets up the environment separation convention. No behavior changes.

**Files:**
- Move: `packages/base/src/di.ts` → `packages/base/src/common/lifecycle.ts` (disposables) + `packages/base/src/common/instantiation.ts` (DI identifiers)
- Move: `packages/base/src/events.ts` → `packages/base/src/common/event.ts`
- Move: `packages/base/src/types.ts` → `packages/base/src/common/types.ts`
- Move: `packages/base/src/uuid.ts` → `packages/base/src/common/uuid.ts`
- Modify: `packages/base/src/index.ts` (update re-exports)
- Move: `packages/base/src/__tests__/` → `packages/base/src/test/common/`

- [ ] **Step 1: Create common/ directory and move files**

```bash
mkdir -p packages/base/src/common
mkdir -p packages/base/src/test/common
```

- [ ] **Step 2: Split di.ts — extract disposables into lifecycle.ts**

Create `packages/base/src/common/lifecycle.ts`:
```typescript
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

export abstract class Disposable implements IDisposable {
  private readonly _store = new DisposableStore();
  private _isDisposed = false;

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  dispose(): void {
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
```

- [ ] **Step 3: Create instantiation.ts with decorator-based service identifiers**

Create `packages/base/src/common/instantiation.ts`:
```typescript
/**
 * Service identifier system with parameter decorator support.
 * Adapted from VS Code's createDecorator pattern.
 * @see references/vscode/src/vs/platform/instantiation/common/instantiation.ts
 */

/**
 * A ServiceIdentifier is both a branded type and a parameter decorator.
 * Usage:
 *   export const IMyService = createServiceIdentifier<IMyService>('IMyService');
 *   export interface IMyService { method(): void; }
 *
 *   class Consumer {
 *     constructor(@IMyService private myService: IMyService) {}
 *   }
 */
export interface ServiceIdentifier<T> {
  (...args: any[]): void; // parameter decorator signature
  readonly _brand: T;
  readonly id: string;
}

// Global registry to detect duplicate IDs
const _serviceIds = new Map<string, ServiceIdentifier<any>>();

// Dependency metadata stored per constructor
const DI_DEPENDENCIES = new Map<Function, { id: ServiceIdentifier<any>; index: number }[]>();

export function createServiceIdentifier<T>(serviceId: string): ServiceIdentifier<T> {
  if (_serviceIds.has(serviceId)) {
    return _serviceIds.get(serviceId)! as ServiceIdentifier<T>;
  }

  const id = function (target: any, _key: string | undefined, index: number): void {
    const deps = DI_DEPENDENCIES.get(target) ?? [];
    deps.push({ id: id as any, index });
    DI_DEPENDENCIES.set(target, deps);
  } as unknown as ServiceIdentifier<T>;

  (id as any).id = serviceId;
  _serviceIds.set(serviceId, id);
  return id;
}

export function getDependencies(ctor: Function): { id: ServiceIdentifier<any>; index: number }[] {
  return (DI_DEPENDENCIES.get(ctor) ?? []).sort((a, b) => a.index - b.index);
}

/**
 * IInstantiationService — the DI resolver itself is a service.
 */
export interface IInstantiationService {
  createInstance<T>(ctor: new (...args: any[]) => T, ...args: any[]): T;
  getService<T>(id: ServiceIdentifier<T>): T;
}

export const IInstantiationService = createServiceIdentifier<IInstantiationService>(
  'IInstantiationService',
);
```

- [ ] **Step 4: Move events.ts → event.ts, types.ts, uuid.ts into common/**

```bash
cp packages/base/src/events.ts packages/base/src/common/event.ts
cp packages/base/src/types.ts packages/base/src/common/types.ts
cp packages/base/src/uuid.ts packages/base/src/common/uuid.ts
```

Edit `packages/base/src/common/event.ts`:
- Remove the `IDisposable` and `DisposableStore` definitions (now in lifecycle.ts)
- Import them from `./lifecycle.js` instead
- Keep `Event<T>` and `Emitter<T>`

```typescript
/**
 * Typed event system — adapted from VS Code's event.ts.
 * @see references/vscode/src/vs/base/common/event.ts
 */
import { IDisposable, DisposableStore } from './lifecycle.js';

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

// Event composition utilities — added in Task 7
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
```

- [ ] **Step 5: Update barrel index.ts**

Rewrite `packages/base/src/index.ts`:
```typescript
export * from './common/lifecycle.js';
export * from './common/instantiation.js';
export * from './common/event.js';
export * from './common/types.js';
export * from './common/uuid.js';
```

- [ ] **Step 6: Move tests and update imports**

```bash
cp packages/base/src/__tests__/di.test.ts packages/base/src/test/common/serviceCollection.test.ts
cp packages/base/src/__tests__/events.test.ts packages/base/src/test/common/event.test.ts
rm -rf packages/base/src/__tests__
```

Update test imports to use the new barrel export paths. Tests import from `../../index.js` (or `@gho-work/base` depending on config).

Update `packages/base/src/test/common/serviceCollection.test.ts` imports:
```typescript
import { describe, it, expect } from 'vitest';
import { createServiceIdentifier } from '../../common/instantiation.js';

// Replace createServiceId with createServiceIdentifier
// Replace ServiceCollection tests (ServiceCollection now in serviceCollection.ts)
```

Update `packages/base/src/test/common/event.test.ts` imports:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { Emitter } from '../../common/event.js';
import { DisposableStore } from '../../common/lifecycle.js';
```

- [ ] **Step 7: Delete old files**

```bash
rm packages/base/src/di.ts packages/base/src/events.ts packages/base/src/types.ts packages/base/src/uuid.ts
```

- [ ] **Step 8: Update all downstream imports**

Packages that import from `@gho-work/base` use the barrel export, so no changes needed in other packages as long as the barrel re-exports everything.

Verify: search for any direct deep imports.

```bash
grep -r "from.*@gho-work/base/" packages/ apps/ --include="*.ts" | grep -v node_modules | grep -v dist
```

Fix any deep imports to use the barrel `@gho-work/base`.

- [ ] **Step 9: Verify build passes**

```bash
npx turbo build
```

Expected: all 7 packages compile cleanly.

- [ ] **Step 10: Verify tests pass**

```bash
npx vitest run
```

Expected: all existing tests pass (some may need import fixes).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor: reorganize packages/base into common/ subdirectory

Move di.ts, events.ts, types.ts, uuid.ts into common/ subdirectory.
Split di.ts into lifecycle.ts (disposables) and instantiation.ts (DI identifiers).
Add Disposable base class, MutableDisposable, toDisposable.
Introduce createServiceIdentifier with parameter decorator support."
```

---

### Task 2: ServiceCollection + SyncDescriptor

**Files:**
- Create: `packages/base/src/common/serviceCollection.ts`
- Create: `packages/base/src/common/descriptors.ts`
- Modify: `packages/base/src/index.ts`

- [ ] **Step 1: Write failing test for ServiceCollection**

Create `packages/base/src/test/common/serviceCollection.test.ts` (replace existing):
```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run packages/base/src/test/common/serviceCollection.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement ServiceCollection and SyncDescriptor**

Create `packages/base/src/common/descriptors.ts`:
```typescript
/**
 * SyncDescriptor — wraps a constructor for lazy instantiation.
 * @see references/vscode/src/vs/platform/instantiation/common/descriptors.ts
 */
export class SyncDescriptor<T> {
  constructor(
    public readonly ctor: new (...args: any[]) => T,
    public readonly staticArguments: any[] = [],
    public readonly supportsDelayedInstantiation: boolean = false,
  ) {}
}
```

Create `packages/base/src/common/serviceCollection.ts`:
```typescript
/**
 * Service collection — a map of service identifiers to instances or descriptors.
 * @see references/vscode/src/vs/platform/instantiation/common/serviceCollection.ts
 */
import type { ServiceIdentifier } from './instantiation.js';
import type { SyncDescriptor } from './descriptors.js';

export class ServiceCollection {
  private readonly _entries = new Map<string, any>();

  constructor(...entries: [ServiceIdentifier<any>, any][]) {
    for (const [id, instanceOrDescriptor] of entries) {
      this.set(id, instanceOrDescriptor);
    }
  }

  set<T>(id: ServiceIdentifier<T>, instanceOrDescriptor: T | SyncDescriptor<T>): void {
    this._entries.set(id.id, instanceOrDescriptor);
  }

  get<T>(id: ServiceIdentifier<T>): T | SyncDescriptor<T> {
    return this._entries.get(id.id);
  }

  has(id: ServiceIdentifier<any>): boolean {
    return this._entries.has(id.id);
  }
}
```

- [ ] **Step 4: Update barrel exports**

Add to `packages/base/src/index.ts`:
```typescript
export * from './common/serviceCollection.js';
export * from './common/descriptors.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run packages/base/src/test/common/serviceCollection.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/base/src/common/serviceCollection.ts packages/base/src/common/descriptors.ts packages/base/src/test/common/serviceCollection.test.ts packages/base/src/index.ts
git commit -m "feat(base): add ServiceCollection and SyncDescriptor"
```

---

### Task 3: InstantiationService with constructor injection and cycle detection

**Files:**
- Create: `packages/base/src/common/instantiationService.ts`
- Create: `packages/base/src/test/common/instantiationService.test.ts`
- Modify: `packages/base/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/base/src/test/common/instantiationService.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { InstantiationService } from '../../common/instantiationService.js';
import { ServiceCollection } from '../../common/serviceCollection.js';
import { SyncDescriptor } from '../../common/descriptors.js';
import { createServiceIdentifier } from '../../common/instantiation.js';

// --- Test services ---

interface IServiceA {
  a(): string;
}
const IServiceA = createServiceIdentifier<IServiceA>('test.IServiceA');

interface IServiceB {
  b(): string;
}
const IServiceB = createServiceIdentifier<IServiceB>('test.IServiceB');

interface IServiceC {
  c(): string;
}
const IServiceC = createServiceIdentifier<IServiceC>('test.IServiceC');

class ServiceA implements IServiceA {
  a(): string {
    return 'A';
  }
}

class ServiceB implements IServiceB {
  constructor(@IServiceA private readonly serviceA: IServiceA) {}
  b(): string {
    return `B+${this.serviceA.a()}`;
  }
}

class ServiceC implements IServiceC {
  constructor(
    @IServiceA private readonly serviceA: IServiceA,
    @IServiceB private readonly serviceB: IServiceB,
  ) {}
  c(): string {
    return `C+${this.serviceA.a()}+${this.serviceB.b()}`;
  }
}

describe('InstantiationService', () => {
  it('should resolve a service with no dependencies', () => {
    const sc = new ServiceCollection([IServiceA, new SyncDescriptor(ServiceA)]);
    const inst = new InstantiationService(sc);
    const a = inst.getService(IServiceA);
    expect(a.a()).toBe('A');
  });

  it('should resolve a chain of 2 services', () => {
    const sc = new ServiceCollection(
      [IServiceA, new SyncDescriptor(ServiceA)],
      [IServiceB, new SyncDescriptor(ServiceB)],
    );
    const inst = new InstantiationService(sc);
    const b = inst.getService(IServiceB);
    expect(b.b()).toBe('B+A');
  });

  it('should resolve a chain of 3+ services', () => {
    const sc = new ServiceCollection(
      [IServiceA, new SyncDescriptor(ServiceA)],
      [IServiceB, new SyncDescriptor(ServiceB)],
      [IServiceC, new SyncDescriptor(ServiceC)],
    );
    const inst = new InstantiationService(sc);
    const c = inst.getService(IServiceC);
    expect(c.c()).toBe('C+A+B+A');
  });

  it('should cache resolved instances', () => {
    const sc = new ServiceCollection([IServiceA, new SyncDescriptor(ServiceA)]);
    const inst = new InstantiationService(sc);
    const a1 = inst.getService(IServiceA);
    const a2 = inst.getService(IServiceA);
    expect(a1).toBe(a2);
  });

  it('should detect circular dependencies', () => {
    // CycleA depends on CycleB, CycleB depends on CycleA
    interface ICycleA { x(): void; }
    const ICycleA = createServiceIdentifier<ICycleA>('test.ICycleA');
    interface ICycleB { y(): void; }
    const ICycleB = createServiceIdentifier<ICycleB>('test.ICycleB');

    class CycleA implements ICycleA {
      constructor(@ICycleB private b: ICycleB) {}
      x(): void {}
    }
    class CycleB implements ICycleB {
      constructor(@ICycleA private a: ICycleA) {}
      y(): void {}
    }

    const sc = new ServiceCollection(
      [ICycleA, new SyncDescriptor(CycleA)],
      [ICycleB, new SyncDescriptor(CycleB)],
    );
    const inst = new InstantiationService(sc);
    expect(() => inst.getService(ICycleA)).toThrow(/[Cc]ircular/);
  });

  it('should resolve pre-registered instances directly', () => {
    const instance = new ServiceA();
    const sc = new ServiceCollection([IServiceA, instance]);
    const inst = new InstantiationService(sc);
    expect(inst.getService(IServiceA)).toBe(instance);
  });

  it('should createInstance with static args + injected services', () => {
    const sc = new ServiceCollection([IServiceA, new SyncDescriptor(ServiceA)]);
    const inst = new InstantiationService(sc);

    class Consumer {
      constructor(
        public readonly label: string,
        @IServiceA public readonly serviceA: IServiceA,
      ) {}
    }

    const consumer = inst.createInstance(Consumer, 'test-label');
    expect(consumer.label).toBe('test-label');
    expect(consumer.serviceA.a()).toBe('A');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run packages/base/src/test/common/instantiationService.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement InstantiationService**

Create `packages/base/src/common/instantiationService.ts`:
```typescript
/**
 * InstantiationService — resolves services via constructor injection.
 * @see references/vscode/src/vs/platform/instantiation/common/instantiationService.ts
 */
import { getDependencies, IInstantiationService } from './instantiation.js';
import type { ServiceIdentifier } from './instantiation.js';
import { ServiceCollection } from './serviceCollection.js';
import { SyncDescriptor } from './descriptors.js';

export class InstantiationService implements IInstantiationService {
  private readonly _activeInstantiations = new Set<string>();

  constructor(private readonly _services: ServiceCollection) {
    this._services.set(IInstantiationService, this);
  }

  createInstance<T>(ctor: new (...args: any[]) => T, ...staticArgs: any[]): T {
    const deps = getDependencies(ctor);

    // Validate: service dependencies must come after static args (VS Code convention)
    for (const dep of deps) {
      if (dep.index < staticArgs.length) {
        throw new Error(
          `Service dependency @${dep.id.id} at parameter index ${dep.index} conflicts with static argument. ` +
          `Static args must precede all @Service parameters.`,
        );
      }
    }

    const serviceArgs = deps.map((d) => this._getOrCreateServiceInstance(d.id));

    // Static args come first, then injected services (matching VS Code convention)
    const allArgs = [...staticArgs, ...serviceArgs];
    return new ctor(...allArgs);
  }

  getService<T>(id: ServiceIdentifier<T>): T {
    return this._getOrCreateServiceInstance(id);
  }

  private _getOrCreateServiceInstance<T>(id: ServiceIdentifier<T>): T {
    const entry = this._services.get(id);
    if (entry === undefined) {
      throw new Error(`Service not registered: ${id.id}`);
    }
    if (entry instanceof SyncDescriptor) {
      return this._createAndCacheServiceInstance(id, entry);
    }
    return entry as T;
  }

  private _createAndCacheServiceInstance<T>(
    id: ServiceIdentifier<T>,
    desc: SyncDescriptor<T>,
  ): T {
    if (this._activeInstantiations.has(id.id)) {
      throw new Error(
        `Circular dependency detected: ${id.id} (chain: ${[...this._activeInstantiations].join(' -> ')} -> ${id.id})`,
      );
    }

    this._activeInstantiations.add(id.id);
    try {
      const instance = this.createInstance(desc.ctor, ...desc.staticArguments);
      this._services.set(id, instance);
      return instance;
    } finally {
      this._activeInstantiations.delete(id.id);
    }
  }
}
```

- [ ] **Step 4: Update barrel exports**

Add to `packages/base/src/index.ts`:
```typescript
export * from './common/instantiationService.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run packages/base/src/test/common/instantiationService.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/base/src/common/instantiationService.ts packages/base/src/test/common/instantiationService.test.ts packages/base/src/index.ts
git commit -m "feat(base): add InstantiationService with constructor injection and cycle detection"
```

---

### Task 4: Test infrastructure — TestInstantiationService + disposable leak detector

**Files:**
- Create: `packages/base/src/test/common/testInstantiationService.ts`
- Create: `packages/base/src/test/common/disposableTracker.ts`
- Create: `packages/base/src/test/common/lifecycle.test.ts`

- [ ] **Step 1: Write the TestInstantiationService helper**

Create `packages/base/src/test/common/testInstantiationService.ts`:
```typescript
/**
 * Test helper — simplified DI container for unit tests.
 * Adapted from VS Code's instantiationServiceMock.ts.
 * @see references/vscode/src/vs/platform/instantiation/test/common/instantiationServiceMock.ts
 */
import { InstantiationService } from '../../common/instantiationService.js';
import { ServiceCollection } from '../../common/serviceCollection.js';
import type { ServiceIdentifier } from '../../common/instantiation.js';
import type { SyncDescriptor } from '../../common/descriptors.js';

export class TestInstantiationService extends InstantiationService {
  constructor(services?: ServiceCollection) {
    super(services ?? new ServiceCollection());
  }

  /**
   * Register a service instance (or stub) for tests.
   */
  set<T>(id: ServiceIdentifier<T>, instance: T): T {
    (this as any)._services.set(id, instance);
    return instance;
  }

  /**
   * Register a partial stub — returns a Proxy that throws on unimplemented methods.
   */
  stub<T extends object>(id: ServiceIdentifier<T>, partial: Partial<T>): T {
    const proxy = new Proxy(partial as T, {
      get(target: any, prop: string) {
        if (prop in target) {
          return target[prop];
        }
        return () => {
          throw new Error(`Stubbed method not implemented: ${id.id}.${prop}`);
        };
      },
    });
    this.set(id, proxy);
    return proxy;
  }
}
```

- [ ] **Step 2: Write disposable leak detector**

Create `packages/base/src/test/common/disposableTracker.ts`:
```typescript
/**
 * Disposable leak detector for Vitest.
 * Adapted from VS Code's ensureNoDisposablesAreLeakedInTestSuite().
 *
 * Usage in test files:
 *   import { ensureNoDisposablesAreLeakedInTestSuite } from './disposableTracker.js';
 *   describe('MyTest', () => {
 *     ensureNoDisposablesAreLeakedInTestSuite();
 *     // ... tests ...
 *   });
 */
import { afterEach, expect } from 'vitest';
import type { IDisposable } from '../../common/lifecycle.js';

let _tracking = false;
let _trackedDisposables: Set<IDisposable> = new Set();

export function trackDisposable(disposable: IDisposable): void {
  if (_tracking) {
    _trackedDisposables.add(disposable);
  }
}

export function markAsDisposed(disposable: IDisposable): void {
  _trackedDisposables.delete(disposable);
}

/**
 * Call in a describe() block. After each test, verifies all tracked disposables
 * have been disposed. Throws if any leaks are detected.
 */
export function ensureNoDisposablesAreLeakedInTestSuite(): void {
  let beforeCount: number;

  afterEach(() => {
    const leaks = [..._trackedDisposables];
    if (leaks.length > 0) {
      _trackedDisposables.clear();
      const leakInfo = leaks.map((d) => d.constructor.name).join(', ');
      expect.fail(
        `Disposable leak detected! ${leaks.length} disposable(s) not disposed: ${leakInfo}`,
      );
    }
  });
}

export function startTracking(): void {
  _tracking = true;
  _trackedDisposables.clear();
}

export function stopTracking(): void {
  _tracking = false;
  _trackedDisposables.clear();
}
```

- [ ] **Step 2b: Integrate leak detector into Disposable base class**

Modify `packages/base/src/common/lifecycle.ts` — add tracking hooks:

```typescript
// At the top of the file, import tracking hooks (soft dependency — no-ops if not set)
let _trackDisposable: ((d: IDisposable) => void) | undefined;
let _markAsDisposed: ((d: IDisposable) => void) | undefined;

/** Called by test infrastructure to enable tracking. */
export function setDisposableTracker(tracker: {
  trackDisposable(d: IDisposable): void;
  markAsDisposed(d: IDisposable): void;
} | null): void {
  _trackDisposable = tracker?.trackDisposable;
  _markAsDisposed = tracker?.markAsDisposed;
}

// In the Disposable class constructor, add:
export abstract class Disposable implements IDisposable {
  // ... existing fields ...

  constructor() {
    _trackDisposable?.(this);
  }

  dispose(): void {
    _markAsDisposed?.(this);
    this._isDisposed = true;
    this._store.dispose();
  }
  // ... rest unchanged ...
}
```

Update `packages/base/src/test/common/disposableTracker.ts` to use `setDisposableTracker`:

```typescript
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
```

- [ ] **Step 3: Write lifecycle tests (Disposable, MutableDisposable, leak detection)**

Create `packages/base/src/test/common/lifecycle.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../common/lifecycle.js';

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

    // Can still add after clear
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

describe('ensureNoDisposablesAreLeakedInTestSuite', () => {
  // This test verifies the leak detector works by deliberately leaking
  it('should detect leaked disposables', () => {
    const { setDisposableTracker } = await import('../../common/lifecycle.js');
    const tracked = new Set<any>();
    setDisposableTracker({
      trackDisposable: (d) => tracked.add(d),
      markAsDisposed: (d) => tracked.delete(d),
    });

    class LeakyClass extends Disposable {}
    const leaked = new LeakyClass(); // created but never disposed

    expect(tracked.size).toBe(1);

    leaked.dispose(); // clean up
    expect(tracked.size).toBe(0);

    setDisposableTracker(null);
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run packages/base/src/test/common/lifecycle.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Write test for TestInstantiationService**

Add to the end of `packages/base/src/test/common/instantiationService.test.ts`:
```typescript
import { TestInstantiationService } from './testInstantiationService.js';

describe('TestInstantiationService', () => {
  it('should stub services with partial implementations', () => {
    const testInst = new TestInstantiationService();
    testInst.stub(IServiceA, { a: () => 'mocked-A' });
    const a = testInst.getService(IServiceA);
    expect(a.a()).toBe('mocked-A');
  });

  it('should throw on unimplemented stub methods', () => {
    const testInst = new TestInstantiationService();
    testInst.stub<IServiceA>(IServiceA, {});
    const a = testInst.getService(IServiceA);
    expect(() => a.a()).toThrow('Stubbed method not implemented');
  });

  it('should support createInstance with stubs', () => {
    const testInst = new TestInstantiationService();
    testInst.stub(IServiceA, { a: () => 'stub-A' });

    class Consumer {
      constructor(@IServiceA public readonly svc: IServiceA) {}
    }

    const consumer = testInst.createInstance(Consumer);
    expect(consumer.svc.a()).toBe('stub-A');
  });
});
```

- [ ] **Step 6: Run all base tests**

```bash
npx vitest run packages/base/
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/base/src/test/
git commit -m "feat(base): add TestInstantiationService and disposable leak detector

TestInstantiationService supports stub() and set() for unit testing.
ensureNoDisposablesAreLeakedInTestSuite() detects undisposed resources.
Comprehensive lifecycle tests for Disposable, DisposableStore, MutableDisposable."
```

---

### Task 5: Update downstream packages for new DI API

All packages that use the old `ServiceCollection` or `createServiceId` API need updating.

**Files:**
- Modify: `packages/platform/src/ipc.ts` — update import from `createServiceId` → `createServiceIdentifier`
- Modify: `packages/agent/src/interfaces.ts` — same
- Modify: `packages/connectors/src/index.ts` — same
- Modify: `packages/electron/src/main-process.ts` — use new ServiceCollection API
- Modify: all test files in other packages

- [ ] **Step 1: Update all createServiceId → createServiceIdentifier**

```bash
# Find all usages
grep -rn "createServiceId" packages/ apps/ --include="*.ts" | grep -v node_modules | grep -v dist | grep -v "createServiceIdentifier"
```

Replace `createServiceId` with `createServiceIdentifier` in each file. Update `ServiceCollection` usage: the new API uses `set()` instead of `register()`, and `get()` returns `T | SyncDescriptor<T>`.

For `packages/electron/src/main-process.ts`:
- `services.register(...)` → `services.set(...)`
- **Important:** `ServiceCollection.get()` now returns `T | SyncDescriptor<T>`. Direct callers should switch to `InstantiationService.getService()` which always returns `T`. Refactor `createMainProcess()` to create an `InstantiationService` wrapping the `ServiceCollection`, then use `inst.getService(IAgentService)` instead of `services.get(IAgentService)`. This ensures SyncDescriptors are properly resolved.
- The `ServiceCollection` should only be accessed directly for registration; service retrieval should go through `InstantiationService`.

- [ ] **Step 2: Build and test**

```bash
npx turbo build && npx vitest run
```

Expected: all packages build, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: update all packages to use new DI API (createServiceIdentifier, ServiceCollection.set)"
```

---

### Task 6: Event composition utilities

Enhance the Event system with `map`, `filter`, `debounce`, `latch`, and `once` utilities.

**Files:**
- Modify: `packages/base/src/common/event.ts`
- Modify: `packages/base/src/test/common/event.test.ts`

- [ ] **Step 1: Write failing tests for Event composition**

Add to `packages/base/src/test/common/event.test.ts`:
```typescript
import { Emitter, Event } from '../../common/event.js';
import { DisposableStore } from '../../common/lifecycle.js';

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
  it('should debounce rapid fires', async () => {
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
    expect(listener).toHaveBeenCalledWith(3); // last value wins

    emitter.dispose();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run to verify tests fail (Event.once, Event.debounce not implemented)**

```bash
npx vitest run packages/base/src/test/common/event.test.ts
```

- [ ] **Step 3: Implement Event.once and Event.debounce**

Add to `Event` namespace in `packages/base/src/common/event.ts`:
```typescript
export function once<T>(event: Event<T>): Event<T> {
  return (listener: (e: T) => void): IDisposable => {
    let didFire = false;
    const sub = event((e) => {
      if (!didFire) {
        didFire = true;
        sub.dispose();
        listener(e);
      }
    });
    return sub;
  };
}

export function debounce<T>(event: Event<T>, delayMs: number): Event<T> {
  return (listener: (e: T) => void): IDisposable => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastValue: T;
    const sub = event((e) => {
      lastValue = e;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = undefined;
        listener(lastValue);
      }, delayMs);
    });
    return {
      dispose: () => {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        sub.dispose();
      },
    };
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run packages/base/src/test/common/event.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/base/src/common/event.ts packages/base/src/test/common/event.test.ts
git commit -m "feat(base): add Event composition utilities (map, filter, once, debounce)"
```

---

**End of Chunk 1.** At this point:
- DI system with constructor injection and cycle detection is complete
- Enhanced Disposable hierarchy (Disposable base class, DisposableStore, MutableDisposable)
- ServiceCollection + SyncDescriptor for lazy instantiation
- TestInstantiationService for unit test stubbing
- Disposable leak detector for test safety
- Event composition (map, filter, once)
- All downstream packages updated to new API

---

## Chunk 2: IPC Infrastructure + Multi-Process Bootstrap

Tasks 7-10 establish typed IPC channels with zod validation, MessagePort protocol for Agent Host communication, and the utility process lifecycle.

### Task 7: Typed IPC channels with zod validation

Replace the loosely-typed IPC channel definitions with zod schemas for runtime validation.

**Files:**
- Create: `packages/platform/src/ipc/common/ipc.ts`
- Create: `packages/platform/src/ipc/common/ipcService.ts`
- Delete: `packages/platform/src/ipc.ts` (replaced)
- Modify: `packages/platform/src/index.ts`
- Create: `packages/platform/src/ipc/test/ipc.test.ts`

**Dependencies:** `npm install zod` (in root, available to all packages)

- [ ] **Step 1: Install zod**

```bash
npm install zod -w packages/platform
```

- [ ] **Step 2: Write failing test for typed IPC schemas**

Create `packages/platform/src/ipc/test/ipc.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { IPC_CHANNELS, SendMessageRequestSchema, AgentEventSchema } from '../common/ipc.js';

describe('IPC Channel Schemas', () => {
  it('should validate SendMessageRequest', () => {
    const valid = { conversationId: 'conv-1', content: 'hello' };
    expect(SendMessageRequestSchema.parse(valid)).toEqual(valid);
  });

  it('should reject invalid SendMessageRequest', () => {
    expect(() => SendMessageRequestSchema.parse({ content: 123 })).toThrow();
  });

  it('should validate AgentEvent text_delta', () => {
    const event = { type: 'text_delta', content: 'hello' };
    expect(AgentEventSchema.parse(event)).toEqual(event);
  });

  it('should validate AgentEvent tool_call_start', () => {
    const event = {
      type: 'tool_call_start',
      toolCall: {
        id: 'tc-1',
        messageId: 'msg-1',
        toolName: 'read_file',
        serverName: 'builtin',
        arguments: { path: '/tmp/test' },
        permission: 'pending',
        status: 'pending',
        timestamp: Date.now(),
      },
    };
    expect(AgentEventSchema.parse(event)).toBeTruthy();
  });

  it('should export all channel name constants', () => {
    expect(IPC_CHANNELS.AGENT_SEND_MESSAGE).toBe('agent:send-message');
    expect(IPC_CHANNELS.AGENT_EVENT).toBe('agent:event');
    expect(IPC_CHANNELS.AUTH_LOGIN).toBe('auth:login');
    expect(IPC_CHANNELS.STORAGE_GET).toBe('storage:get');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
npx vitest run packages/platform/src/ipc/test/ipc.test.ts
```

- [ ] **Step 4: Implement typed IPC channels**

Note: These zod schemas MUST stay aligned with the TypeScript types in `packages/base/src/common/types.ts`. The schemas serve as runtime validation at the IPC boundary; the types in `types.ts` are the source of truth for the data model. When adding new event types or modifying existing ones, update both files.

Create `packages/platform/src/ipc/common/ipc.ts`:
```typescript
/**
 * IPC channel definitions with zod schemas for runtime validation.
 * All IPC messages pass through these schemas for type safety at the boundary.
 */
import { z } from 'zod';

// --- Channel Names ---

export const IPC_CHANNELS = {
  // Agent (Renderer -> Main -> Agent Host)
  AGENT_SEND_MESSAGE: 'agent:send-message',
  AGENT_CANCEL: 'agent:cancel',
  AGENT_EVENT: 'agent:event',

  // Conversations
  CONVERSATION_LIST: 'conversation:list',
  CONVERSATION_CREATE: 'conversation:create',

  // Auth
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_STATE: 'auth:state',
  AUTH_STATE_CHANGED: 'auth:state-changed',

  // Storage
  STORAGE_GET: 'storage:get',
  STORAGE_SET: 'storage:set',

  // MessagePort handshake
  PORT_AGENT_HOST: 'port:agent-host',
} as const;

// --- Schemas ---

export const SendMessageRequestSchema = z.object({
  conversationId: z.string(),
  content: z.string(),
  model: z.string().optional(),
});
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

export const SendMessageResponseSchema = z.object({
  messageId: z.string(),
});
export type SendMessageResponse = z.infer<typeof SendMessageResponseSchema>;

export const ConversationListResponseSchema = z.object({
  conversations: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      updatedAt: z.number(),
    }),
  ),
});
export type ConversationListResponse = z.infer<typeof ConversationListResponseSchema>;

// Agent events — discriminated union
const ToolCallPartialSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  toolName: z.string(),
  serverName: z.string(),
  arguments: z.record(z.unknown()),
  permission: z.enum(['allow_once', 'allow_always', 'deny', 'deny_always', 'pending']),
  status: z.enum(['pending', 'approved', 'denied', 'executing', 'completed', 'failed']),
  timestamp: z.number(),
});

const ToolResultSchema = z.object({
  success: z.boolean(),
  content: z.unknown(),
  error: z.string().optional(),
});

export const AgentEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), content: z.string() }),
  z.object({ type: z.literal('text_delta'), content: z.string() }),
  z.object({ type: z.literal('thinking'), content: z.string() }),
  z.object({ type: z.literal('tool_call_start'), toolCall: ToolCallPartialSchema }),
  z.object({ type: z.literal('tool_call_result'), toolCallId: z.string(), result: ToolResultSchema }),
  z.object({ type: z.literal('permission_request'), toolCall: ToolCallPartialSchema }),
  z.object({ type: z.literal('error'), error: z.string() }),
  z.object({ type: z.literal('done'), messageId: z.string() }),
]);
export type AgentEvent = z.infer<typeof AgentEventSchema>;

// Auth state
export const AuthStateSchema = z.object({
  isAuthenticated: z.boolean(),
  user: z
    .object({
      githubId: z.string(),
      githubLogin: z.string(),
      avatarUrl: z.string(),
      copilotTier: z.enum(['free', 'pro', 'pro_plus', 'business', 'enterprise']),
    })
    .nullable(),
});
export type AuthState = z.infer<typeof AuthStateSchema>;
```

- [ ] **Step 5: Create IPC service interfaces**

Create `packages/platform/src/ipc/common/ipcService.ts`:
```typescript
/**
 * IPC service interfaces — abstractions over Electron IPC for testability.
 */
import { createServiceIdentifier } from '@gho-work/base';

export interface IIPCRenderer {
  invoke<T>(channel: string, ...args: unknown[]): Promise<T>;
  on(channel: string, callback: (...args: unknown[]) => void): void;
  removeListener(channel: string, callback: (...args: unknown[]) => void): void;
}

export const IIPCRenderer = createServiceIdentifier<IIPCRenderer>('IIPCRenderer');

export interface IIPCMain {
  handle(channel: string, handler: (...args: unknown[]) => Promise<unknown>): void;
  sendToRenderer(channel: string, ...args: unknown[]): void;
}

export const IIPCMain = createServiceIdentifier<IIPCMain>('IIPCMain');
```

- [ ] **Step 6: Update barrel export**

Update `packages/platform/src/index.ts` (cumulative — this grows as tasks add modules):
```typescript
export * from './ipc/common/ipc.js';
export * from './ipc/common/ipcService.js';
// Added by Task 8:  export * from './ipc/common/messagePortChannel.js';
// Added by Task 12: export * from './storage/common/storage.js';
// Added by Task 12: export * from './storage/node/migrations.js';
// Added by Task 13: export * from './storage/node/globalSchema.js';
// Added by Task 14: export * from './storage/node/workspaceSchema.js';
// Added by Task 14b: export * from './storage/node/sqliteStorage.js';
// Added by Task 14c: export * from './files/common/files.js';
// Added by Task 15: export * from './auth/common/auth.js';
```

- [ ] **Step 7: Delete old ipc.ts**

```bash
rm packages/platform/src/ipc.ts
```

- [ ] **Step 8: Update downstream imports and build**

The barrel export names (`IPC_CHANNELS`, `IIPCRenderer`, `IIPCMain`, `SendMessageRequest`) stay the same, so downstream packages importing from `@gho-work/platform` should work. Verify:

```bash
npx turbo build && npx vitest run
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(platform): typed IPC channels with zod validation schemas"
```

---

### Task 8: MessagePort protocol wrapper

Create a protocol abstraction over MessagePort for Agent Host communication.

**Files:**
- Create: `packages/platform/src/ipc/common/messagePortChannel.ts`
- Create: `packages/platform/src/ipc/test/messagePortChannel.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/platform/src/ipc/test/messagePortChannel.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { MessagePortProtocol } from '../common/messagePortChannel.js';

// Mock MessagePort (Node.js MessageChannel)
async function createMockPorts() {
  const { MessageChannel } = await import('node:worker_threads');
  const channel = new MessageChannel();
  return { port1: channel.port1, port2: channel.port2 };
}

describe('MessagePortProtocol', () => {
  it('should send and receive messages', async () => {
    const { port1, port2 } = await createMockPorts();
    const protocol1 = new MessagePortProtocol(port1);
    const protocol2 = new MessagePortProtocol(port2);

    const received = new Promise<any>((resolve) => {
      protocol2.onMessage((msg) => resolve(msg));
    });

    protocol1.send({ type: 'test', data: 'hello' });
    const msg = await received;
    expect(msg).toEqual({ type: 'test', data: 'hello' });

    protocol1.dispose();
    protocol2.dispose();
  });

  it('should support request/response pattern', async () => {
    const { port1, port2 } = await createMockPorts();
    const client = new MessagePortProtocol(port1);
    const server = new MessagePortProtocol(port2);

    // Server handles requests
    server.onRequest('greet', async (args) => {
      return { greeting: `Hello, ${args.name}!` };
    });

    // Client sends request
    const result = await client.request('greet', { name: 'World' });
    expect(result).toEqual({ greeting: 'Hello, World!' });

    client.dispose();
    server.dispose();
  });

  it('should stop receiving after dispose', async () => {
    const { port1, port2 } = await createMockPorts();
    const protocol1 = new MessagePortProtocol(port1);
    const protocol2 = new MessagePortProtocol(port2);
    const listener = vi.fn();

    protocol2.onMessage(listener);
    protocol2.dispose();
    protocol1.send({ type: 'test' });

    // Give time for any messages to arrive
    await new Promise((r) => setTimeout(r, 50));
    expect(listener).not.toHaveBeenCalled();

    protocol1.dispose();
  });
});
```

- [ ] **Step 2: Implement MessagePortProtocol**

Create `packages/platform/src/ipc/common/messagePortChannel.ts`:
```typescript
/**
 * MessagePort protocol — typed message passing for utility process communication.
 * Supports fire-and-forget messages and request/response patterns.
 * @see references/vscode/src/vs/base/parts/ipc/common/ipc.mp.ts
 */
import { Disposable, Emitter } from '@gho-work/base';
import type { Event, IDisposable } from '@gho-work/base';

interface ProtocolMessage {
  type: 'message' | 'request' | 'response';
  id?: number;
  channel?: string;
  data?: unknown;
  error?: string;
}

export class MessagePortProtocol extends Disposable {
  private _nextId = 0;
  private readonly _pendingRequests = new Map<number, { resolve: Function; reject: Function }>();
  private readonly _requestHandlers = new Map<string, (args: any) => Promise<any>>();
  private readonly _onMessage = this._register(new Emitter<any>());
  readonly onMessageEvent: Event<any> = this._onMessage.event;

  constructor(private readonly _port: any) {
    super();
    this._port.on('message', (msg: ProtocolMessage) => this._handleIncoming(msg));
  }

  send(data: unknown): void {
    this._port.postMessage({ type: 'message', data } satisfies ProtocolMessage);
  }

  async request<T>(channel: string, args?: unknown): Promise<T> {
    const id = this._nextId++;
    return new Promise<T>((resolve, reject) => {
      this._pendingRequests.set(id, { resolve, reject });
      this._port.postMessage({ type: 'request', id, channel, data: args } satisfies ProtocolMessage);
    });
  }

  onMessage(handler: (data: any) => void): IDisposable {
    return this._onMessage.event(handler);
  }

  onRequest(channel: string, handler: (args: any) => Promise<any>): void {
    this._requestHandlers.set(channel, handler);
  }

  private async _handleIncoming(msg: ProtocolMessage): Promise<void> {
    switch (msg.type) {
      case 'message':
        this._onMessage.fire(msg.data);
        break;
      case 'request': {
        const handler = this._requestHandlers.get(msg.channel!);
        if (handler) {
          try {
            const result = await handler(msg.data);
            this._port.postMessage({
              type: 'response',
              id: msg.id,
              data: result,
            } satisfies ProtocolMessage);
          } catch (err) {
            this._port.postMessage({
              type: 'response',
              id: msg.id,
              error: err instanceof Error ? err.message : String(err),
            } satisfies ProtocolMessage);
          }
        }
        break;
      }
      case 'response': {
        const pending = this._pendingRequests.get(msg.id!);
        if (pending) {
          this._pendingRequests.delete(msg.id!);
          if (msg.error) {
            pending.reject(new Error(msg.error));
          } else {
            pending.resolve(msg.data);
          }
        }
        break;
      }
    }
  }

  override dispose(): void {
    this._port.close?.();
    for (const [, { reject }] of this._pendingRequests) {
      reject(new Error('Protocol disposed'));
    }
    this._pendingRequests.clear();
    super.dispose();
  }
}
```

- [ ] **Step 3: Update barrel export**

Add to `packages/platform/src/index.ts`:
```typescript
export * from './ipc/common/messagePortChannel.js';
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run packages/platform/src/ipc/test/messagePortChannel.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/platform/src/ipc/
git commit -m "feat(platform): add MessagePortProtocol for utility process IPC"
```

---

### Task 9: Agent Host utility process

Spawn a utility process for the Agent Host with MessagePort handoff.

**Files:**
- Create: `packages/electron/src/agentHost/agentHostMain.ts` (utility process entry)
- Create: `packages/electron/src/main/agentHostManager.ts` (spawner in main process)
- Modify: `packages/electron/src/main/mainProcess.ts` (wire up agent host)
- Modify: `apps/desktop/electron-vite.config.ts` (add utility process entry)

- [ ] **Step 1: Create Agent Host entry point**

Create `packages/electron/src/agentHost/agentHostMain.ts`:
```typescript
/**
 * Agent Host — runs in an Electron utility process.
 * Receives a MessagePort from the main process for communication with the renderer.
 */
import { MessagePortProtocol } from '@gho-work/platform';

let protocol: MessagePortProtocol | null = null;

process.parentPort.on('message', (e: Electron.MessageEvent) => {
  if (e.data?.type === 'port' && e.ports.length > 0) {
    const port = e.ports[0];
    protocol = new MessagePortProtocol(port);

    // Register handlers for agent operations
    protocol.onRequest('agent:send-message', async (args) => {
      // TODO: wire up real Copilot SDK in Phase 2
      // For now, echo back to confirm MessagePort works
      return { status: 'received', echo: args };
    });

    protocol.onRequest('agent:ping', async () => {
      return { status: 'pong', pid: process.pid };
    });

    // Signal ready
    process.parentPort.postMessage({ type: 'ready' });
  }
});
```

- [ ] **Step 2: Create AgentHostManager**

Create `packages/electron/src/main/agentHostManager.ts`:
```typescript
/**
 * Manages the Agent Host utility process lifecycle.
 * Spawns the process, creates MessagePort channels, handles crash recovery.
 * @see electron-hardening skill — Multi-Process section
 */
import { utilityProcess, MessageChannelMain } from 'electron';
import type { BrowserWindow, UtilityProcess } from 'electron';
import { Disposable, Emitter } from '@gho-work/base';
import type { Event } from '@gho-work/base';

export class AgentHostManager extends Disposable {
  private _process: UtilityProcess | null = null;
  private _restartCount = 0;
  private _lastRestartTime = 0;

  private readonly _onDidStart = this._register(new Emitter<void>());
  readonly onDidStart: Event<void> = this._onDidStart.event;

  private readonly _onDidCrash = this._register(new Emitter<number>());
  readonly onDidCrash: Event<number> = this._onDidCrash.event;

  constructor(
    private readonly _workerPath: string,
    private readonly _mainWindow: BrowserWindow,
  ) {
    super();
  }

  start(): void {
    if (this._process) {
      return;
    }

    this._process = utilityProcess.fork(this._workerPath, [], {
      serviceName: 'gho-agent-host',
    });

    // Create MessagePort pair: one for Agent Host, one for Renderer
    const { port1: agentPort, port2: rendererPort } = new MessageChannelMain();

    // Send port to Agent Host
    this._process.postMessage({ type: 'port' }, [agentPort]);

    // Send port to Renderer
    this._mainWindow.webContents.postMessage('port:agent-host', null, [rendererPort]);

    this._process.on('exit', (code) => {
      this._process = null;
      if (code !== 0) {
        this._onDidCrash.fire(code);
        this._maybeRestart();
      }
    });

    // Wait for ready signal
    this._process.on('message', (msg: any) => {
      if (msg?.type === 'ready') {
        this._onDidStart.fire();
      }
    });
  }

  private _maybeRestart(): void {
    const now = Date.now();
    // Reset counter if last crash was > 5 minutes ago
    if (now - this._lastRestartTime > 5 * 60 * 1000) {
      this._restartCount = 0;
    }

    if (this._restartCount < 3) {
      this._restartCount++;
      this._lastRestartTime = now;
      const delay = this._restartCount * 1000;
      setTimeout(() => this.start(), delay);
    }
  }

  override dispose(): void {
    this._process?.kill();
    this._process = null;
    super.dispose();
  }
}
```

- [ ] **Step 3: Update main process to use AgentHostManager**

This is a refactor of `packages/electron/src/main-process.ts` → `packages/electron/src/main/mainProcess.ts`. The key changes:
- Import AgentHostManager
- Create and start agent host on app ready
- Keep existing IPC handlers (they'll be refactored in Phase 2 to route through Agent Host)

```bash
mkdir -p packages/electron/src/main
# Move and refactor main-process.ts → main/mainProcess.ts
```

Update `packages/electron/src/main/mainProcess.ts` to include:
```typescript
import { AgentHostManager } from './agentHostManager.js';

// In createMainProcess():
// const agentHost = new AgentHostManager(workerPath, mainWindow);
// agentHost.start();
```

- [ ] **Step 4: Configure electron-vite for utility process**

Update `apps/desktop/electron-vite.config.ts` to add the utility process as a second entry under `main`:

```typescript
import { resolve } from 'path';

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          agentHost: resolve(__dirname, '../../packages/electron/src/agentHost/agentHostMain.ts'),
        },
        external: ['better-sqlite3'],
      },
    },
  },
  preload: {
    // ... existing preload config
  },
  renderer: {
    // ... existing renderer config
  },
});
```

The `agentHost` entry produces a separate bundle that `utilityProcess.fork()` can reference via:
```typescript
import agentHostPath from './agentHost?modulePath';
// or: const agentHostPath = path.join(__dirname, 'agentHost.js');
```

- [ ] **Step 5: Build and verify**

```bash
npx turbo build
```

Note: The utility process + MessagePort cannot be tested with Vitest alone — it requires Electron. This will be covered in the integration test (Task 10).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(electron): add Agent Host utility process with MessagePort handoff

AgentHostManager spawns utility process, creates MessagePort channel.
Crash recovery with exponential backoff (max 3 restarts in 5 minutes).
Agent Host echoes messages for now (real SDK wiring in Phase 2)."
```

---

### Task 10: Integration test — multi-process MessagePort handshake

**Files:**
- Create: `tests/integration/agentHostIpc.test.ts`

- [ ] **Step 1: Write integration test**

Create `tests/integration/agentHostIpc.test.ts`:
```typescript
/**
 * Integration test: verifies the multi-process architecture.
 * Main process spawns Agent Host, MessagePort handshake succeeds,
 * bidirectional message exchange works.
 *
 * Note: This test requires Electron and must run with electron-vite's test runner
 * or be marked as requiring the Electron environment.
 */
import { describe, it, expect } from 'vitest';
import { MessagePortProtocol } from '@gho-work/platform';

// This test uses Node.js MessageChannel as a stand-in for Electron's MessagePort.
// The real Electron integration is covered by the Playwright e2e test.
describe('MessagePort bidirectional communication', () => {
  it('should exchange messages between two protocols', async () => {
    const { MessageChannel } = await import('node:worker_threads');
    const channel = new MessageChannel();

    const serverProtocol = new MessagePortProtocol(channel.port1);
    const clientProtocol = new MessagePortProtocol(channel.port2);

    // Server handles requests
    serverProtocol.onRequest('ping', async () => ({ status: 'pong' }));
    serverProtocol.onRequest('echo', async (data) => ({ echo: data }));

    // Client sends requests
    const pong = await clientProtocol.request('ping');
    expect(pong).toEqual({ status: 'pong' });

    const echo = await clientProtocol.request('echo', { message: 'hello' });
    expect(echo).toEqual({ echo: { message: 'hello' } });

    serverProtocol.dispose();
    clientProtocol.dispose();
  });

  it('should handle fire-and-forget messages', async () => {
    const { MessageChannel } = await import('node:worker_threads');
    const channel = new MessageChannel();

    const proto1 = new MessagePortProtocol(channel.port1);
    const proto2 = new MessagePortProtocol(channel.port2);

    const received = new Promise<any>((resolve) => {
      proto2.onMessage((data) => resolve(data));
    });

    proto1.send({ type: 'notification', content: 'test' });
    const msg = await received;
    expect(msg).toEqual({ type: 'notification', content: 'test' });

    proto1.dispose();
    proto2.dispose();
  });
});
```

- [ ] **Step 2: Run integration test**

```bash
npx vitest run tests/integration/agentHostIpc.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/agentHostIpc.test.ts
git commit -m "test: add integration test for MessagePort bidirectional IPC"
```

---

**End of Chunk 2.** At this point:
- IPC channels have zod validation schemas
- MessagePortProtocol supports fire-and-forget and request/response patterns
- Agent Host utility process spawns from main with MessagePort handoff
- Crash recovery with exponential backoff
- Integration test verifies bidirectional MessagePort communication

---

## Chunk 3: Storage Layer

Tasks 11-14 set up SQLite storage with better-sqlite3, schema migrations, and separate global/workspace databases. Consult `@sqlite-patterns` skill before implementing.

### Task 11: Install better-sqlite3 + Electron rebuild

**Files:**
- Modify: root `package.json` (devDeps)
- Modify: `packages/platform/package.json` (runtime dep)
- Modify: `apps/desktop/electron-vite.config.ts` (externalize native module)
- Modify: `electron-builder.yml` (ASAR unpack)

- [ ] **Step 1: Install dependencies**

```bash
npm install better-sqlite3 -w packages/platform
npm install -D @types/better-sqlite3 @electron/rebuild -w packages/platform
```

- [ ] **Step 2: Add postinstall hook for native module rebuild**

Add to root `package.json` scripts:
```json
"postinstall": "npx @electron/rebuild -w better-sqlite3"
```

- [ ] **Step 3: Externalize in electron-vite config**

In `apps/desktop/electron-vite.config.ts`, ensure `better-sqlite3` is externalized for the main process build:
```typescript
main: {
  build: {
    rollupOptions: {
      external: ['better-sqlite3'],
    },
  },
},
```

- [ ] **Step 4: Update electron-builder.yml for ASAR unpack**

Add to `electron-builder.yml`:
```yaml
asarUnpack:
  - "**/node_modules/better-sqlite3/**"
```

- [ ] **Step 5: Verify build**

```bash
npm install && npx turbo build
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "build: add better-sqlite3 with Electron rebuild and ASAR unpack config"
```

---

### Task 12: IStorageService interface + migration framework

**Files:**
- Create: `packages/platform/src/storage/common/storage.ts`
- Create: `packages/platform/src/storage/node/migrations.ts`
- Create: `packages/platform/src/storage/test/migrations.test.ts`

- [ ] **Step 1: Write failing test for migration framework**

Create `packages/platform/src/storage/test/migrations.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrateDatabase, configurePragmas } from '../node/migrations.js';

describe('migrateDatabase', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    configurePragmas(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should apply migrations from version 0', () => {
    const migrations = [
      ['CREATE TABLE test (id TEXT PRIMARY KEY, value TEXT)'],
      ['ALTER TABLE test ADD COLUMN extra TEXT'],
    ];

    migrateDatabase(db, migrations);

    const version = db.pragma('user_version', { simple: true });
    expect(version).toBe(2);

    const info = db.prepare("PRAGMA table_info('test')").all();
    const columns = info.map((c: any) => c.name);
    expect(columns).toContain('id');
    expect(columns).toContain('value');
    expect(columns).toContain('extra');
  });

  it('should skip already-applied migrations', () => {
    const migrations = [
      ['CREATE TABLE test (id TEXT PRIMARY KEY)'],
      ['ALTER TABLE test ADD COLUMN v2 TEXT'],
    ];

    db.exec('CREATE TABLE test (id TEXT PRIMARY KEY)');
    db.pragma('user_version = 1');

    migrateDatabase(db, migrations);

    const version = db.pragma('user_version', { simple: true });
    expect(version).toBe(2);
  });
});
```

- [ ] **Step 2: Implement migration framework**

Create `packages/platform/src/storage/node/migrations.ts`:
```typescript
import type Database from 'better-sqlite3';

export function migrateDatabase(db: Database.Database, migrations: string[][]): void {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;

  for (let i = currentVersion; i < migrations.length; i++) {
    const migration = migrations[i];
    const applyMigration = db.transaction(() => {
      for (const sql of migration) {
        db.exec(sql);
      }
      db.pragma(`user_version = ${i + 1}`);
    });
    applyMigration();
  }
}

export function configurePragmas(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');
  db.pragma('mmap_size = 268435456');
  db.pragma('foreign_keys = ON');
  db.pragma('cache_size = -64000');
}
```

- [ ] **Step 3: Create IStorageService interface**

Create `packages/platform/src/storage/common/storage.ts`:
```typescript
import { createServiceIdentifier } from '@gho-work/base';

export interface IStorageService {
  getSetting(key: string): string | undefined;
  setSetting(key: string, value: string): void;
  getGlobalDatabase(): unknown;
  getWorkspaceDatabase(workspaceId: string): unknown;
  close(): void;
}

export const IStorageService = createServiceIdentifier<IStorageService>('IStorageService');
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run packages/platform/src/storage/test/migrations.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/platform/src/storage/
git commit -m "feat(platform): add IStorageService interface and migration framework"
```

---

### Task 13: Global database schema

**Files:**
- Create: `packages/platform/src/storage/node/globalSchema.ts`
- Create: `packages/platform/src/storage/test/globalSchema.test.ts`

- [ ] **Step 1: Write test for global schema**

Create `packages/platform/src/storage/test/globalSchema.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { GLOBAL_MIGRATIONS } from '../node/globalSchema.js';
import { migrateDatabase, configurePragmas } from '../node/migrations.js';

describe('Global database schema', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    configurePragmas(db);
    migrateDatabase(db, GLOBAL_MIGRATIONS);
  });

  afterEach(() => {
    db.close();
  });

  it('should CRUD settings', () => {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('theme', '"dark"');
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('theme') as any;
    expect(row.value).toBe('"dark"');
  });

  it('should CRUD workspaces', () => {
    const now = Date.now();
    db.prepare(
      'INSERT INTO workspaces (id, name, path, created_at, last_opened) VALUES (?, ?, ?, ?, ?)',
    ).run('ws-1', 'My Workspace', '/home/user/project', now, now);
    const row = db.prepare('SELECT * FROM workspaces WHERE id = ?').get('ws-1') as any;
    expect(row.name).toBe('My Workspace');
  });

  it('should CRUD permission_rules', () => {
    const now = Date.now();
    db.prepare(
      'INSERT INTO permission_rules (id, scope, resource_pattern, decision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('rule-1', 'global', 'read_file:*', 'allow', now, now);
    const row = db.prepare('SELECT * FROM permission_rules WHERE id = ?').get('rule-1') as any;
    expect(row.decision).toBe('allow');
  });

  it('should CRUD connector_configs', () => {
    db.prepare(
      'INSERT INTO connector_configs (id, name, transport, enabled) VALUES (?, ?, ?, ?)',
    ).run('conn-1', 'filesystem', 'stdio', 1);
    const row = db.prepare('SELECT * FROM connector_configs WHERE id = ?').get('conn-1') as any;
    expect(row.name).toBe('filesystem');
  });

  it('should enforce WAL mode', () => {
    const mode = db.pragma('journal_mode', { simple: true });
    expect(mode).toBe('wal');
  });
});
```

- [ ] **Step 2: Implement global schema**

Create `packages/platform/src/storage/node/globalSchema.ts`:
```typescript
export const GLOBAL_MIGRATIONS: string[][] = [
  [
    `CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
    `CREATE TABLE workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_opened INTEGER NOT NULL
    )`,
    `CREATE TABLE permission_rules (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL CHECK(scope IN ('global', 'workspace')),
      workspace_id TEXT,
      resource_pattern TEXT NOT NULL,
      server_name TEXT,
      decision TEXT NOT NULL CHECK(decision IN ('allow', 'deny')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE connector_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      transport TEXT NOT NULL CHECK(transport IN ('stdio', 'streamable_http')),
      command TEXT, args TEXT, url TEXT, env TEXT, headers TEXT,
      credential_ref TEXT,
      enabled INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE INDEX idx_permission_rules_scope ON permission_rules(scope, resource_pattern)`,
    `CREATE INDEX idx_workspaces_last_opened ON workspaces(last_opened DESC)`,
  ],
];
```

- [ ] **Step 3: Run tests, commit**

```bash
npx vitest run packages/platform/src/storage/test/globalSchema.test.ts
git add packages/platform/src/storage/node/globalSchema.ts packages/platform/src/storage/test/globalSchema.test.ts
git commit -m "feat(platform): add global database schema"
```

---

### Task 14: Workspace database schema

**Files:**
- Create: `packages/platform/src/storage/node/workspaceSchema.ts`
- Create: `packages/platform/src/storage/test/workspaceSchema.test.ts`

- [ ] **Step 1: Write test**

Create `packages/platform/src/storage/test/workspaceSchema.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { WORKSPACE_MIGRATIONS } from '../node/workspaceSchema.js';
import { migrateDatabase, configurePragmas } from '../node/migrations.js';

describe('Workspace database schema', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    configurePragmas(db);
    migrateDatabase(db, WORKSPACE_MIGRATIONS);
  });

  afterEach(() => { db.close(); });

  it('should CRUD conversations', () => {
    const now = Date.now();
    db.prepare(
      'INSERT INTO conversations (id, title, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('conv-1', 'Test Chat', 'gpt-4o', 'active', now, now);
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get('conv-1') as any;
    expect(conv.title).toBe('Test Chat');
  });

  it('should CRUD messages with FK to conversations', () => {
    const now = Date.now();
    db.prepare(
      'INSERT INTO conversations (id, title, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('conv-1', 'Test', 'gpt-4o', 'active', now, now);
    db.prepare(
      'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('msg-1', 'conv-1', 'user', 'Hello!', now);
    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get('msg-1') as any;
    expect(msg.content).toBe('Hello!');
  });

  it('should cascade delete messages when conversation deleted', () => {
    const now = Date.now();
    db.prepare(
      'INSERT INTO conversations (id, title, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('conv-1', 'Test', 'gpt-4o', 'active', now, now);
    db.prepare(
      'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('msg-1', 'conv-1', 'user', 'Hello!', now);
    db.prepare('DELETE FROM conversations WHERE id = ?').run('conv-1');
    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get('msg-1');
    expect(msg).toBeUndefined();
  });

  it('should store tool calls', () => {
    const now = Date.now();
    db.prepare(
      'INSERT INTO conversations (id, title, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('conv-1', 'Test', 'gpt-4o', 'active', now, now);
    db.prepare(
      'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('msg-1', 'conv-1', 'assistant', '', now);
    db.prepare(
      `INSERT INTO tool_calls (id, message_id, conversation_id, tool_name, server_name, arguments, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('tc-1', 'msg-1', 'conv-1', 'read_file', 'builtin', '{"path":"/tmp"}', 'completed', now);
    const tc = db.prepare('SELECT * FROM tool_calls WHERE id = ?').get('tc-1') as any;
    expect(tc.tool_name).toBe('read_file');
  });
});
```

- [ ] **Step 2: Implement workspace schema**

Create `packages/platform/src/storage/node/workspaceSchema.ts`:
```typescript
export const WORKSPACE_MIGRATIONS: string[][] = [
  [
    `CREATE TABLE conversations (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, model TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
      metadata TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE messages (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool_result')),
      content TEXT NOT NULL, tool_call_id TEXT, tokens_in INTEGER, tokens_out INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE tool_calls (
      id TEXT PRIMARY KEY, message_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
      tool_name TEXT NOT NULL, server_name TEXT NOT NULL,
      arguments TEXT NOT NULL DEFAULT '{}', result TEXT, error TEXT,
      status TEXT NOT NULL DEFAULT 'pending', permission_rule_id TEXT,
      duration_ms INTEGER, created_at INTEGER NOT NULL, completed_at INTEGER,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC)`,
    `CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at)`,
    `CREATE INDEX idx_tool_calls_conversation ON tool_calls(conversation_id, created_at DESC)`,
    `CREATE INDEX idx_tool_calls_tool_name ON tool_calls(tool_name)`,
  ],
];
```

- [ ] **Step 3: Update barrel exports, run tests, commit**

```bash
# Add exports to packages/platform/src/index.ts
npx vitest run packages/platform/src/storage/test/
git add packages/platform/src/storage/
git commit -m "feat(platform): add workspace database schema (conversations, messages, tool_calls)"
```

---

### Task 14b: SqliteStorageService implementation

**Files:**
- Create: `packages/platform/src/storage/node/sqliteStorage.ts`
- Create: `packages/platform/src/storage/test/sqliteStorage.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/platform/src/storage/test/sqliteStorage.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteStorageService } from '../node/sqliteStorage.js';

describe('SqliteStorageService', () => {
  let service: SqliteStorageService;

  beforeEach(() => {
    // Use in-memory databases for testing
    service = new SqliteStorageService(':memory:', ':memory:');
  });

  afterEach(() => {
    service.close();
  });

  it('should get and set settings', () => {
    service.setSetting('theme', '"dark"');
    expect(service.getSetting('theme')).toBe('"dark"');
  });

  it('should return undefined for missing settings', () => {
    expect(service.getSetting('nonexistent')).toBeUndefined();
  });

  it('should overwrite existing settings', () => {
    service.setSetting('theme', '"dark"');
    service.setSetting('theme', '"light"');
    expect(service.getSetting('theme')).toBe('"light"');
  });

  it('should provide global database access', () => {
    const db = service.getGlobalDatabase();
    expect(db).toBeTruthy();
  });

  it('should provide workspace database access', () => {
    const db = service.getWorkspaceDatabase('ws-1');
    expect(db).toBeTruthy();
  });
});
```

- [ ] **Step 2: Implement SqliteStorageService**

Create `packages/platform/src/storage/node/sqliteStorage.ts`:
```typescript
import Database from 'better-sqlite3';
import type { IStorageService } from '../common/storage.js';
import { configurePragmas, migrateDatabase } from './migrations.js';
import { GLOBAL_MIGRATIONS } from './globalSchema.js';
import { WORKSPACE_MIGRATIONS } from './workspaceSchema.js';

export class SqliteStorageService implements IStorageService {
  private readonly _globalDb: Database.Database;
  private readonly _workspaceDbs = new Map<string, Database.Database>();
  private readonly _workspaceDbPath: string;

  constructor(globalDbPath: string, workspaceDbPath: string) {
    this._workspaceDbPath = workspaceDbPath;
    this._globalDb = new Database(globalDbPath);
    configurePragmas(this._globalDb);
    migrateDatabase(this._globalDb, GLOBAL_MIGRATIONS);
  }

  getSetting(key: string): string | undefined {
    const row = this._globalDb
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row?.value;
  }

  setSetting(key: string, value: string): void {
    this._globalDb
      .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .run(key, value);
  }

  getGlobalDatabase(): Database.Database {
    return this._globalDb;
  }

  getWorkspaceDatabase(workspaceId: string): Database.Database {
    let db = this._workspaceDbs.get(workspaceId);
    if (!db) {
      const dbPath = this._workspaceDbPath === ':memory:'
        ? ':memory:'
        : `${this._workspaceDbPath}/${workspaceId}/workspace.db`;
      db = new Database(dbPath);
      configurePragmas(db);
      migrateDatabase(db, WORKSPACE_MIGRATIONS);
      this._workspaceDbs.set(workspaceId, db);
    }
    return db;
  }

  close(): void {
    this._globalDb.pragma('optimize');
    this._globalDb.close();
    for (const db of this._workspaceDbs.values()) {
      db.pragma('optimize');
      db.close();
    }
    this._workspaceDbs.clear();
  }
}
```

- [ ] **Step 3: Run tests, commit**

```bash
npx vitest run packages/platform/src/storage/test/sqliteStorage.test.ts
git add packages/platform/src/storage/node/sqliteStorage.ts packages/platform/src/storage/test/sqliteStorage.test.ts
git commit -m "feat(platform): add SqliteStorageService implementation"
```

---

### Task 14c: IFileService interface + implementation

**Files:**
- Create: `packages/platform/src/files/common/files.ts`
- Create: `packages/platform/src/files/node/fileService.ts`
- Create: `packages/platform/src/files/test/fileService.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/platform/src/files/test/fileService.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeFileService } from '../node/fileService.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('NodeFileService', () => {
  let service: NodeFileService;
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'gho-test-'));
    service = new NodeFileService();
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should read a file', async () => {
    const filePath = join(testDir, 'test.txt');
    writeFileSync(filePath, 'hello world');
    const content = await service.readFile(filePath);
    expect(content).toBe('hello world');
  });

  it('should write a file', async () => {
    const filePath = join(testDir, 'output.txt');
    await service.writeFile(filePath, 'test content');
    const content = await service.readFile(filePath);
    expect(content).toBe('test content');
  });

  it('should check if file exists', async () => {
    const filePath = join(testDir, 'exists.txt');
    expect(await service.exists(filePath)).toBe(false);
    writeFileSync(filePath, '');
    expect(await service.exists(filePath)).toBe(true);
  });
});
```

- [ ] **Step 2: Implement IFileService and NodeFileService**

Create `packages/platform/src/files/common/files.ts`:
```typescript
import { createServiceIdentifier } from '@gho-work/base';

export interface IFileService {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  readDir(path: string): Promise<string[]>;
  mkdir(path: string): Promise<void>;
}

export const IFileService = createServiceIdentifier<IFileService>('IFileService');
```

Create `packages/platform/src/files/node/fileService.ts`:
```typescript
import * as fs from 'node:fs/promises';
import type { IFileService } from '../common/files.js';

export class NodeFileService implements IFileService {
  async readFile(path: string): Promise<string> {
    return fs.readFile(path, 'utf-8');
  }

  async writeFile(path: string, content: string): Promise<void> {
    await fs.writeFile(path, content, 'utf-8');
  }

  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  async readDir(path: string): Promise<string[]> {
    return fs.readdir(path);
  }

  async mkdir(path: string): Promise<void> {
    await fs.mkdir(path, { recursive: true });
  }
}
```

- [ ] **Step 3: Update barrel exports, run tests, commit**

Add to `packages/platform/src/index.ts`:
```typescript
export * from './files/common/files.js';
export * from './storage/node/sqliteStorage.js';
```

```bash
npx vitest run packages/platform/src/files/test/fileService.test.ts
git add packages/platform/src/files/ packages/platform/src/index.ts
git commit -m "feat(platform): add IFileService interface and NodeFileService implementation"
```

---

**End of Chunk 3.** Storage layer complete:
- better-sqlite3 with Electron rebuild
- Migration framework with user_version tracking
- Global schema: settings, workspaces, permissions, connectors
- Workspace schema: conversations, messages, tool_calls with FK cascades

---

## Chunk 4: Authentication

Tasks 15-17 implement GitHub OAuth PKCE, token storage via safeStorage, Copilot tier verification, and auth state management. Consult `@electron-hardening` skill (safeStorage section).

### Task 15: IAuthService interface + ISecureStorageService

**Files:**
- Create: `packages/platform/src/auth/common/auth.ts`
- Create: `packages/platform/src/auth/node/secureStorage.ts`
- Create: `packages/platform/src/auth/test/secureStorage.test.ts`

- [ ] **Step 1: Define auth types and IAuthService interface**

Create `packages/platform/src/auth/common/auth.ts`:
```typescript
import { createServiceIdentifier } from '@gho-work/base';
import type { Event } from '@gho-work/base';

export interface AuthUser {
  githubId: string;
  githubLogin: string;
  avatarUrl: string;
  copilotTier: 'free' | 'pro' | 'pro_plus' | 'business' | 'enterprise';
}

export interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
}

export interface IAuthService {
  readonly state: AuthState;
  readonly onDidChangeAuth: Event<AuthState>;
  login(): Promise<void>;
  logout(): Promise<void>;
  getAccessToken(): Promise<string | null>;
}

export const IAuthService = createServiceIdentifier<IAuthService>('IAuthService');

export interface ISecureStorageService {
  store(key: string, value: string): void;
  retrieve(key: string): string | null;
  delete(key: string): void;
}

export const ISecureStorageService =
  createServiceIdentifier<ISecureStorageService>('ISecureStorageService');
```

- [ ] **Step 2: Write test for SecureStorageService**

Create `packages/platform/src/auth/test/secureStorage.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SecureStorageService } from '../node/secureStorage.js';

// Mock Electron's safeStorage and fs
const mockSafeStorage = {
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((s: string) => Buffer.from(`encrypted:${s}`)),
  decryptString: vi.fn((b: Buffer) => b.toString().replace('encrypted:', '')),
};

describe('SecureStorageService', () => {
  let service: SecureStorageService;
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    service = new SecureStorageService(mockSafeStorage as any, {
      read: (key: string) => store.get(key) ?? null,
      write: (key: string, value: string) => { store.set(key, value); },
      delete: (key: string) => { store.delete(key); },
    });
  });

  it('should store and retrieve a value', () => {
    service.store('token', 'my-secret-token');
    const result = service.retrieve('token');
    expect(result).toBe('my-secret-token');
    expect(mockSafeStorage.encryptString).toHaveBeenCalledWith('my-secret-token');
  });

  it('should return null for missing keys', () => {
    expect(service.retrieve('missing')).toBeNull();
  });

  it('should delete a stored value', () => {
    service.store('token', 'my-secret');
    service.delete('token');
    expect(service.retrieve('token')).toBeNull();
  });

  it('should throw if encryption unavailable', () => {
    mockSafeStorage.isEncryptionAvailable.mockReturnValueOnce(false);
    expect(() => service.store('token', 'value')).toThrow(/[Ee]ncryption/);
  });
});
```

- [ ] **Step 3: Implement SecureStorageService**

Create `packages/platform/src/auth/node/secureStorage.ts`:
```typescript
import type { ISecureStorageService } from '../common/auth.js';

interface SafeStorageAPI {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

interface KeyValueStore {
  read(key: string): string | null;
  write(key: string, value: string): void;
  delete(key: string): void;
}

export class SecureStorageService implements ISecureStorageService {
  constructor(
    private readonly _safeStorage: SafeStorageAPI,
    private readonly _store: KeyValueStore,
  ) {}

  store(key: string, value: string): void {
    if (!this._safeStorage.isEncryptionAvailable()) {
      throw new Error('Encryption is not available on this system');
    }
    const encrypted = this._safeStorage.encryptString(value);
    this._store.write(key, encrypted.toString('base64'));
  }

  retrieve(key: string): string | null {
    const stored = this._store.read(key);
    if (stored === null) {
      return null;
    }
    const encrypted = Buffer.from(stored, 'base64');
    return this._safeStorage.decryptString(encrypted);
  }

  delete(key: string): void {
    this._store.delete(key);
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run packages/platform/src/auth/test/secureStorage.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/platform/src/auth/
git commit -m "feat(platform): add IAuthService, ISecureStorageService with safeStorage encryption"
```

---

### Task 16: GitHub OAuth PKCE flow

**Files:**
- Create: `packages/platform/src/auth/node/authService.ts`
- Create: `packages/platform/src/auth/test/authService.test.ts`

- [ ] **Step 1: Write test for OAuth state management**

Create `packages/platform/src/auth/test/authService.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthServiceImpl } from '../node/authService.js';
import type { ISecureStorageService } from '../common/auth.js';

describe('AuthServiceImpl', () => {
  let authService: AuthServiceImpl;
  let mockSecureStorage: ISecureStorageService;
  let storedTokens: Map<string, string>;

  beforeEach(() => {
    storedTokens = new Map();
    mockSecureStorage = {
      store: vi.fn((k, v) => storedTokens.set(k, v)),
      retrieve: vi.fn((k) => storedTokens.get(k) ?? null),
      delete: vi.fn((k) => storedTokens.delete(k)),
    };
    authService = new AuthServiceImpl(mockSecureStorage, {
      openExternal: vi.fn(),
      createLocalServer: vi.fn(),
      fetchJson: vi.fn(),
    });
  });

  it('should start unauthenticated', () => {
    expect(authService.state.isAuthenticated).toBe(false);
    expect(authService.state.user).toBeNull();
  });

  it('should emit onDidChangeAuth when state changes', () => {
    const listener = vi.fn();
    authService.onDidChangeAuth(listener);

    // Simulate successful auth (internal method for testing)
    authService._setAuthenticatedState({
      githubId: '12345',
      githubLogin: 'testuser',
      avatarUrl: 'https://github.com/testuser.png',
      copilotTier: 'pro',
    });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].isAuthenticated).toBe(true);
    expect(listener.mock.calls[0][0].user?.githubLogin).toBe('testuser');
  });

  it('should store token on login', () => {
    authService._setToken('gh_test_token_123');
    expect(mockSecureStorage.store).toHaveBeenCalledWith(
      'github.accessToken',
      'gh_test_token_123',
    );
  });

  it('should clear state on logout', async () => {
    authService._setAuthenticatedState({
      githubId: '12345',
      githubLogin: 'testuser',
      avatarUrl: '',
      copilotTier: 'pro',
    });
    authService._setToken('gh_token');

    await authService.logout();

    expect(authService.state.isAuthenticated).toBe(false);
    expect(mockSecureStorage.delete).toHaveBeenCalledWith('github.accessToken');
  });

  it('should restore session from stored token', async () => {
    storedTokens.set('github.accessToken', 'gh_stored_token');

    // Mock the user fetch
    (authService as any)._platform.fetchJson = vi.fn()
      .mockResolvedValueOnce({
        id: 12345, login: 'testuser', avatar_url: 'https://avatar',
      })
      .mockResolvedValueOnce({ copilot_plan: { plan_type: 'pro' } });

    await authService.tryRestoreSession();

    expect(authService.state.isAuthenticated).toBe(true);
    expect(authService.state.user?.githubLogin).toBe('testuser');
  });
});
```

- [ ] **Step 2: Implement AuthServiceImpl**

Create `packages/platform/src/auth/node/authService.ts`:
```typescript
import { Disposable, Emitter } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import type { IAuthService, AuthState, AuthUser, ISecureStorageService } from '../common/auth.js';

const TOKEN_KEY = 'github.accessToken';
const GITHUB_CLIENT_ID = 'Iv1.PLACEHOLDER'; // Replace with real app client ID

interface PlatformAPI {
  openExternal(url: string): void;
  createLocalServer(port: number): Promise<{ waitForCallback(): Promise<string>; close(): void }>;
  fetchJson(url: string, headers?: Record<string, string>): Promise<any>;
}

export class AuthServiceImpl extends Disposable implements IAuthService {
  private _state: AuthState = { isAuthenticated: false, user: null };
  private readonly _onDidChangeAuth = this._register(new Emitter<AuthState>());
  readonly onDidChangeAuth: Event<AuthState> = this._onDidChangeAuth.event;

  constructor(
    private readonly _secureStorage: ISecureStorageService,
    private readonly _platform: PlatformAPI,
  ) {
    super();
  }

  get state(): AuthState {
    return this._state;
  }

  async login(): Promise<void> {
    // Generate PKCE challenge
    const verifier = this._generateCodeVerifier();
    const challenge = await this._generateCodeChallenge(verifier);
    const state = crypto.randomUUID();

    // Start local server to receive callback
    const server = await this._platform.createLocalServer(17239);

    try {
      // Open GitHub OAuth in browser
      const params = new URLSearchParams({
        client_id: GITHUB_CLIENT_ID,
        redirect_uri: 'http://127.0.0.1:17239/callback',
        scope: 'read:user read:org copilot',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      });

      this._platform.openExternal(
        `https://github.com/login/oauth/authorize?${params}`,
      );

      // Wait for callback with auth code
      const callbackUrl = await server.waitForCallback();
      const url = new URL(callbackUrl, 'http://127.0.0.1:17239');
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');

      if (returnedState !== state || !code) {
        throw new Error('OAuth state mismatch or missing code');
      }

      // Exchange code for token
      const tokenResponse = await this._platform.fetchJson(
        'https://github.com/login/oauth/access_token',
        {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      );
      // Note: actual POST body would include code, client_id, code_verifier

      const token = tokenResponse.access_token;
      this._setToken(token);
      await this._fetchUserAndSetState(token);
    } finally {
      server.close();
    }
  }

  async logout(): Promise<void> {
    this._secureStorage.delete(TOKEN_KEY);
    this._state = { isAuthenticated: false, user: null };
    this._onDidChangeAuth.fire(this._state);
  }

  async getAccessToken(): Promise<string | null> {
    return this._secureStorage.retrieve(TOKEN_KEY);
  }

  async tryRestoreSession(): Promise<void> {
    const token = this._secureStorage.retrieve(TOKEN_KEY);
    if (token) {
      try {
        await this._fetchUserAndSetState(token);
      } catch {
        // Token expired or invalid — stay logged out
        this._secureStorage.delete(TOKEN_KEY);
      }
    }
  }

  // --- Test helpers (prefixed with _) ---

  _setAuthenticatedState(user: AuthUser): void {
    this._state = { isAuthenticated: true, user };
    this._onDidChangeAuth.fire(this._state);
  }

  _setToken(token: string): void {
    this._secureStorage.store(TOKEN_KEY, token);
  }

  // --- Private ---

  private async _fetchUserAndSetState(token: string): Promise<void> {
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    const userInfo = await this._platform.fetchJson('https://api.github.com/user', headers);
    const copilotInfo = await this._platform.fetchJson(
      'https://api.github.com/user/copilot',
      headers,
    );

    const user: AuthUser = {
      githubId: String(userInfo.id),
      githubLogin: userInfo.login,
      avatarUrl: userInfo.avatar_url,
      copilotTier: copilotInfo?.copilot_plan?.plan_type ?? 'free',
    };

    this._setAuthenticatedState(user);
  }

  private _generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  private async _generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
}
```

- [ ] **Step 3: Update barrel exports**

Add to `packages/platform/src/index.ts`:
```typescript
export * from './auth/common/auth.js';
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run packages/platform/src/auth/test/
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/platform/src/auth/
git commit -m "feat(platform): add GitHub OAuth PKCE auth service with Copilot tier verification

AuthServiceImpl handles login/logout/session restore.
SecureStorageService wraps Electron safeStorage for token encryption.
Auth state observable via onDidChangeAuth event."
```

---

### Task 17: Auth IPC handlers + login UI placeholder

Wire auth service into main process IPC so renderer can trigger login/logout and observe state.

**Files:**
- Modify: `packages/electron/src/main/mainProcess.ts` — add auth IPC handlers
- Modify: `packages/electron/src/preload/preload.ts` — add auth channels to whitelist

- [ ] **Step 1: Add auth IPC handlers to main process**

In `packages/electron/src/main/mainProcess.ts`, add:
```typescript
import { IPC_CHANNELS } from '@gho-work/platform';
// ... existing imports ...

// In createMainProcess():
// Register auth handlers
ipcMainAdapter.handle(IPC_CHANNELS.AUTH_LOGIN, async () => {
  await authService.login();
  return authService.state;
});

ipcMainAdapter.handle(IPC_CHANNELS.AUTH_LOGOUT, async () => {
  await authService.logout();
  return authService.state;
});

ipcMainAdapter.handle(IPC_CHANNELS.AUTH_STATE, async () => {
  return authService.state;
});

// Forward auth state changes to renderer
authService.onDidChangeAuth((state) => {
  ipcMainAdapter.sendToRenderer(IPC_CHANNELS.AUTH_STATE_CHANGED, state);
});
```

- [ ] **Step 2: Update preload whitelist and fix removeListener bug**

Add `AUTH_LOGIN`, `AUTH_LOGOUT`, `AUTH_STATE` to `ALLOWED_INVOKE_CHANNELS`.
Add `AUTH_STATE_CHANGED` to `ALLOWED_LISTEN_CHANNELS`.

**Bug fix:** The existing preload's `removeListener` passes the original callback but `on` wraps it in a handler closure. They're different references, so `removeListener` never actually removes the listener. Fix by storing the callback-to-handler mapping:

```typescript
// In preload.ts, replace the on/removeListener implementation:
const _listenerMap = new Map<Function, Function>();

on: (channel: string, callback: (...args: unknown[]) => void) => {
  if (!ALLOWED_LISTEN_CHANNELS.includes(channel)) {
    throw new Error(`IPC channel not allowed: ${channel}`);
  }
  const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args);
  _listenerMap.set(callback, handler);
  ipcRenderer.on(channel, handler);
},
removeListener: (channel: string, callback: (...args: unknown[]) => void) => {
  const handler = _listenerMap.get(callback);
  if (handler) {
    ipcRenderer.removeListener(channel, handler as any);
    _listenerMap.delete(callback);
  }
},
```

- [ ] **Step 3: Build and verify**

```bash
npx turbo build
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(electron): wire auth service IPC handlers and preload whitelist"
```

---

**End of Chunk 4.** Authentication complete:
- IAuthService with GitHub OAuth PKCE flow
- ISecureStorageService wrapping safeStorage
- Copilot tier verification (GET /user/copilot)
- Auth state observable via events
- IPC handlers for renderer-side login/logout
- Token persists across restarts via safeStorage

---

## Chunk 5: Workbench Shell

Tasks 18-22 build out the workbench UI: h() DOM helper, Widget base class, activity bar, sidebar with panel switching, status bar, keyboard shortcuts, and theming. Consult `@vscode-patterns` skill (Pattern 6: Widgets) and the UX tutorial at `docs/tutorial/index.html`.

### Task 18: h() DOM helper + Widget base class

**Files:**
- Create: `packages/ui/src/browser/dom.ts`
- Create: `packages/ui/src/browser/widget.ts`
- Create: `packages/ui/src/test/common/dom.test.ts`

- [ ] **Step 1: Write failing test for h() helper**

Create `packages/ui/src/test/browser/dom.test.ts`:
```typescript
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { h, addDisposableListener } from '../../browser/dom.js';

describe('h() DOM helper', () => {
  it('should create an element with tag name', () => {
    const { root } = h('div');
    expect(root.tagName).toBe('DIV');
  });

  it('should create an element with classes', () => {
    const { root } = h('div.foo.bar');
    expect(root.classList.contains('foo')).toBe(true);
    expect(root.classList.contains('bar')).toBe(true);
  });

  it('should create an element with id', () => {
    const { root } = h('div#myid');
    expect(root.id).toBe('myid');
  });

  it('should create nested children', () => {
    const result = h('div.parent', [
      h('span.child1@child1'),
      h('span.child2@child2'),
    ]);
    expect(result.root.children.length).toBe(2);
    expect(result.child1.tagName).toBe('SPAN');
    expect(result.child2.classList.contains('child2')).toBe(true);
  });

  it('should support @name references', () => {
    const result = h('div', [
      h('input@input'),
      h('button@btn'),
    ]);
    expect(result.input.tagName).toBe('INPUT');
    expect(result.btn.tagName).toBe('BUTTON');
  });

  it('should default to div when no tag specified', () => {
    const { root } = h('.just-a-class');
    expect(root.tagName).toBe('DIV');
  });
});

describe('addDisposableListener', () => {
  it('should add and remove event listener on dispose', () => {
    const el = document.createElement('div');
    const handler = vi.fn();
    const disposable = addDisposableListener(el, 'click', handler);

    el.click();
    expect(handler).toHaveBeenCalledOnce();

    disposable.dispose();
    el.click();
    expect(handler).toHaveBeenCalledOnce(); // not called again
  });
});
```

- [ ] **Step 2: Implement h() and addDisposableListener**

Create `packages/ui/src/browser/dom.ts`:
```typescript
/**
 * Declarative DOM creation helper, adapted from VS Code's dom.ts.
 * @see references/vscode/src/vs/base/browser/dom.ts
 */
import type { IDisposable } from '@gho-work/base';

type HResult = { root: HTMLElement; [key: string]: HTMLElement };

/**
 * Create DOM elements declaratively.
 *
 * Syntax: h('tagName.class1.class2#id@name', children?)
 * - tagName defaults to 'div' if omitted
 * - .class adds CSS classes
 * - #id sets the element ID
 * - @name adds a named reference to the result object
 *
 * Example:
 *   const { root, header, content } = h('div.container', [
 *     h('div.header@header'),
 *     h('div.content@content'),
 *   ]);
 */
export function h(selector: string, children?: HResult[]): HResult {
  const { tag, classes, id, name } = parseSelector(selector);
  const el = document.createElement(tag);

  if (classes.length > 0) {
    el.classList.add(...classes);
  }
  if (id) {
    el.id = id;
  }

  const result: HResult = { root: el };
  if (name) {
    result[name] = el;
  }

  if (children) {
    for (const child of children) {
      el.appendChild(child.root);
      // Merge named refs from children into result
      for (const [key, value] of Object.entries(child)) {
        if (key !== 'root') {
          result[key] = value;
        }
      }
    }
  }

  return result;
}

function parseSelector(selector: string): {
  tag: string;
  classes: string[];
  id: string;
  name: string;
} {
  let tag = 'div';
  const classes: string[] = [];
  let id = '';
  let name = '';

  // Extract @name
  const atIdx = selector.indexOf('@');
  if (atIdx !== -1) {
    name = selector.slice(atIdx + 1);
    selector = selector.slice(0, atIdx);
  }

  // Extract #id
  const hashIdx = selector.indexOf('#');
  if (hashIdx !== -1) {
    const rest = selector.slice(hashIdx + 1);
    const dotIdx = rest.indexOf('.');
    if (dotIdx !== -1) {
      id = rest.slice(0, dotIdx);
      classes.push(...rest.slice(dotIdx + 1).split('.').filter(Boolean));
    } else {
      id = rest;
    }
    selector = selector.slice(0, hashIdx);
  }

  // Extract .classes
  const parts = selector.split('.').filter(Boolean);
  if (parts.length > 0) {
    // First part is the tag if it doesn't start with '.'
    if (!selector.startsWith('.')) {
      tag = parts.shift()!;
    }
    classes.push(...parts);
  }

  return { tag, classes, id, name };
}

/**
 * Add an event listener that returns an IDisposable for cleanup.
 */
export function addDisposableListener(
  element: EventTarget,
  type: string,
  handler: EventListener,
  options?: boolean | AddEventListenerOptions,
): IDisposable {
  element.addEventListener(type, handler, options);
  return {
    dispose: () => {
      element.removeEventListener(type, handler, options);
    },
  };
}
```

- [ ] **Step 3: Create Widget base class**

Create `packages/ui/src/browser/widget.ts`:
```typescript
/**
 * Widget base class — all UI components extend this.
 * Manages DOM lifecycle and disposables.
 */
import { Disposable } from '@gho-work/base';
import type { IDisposable } from '@gho-work/base';
import { addDisposableListener } from './dom.js';

export abstract class Widget extends Disposable {
  protected readonly element: HTMLElement;

  constructor(element: HTMLElement) {
    super();
    this.element = element;
  }

  protected listen(
    target: EventTarget,
    type: string,
    handler: EventListener,
    options?: boolean | AddEventListenerOptions,
  ): IDisposable {
    return this._register(addDisposableListener(target, type, handler, options));
  }

  getDomNode(): HTMLElement {
    return this.element;
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run packages/ui/src/test/common/dom.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/common/ packages/ui/src/test/
git commit -m "feat(ui): add h() DOM helper and Widget base class"
```

---

### Task 19: Theming with CSS custom properties

**Files:**
- Create: `packages/ui/src/browser/theme.ts`
- Create: `apps/desktop/src/renderer/themes/light.css`
- Create: `apps/desktop/src/renderer/themes/dark.css`

- [ ] **Step 1: Create ThemeService**

Create `packages/ui/src/browser/theme.ts`:
```typescript
import { Disposable, Emitter, createServiceIdentifier } from '@gho-work/base';
import type { Event } from '@gho-work/base';

export type ThemeKind = 'light' | 'dark' | 'system';

export interface IThemeService {
  readonly currentTheme: ThemeKind;
  readonly onDidChangeTheme: Event<ThemeKind>;
  setTheme(theme: ThemeKind): void;
}

export const IThemeService = createServiceIdentifier<IThemeService>('IThemeService');

export class ThemeService extends Disposable implements IThemeService {
  private _currentTheme: ThemeKind = 'system';
  private readonly _onDidChangeTheme = this._register(new Emitter<ThemeKind>());
  readonly onDidChangeTheme: Event<ThemeKind> = this._onDidChangeTheme.event;

  get currentTheme(): ThemeKind {
    return this._currentTheme;
  }

  setTheme(theme: ThemeKind): void {
    this._currentTheme = theme;
    this._applyTheme(theme);
    this._onDidChangeTheme.fire(theme);
  }

  private _applyTheme(theme: ThemeKind): void {
    const resolved =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme;

    document.documentElement.setAttribute('data-theme', resolved);
  }
}
```

- [ ] **Step 2: Create theme CSS files**

Create `apps/desktop/src/renderer/themes/light.css`:
```css
[data-theme="light"] {
  --gho-bg-primary: #ffffff;
  --gho-bg-secondary: #f5f5f5;
  --gho-bg-tertiary: #e8e8e8;
  --gho-text-primary: #1a1a1a;
  --gho-text-secondary: #666666;
  --gho-text-muted: #999999;
  --gho-border: #e0e0e0;
  --gho-accent: #0066cc;
  --gho-accent-hover: #0055aa;
  --gho-success: #28a745;
  --gho-warning: #ffc107;
  --gho-error: #dc3545;
  --gho-sidebar-bg: #f0f0f0;
  --gho-activitybar-bg: #e0e0e0;
  --gho-statusbar-bg: #007acc;
  --gho-statusbar-text: #ffffff;
  --gho-input-bg: #ffffff;
  --gho-input-border: #cccccc;
}
```

Create `apps/desktop/src/renderer/themes/dark.css`:
```css
[data-theme="dark"] {
  --gho-bg-primary: #1e1e1e;
  --gho-bg-secondary: #252526;
  --gho-bg-tertiary: #2d2d30;
  --gho-text-primary: #d4d4d4;
  --gho-text-secondary: #a0a0a0;
  --gho-text-muted: #666666;
  --gho-border: #3e3e42;
  --gho-accent: #007acc;
  --gho-accent-hover: #1a8fd1;
  --gho-success: #4ec95d;
  --gho-warning: #cca700;
  --gho-error: #f14c4c;
  --gho-sidebar-bg: #252526;
  --gho-activitybar-bg: #333333;
  --gho-statusbar-bg: #007acc;
  --gho-statusbar-text: #ffffff;
  --gho-input-bg: #3c3c3c;
  --gho-input-border: #555555;
}
```

- [ ] **Step 3: Import themes in renderer styles**

Add to `apps/desktop/src/renderer/styles.css`:
```css
@import './themes/light.css';
@import './themes/dark.css';
```

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/browser/theme.ts apps/desktop/src/renderer/themes/
git commit -m "feat(ui): add ThemeService with light/dark CSS custom properties"
```

---

### Task 20: Activity bar + Sidebar + Status bar

Refactor the existing workbench into proper Widget-based components.

**Files:**
- Create: `packages/ui/src/browser/activityBar.ts`
- Create: `packages/ui/src/browser/sidebar.ts`
- Create: `packages/ui/src/browser/statusBar.ts`
- Create: `packages/ui/src/browser/keyboardShortcuts.ts`
- Modify: `packages/ui/src/browser/workbench.ts` (refactor from src/workbench.ts)

- [ ] **Step 1: Create ActivityBar widget**

Create `packages/ui/src/browser/activityBar.ts`:
```typescript
import { Emitter } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import { Widget } from './widget.js';
import { h } from './dom.js';

export type ActivityBarItem = 'chat' | 'tools' | 'connectors' | 'documents' | 'settings';

export class ActivityBar extends Widget {
  private _activeItem: ActivityBarItem = 'chat';
  private readonly _onDidSelectItem = this._register(new Emitter<ActivityBarItem>());
  readonly onDidSelectItem: Event<ActivityBarItem> = this._onDidSelectItem.event;

  private readonly _buttons = new Map<ActivityBarItem, HTMLElement>();

  constructor() {
    const { root } = h('div.activity-bar');
    super(root);

    const items: { id: ActivityBarItem; label: string; icon: string; bottom?: boolean }[] = [
      { id: 'chat', label: 'Chat', icon: 'chat' },
      { id: 'tools', label: 'Tool Activity', icon: 'tools' },
      { id: 'connectors', label: 'Connectors', icon: 'connectors' },
      { id: 'documents', label: 'Documents', icon: 'documents' },
      { id: 'settings', label: 'Settings', icon: 'settings', bottom: true },
    ];

    const topGroup = h('div.activity-bar-top');
    const bottomGroup = h('div.activity-bar-bottom');

    for (const item of items) {
      const btn = h('button.activity-bar-item');
      btn.root.setAttribute('title', item.label);
      btn.root.setAttribute('aria-label', item.label);
      btn.root.setAttribute('role', 'tab');
      btn.root.dataset.item = item.id;
      btn.root.textContent = item.label.charAt(0); // Placeholder icon

      this.listen(btn.root, 'click', () => {
        this.setActiveItem(item.id);
      });

      this._buttons.set(item.id, btn.root);
      (item.bottom ? bottomGroup : topGroup).root.appendChild(btn.root);
    }

    this.element.appendChild(topGroup.root);
    this.element.appendChild(bottomGroup.root);
    this._updateActive();
  }

  setActiveItem(item: ActivityBarItem): void {
    if (this._activeItem !== item) {
      this._activeItem = item;
      this._updateActive();
      this._onDidSelectItem.fire(item);
    }
  }

  private _updateActive(): void {
    for (const [id, btn] of this._buttons) {
      btn.classList.toggle('active', id === this._activeItem);
      btn.setAttribute('aria-selected', String(id === this._activeItem));
    }
  }
}
```

- [ ] **Step 2: Create StatusBar widget**

Create `packages/ui/src/browser/statusBar.ts`:
```typescript
import { Widget } from './widget.js';
import { h } from './dom.js';
import type { Disposable as DisposableType } from '@gho-work/base';

export class StatusBar extends Widget {
  private readonly _leftItems: HTMLElement;
  private readonly _rightItems: HTMLElement;

  constructor() {
    const els = h('div.status-bar', [
      h('div.status-bar-left@left'),
      h('div.status-bar-right@right'),
    ]);
    super(els.root);
    this._leftItems = els.left;
    this._rightItems = els.right;
  }

  addLeftItem(text: string, tooltip?: string): HTMLElement {
    const item = h('span.status-bar-item');
    item.root.textContent = text;
    if (tooltip) {
      item.root.title = tooltip;
    }
    this._leftItems.appendChild(item.root);
    return item.root;
  }

  addRightItem(text: string, tooltip?: string): HTMLElement {
    const item = h('span.status-bar-item');
    item.root.textContent = text;
    if (tooltip) {
      item.root.title = tooltip;
    }
    this._rightItems.appendChild(item.root);
    return item.root;
  }

  updateItem(element: HTMLElement, text: string): void {
    element.textContent = text;
  }
}
```

- [ ] **Step 3: Create KeyboardShortcuts manager**

Create `packages/ui/src/browser/keyboardShortcuts.ts`:
```typescript
import { Disposable } from '@gho-work/base';
import { addDisposableListener } from './dom.js';

interface ShortcutBinding {
  key: string;
  meta?: boolean;
  shift?: boolean;
  handler: () => void;
}

export class KeyboardShortcuts extends Disposable {
  private readonly _bindings: ShortcutBinding[] = [];

  constructor() {
    super();
    this._register(
      addDisposableListener(document, 'keydown', (e) => this._handleKeyDown(e as KeyboardEvent)),
    );
  }

  bind(binding: ShortcutBinding): void {
    this._bindings.push(binding);
  }

  private _handleKeyDown(e: KeyboardEvent): void {
    for (const binding of this._bindings) {
      const metaMatch = binding.meta ? (e.metaKey || e.ctrlKey) : !(e.metaKey || e.ctrlKey);
      const shiftMatch = binding.shift ? e.shiftKey : !e.shiftKey;
      if (e.key.toLowerCase() === binding.key.toLowerCase() && metaMatch && shiftMatch) {
        e.preventDefault();
        binding.handler();
        return;
      }
    }
  }
}
```

- [ ] **Step 4: Refactor Workbench to use new components**

Move and refactor `packages/ui/src/workbench.ts` to `packages/ui/src/browser/workbench.ts`. The new Workbench:
- Creates ActivityBar, Sidebar, content area, StatusBar
- Wires ActivityBar selection to sidebar panel switching
- Sets up keyboard shortcuts (Cmd+B toggle sidebar, Cmd+N new chat, etc.)
- Uses h() helper for layout
- Extends Disposable, registers all child widgets

Key structure:
```typescript
import { Disposable } from '@gho-work/base';
import { h } from './dom.js';
import { ActivityBar } from './activityBar.js';
import { StatusBar } from './statusBar.js';
import { KeyboardShortcuts } from './keyboardShortcuts.js';
import { ChatPanel } from './chatPanel.js';

export class Workbench extends Disposable {
  private readonly _activityBar: ActivityBar;
  private readonly _statusBar: StatusBar;
  private readonly _shortcuts: KeyboardShortcuts;
  // ...

  constructor(container: HTMLElement, ipc: IIPCRenderer) {
    super();
    // Build layout with h()
    // Wire components
    // Set up shortcuts
  }

  render(): void { /* ... */ }
}
```

The exact layout follows the UX tutorial spec:
- Activity bar: 48px wide, left side
- Sidebar: 240px, collapsible
- Main content: fills remaining space
- Status bar: 24px, bottom

- [ ] **Step 5: Move chat-panel.ts to browser/**

```bash
mv packages/ui/src/chat-panel.ts packages/ui/src/browser/chatPanel.ts
```

Update to extend Widget, use h() helper where appropriate.

- [ ] **Step 6: Update barrel exports**

Update `packages/ui/src/index.ts`:
```typescript
export { h, addDisposableListener } from './browser/dom.js';
export { Widget } from './browser/widget.js';
export { ThemeService } from './browser/theme.js';
export type { ThemeKind, IThemeService } from './browser/theme.js';
export { Workbench } from './browser/workbench.js';
export { ActivityBar } from './browser/activityBar.js';
export type { ActivityBarItem } from './browser/activityBar.js';
export { StatusBar } from './browser/statusBar.js';
export { ChatPanel } from './browser/chatPanel.js';
export { KeyboardShortcuts } from './browser/keyboardShortcuts.js';
```

- [ ] **Step 7: Delete old files**

```bash
rm packages/ui/src/workbench.ts packages/ui/src/chat-panel.ts
```

- [ ] **Step 8: Check for deep imports and update renderer entry point**

Verify no deep imports exist into `@gho-work/ui` internals:
```bash
grep -r "from.*@gho-work/ui/" packages/ apps/ --include="*.ts" | grep -v node_modules | grep -v dist
```

Fix any deep imports to use the barrel `@gho-work/ui`.

Update `apps/desktop/src/renderer/main.ts` to use the refactored Workbench import. If the Workbench constructor signature changed, update accordingly.

- [ ] **Step 9: Build and verify**

```bash
npx turbo build
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(ui): add ActivityBar, StatusBar, KeyboardShortcuts, refactor Workbench

ActivityBar with 5 items (Chat, Tools, Connectors, Documents, Settings).
StatusBar with left/right item slots.
KeyboardShortcuts manager for global keybindings.
Workbench refactored to use h() helper and Widget pattern.
CSS custom properties for light/dark theming."
```

---

**End of Chunk 5.** Workbench shell complete:
- h() DOM helper for declarative element creation
- Widget base class extending Disposable
- ActivityBar with icon buttons and selection events
- StatusBar with left/right segments
- KeyboardShortcuts manager (Cmd+B, Cmd+N, etc.)
- ThemeService with light/dark/system CSS custom properties
- Workbench refactored to compose all widgets

---

## Chunk 6: Integration Tests + Smoke Test + Final Verification

Tasks 21-23 complete Phase 1 with integration tests, a user smoke test, and verification against all acceptance criteria.

### Task 21: Workbench rendering tests (jsdom)

**Files:**
- Create: `packages/ui/src/test/browser/workbench.test.ts`
- Create: `packages/ui/src/test/browser/activityBar.test.ts`

- [ ] **Step 1: Write workbench rendering test**

Create `packages/ui/src/test/browser/workbench.test.ts`:
```typescript
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { ActivityBar } from '../../browser/activityBar.js';
import { StatusBar } from '../../browser/statusBar.js';
import { h } from '../../browser/dom.js';

describe('ActivityBar', () => {
  it('should render all activity items', () => {
    const bar = new ActivityBar();
    const el = bar.getDomNode();
    const buttons = el.querySelectorAll('.activity-bar-item');
    expect(buttons.length).toBe(5); // chat, tools, connectors, documents, settings
    bar.dispose();
  });

  it('should emit onDidSelectItem when item clicked', () => {
    const bar = new ActivityBar();
    const listener = vi.fn();
    bar.onDidSelectItem(listener);

    const connBtn = bar.getDomNode().querySelector('[data-item="connectors"]') as HTMLElement;
    connBtn.click();

    expect(listener).toHaveBeenCalledWith('connectors');
    bar.dispose();
  });

  it('should update active state', () => {
    const bar = new ActivityBar();
    bar.setActiveItem('settings');

    const settingsBtn = bar.getDomNode().querySelector('[data-item="settings"]') as HTMLElement;
    expect(settingsBtn.classList.contains('active')).toBe(true);

    const chatBtn = bar.getDomNode().querySelector('[data-item="chat"]') as HTMLElement;
    expect(chatBtn.classList.contains('active')).toBe(false);
    bar.dispose();
  });

  it('should have ARIA attributes for accessibility', () => {
    const bar = new ActivityBar();
    const buttons = bar.getDomNode().querySelectorAll('.activity-bar-item');
    for (const btn of buttons) {
      expect(btn.getAttribute('role')).toBe('tab');
      expect(btn.getAttribute('aria-label')).toBeTruthy();
    }
    bar.dispose();
  });
});

describe('StatusBar', () => {
  it('should render left and right sections', () => {
    const bar = new StatusBar();
    const el = bar.getDomNode();
    expect(el.querySelector('.status-bar-left')).toBeTruthy();
    expect(el.querySelector('.status-bar-right')).toBeTruthy();
    bar.dispose();
  });

  it('should add and update items', () => {
    const bar = new StatusBar();
    const item = bar.addLeftItem('Ready', 'System status');
    expect(item.textContent).toBe('Ready');
    expect(item.title).toBe('System status');

    bar.updateItem(item, 'Processing...');
    expect(item.textContent).toBe('Processing...');
    bar.dispose();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run packages/ui/src/test/browser/
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/test/
git commit -m "test(ui): add workbench component tests (ActivityBar, StatusBar)"
```

---

### Task 22: Phase 1 smoke test

**Files:**
- Create: `tests/smoke/phase1.ts`

- [ ] **Step 1: Write smoke test**

Create `tests/smoke/phase1.ts`:
```typescript
/**
 * Phase 1 Smoke Test — interactive verification of acceptance criteria.
 * Run with: npx tsx tests/smoke/phase1.ts
 */
import { step, autoStep, summary } from './helpers.js';

console.log('\n=== Phase 1 Smoke Test ===\n');

await autoStep('TypeScript compiles', async () => {
  const { execSync } = await import('child_process');
  execSync('npx turbo build', { stdio: 'pipe' });
});

await autoStep('All unit tests pass', async () => {
  const { execSync } = await import('child_process');
  execSync('npx vitest run', { stdio: 'pipe' });
});

await autoStep('DI resolves 3+ service chain', async () => {
  const { InstantiationService, ServiceCollection, SyncDescriptor, createServiceIdentifier } =
    await import('@gho-work/base');

  interface IA { a(): string; }
  const IA = createServiceIdentifier<IA>('smoke.IA');
  interface IB { b(): string; }
  const IB = createServiceIdentifier<IB>('smoke.IB');
  interface IC { c(): string; }
  const IC = createServiceIdentifier<IC>('smoke.IC');

  class A implements IA { a() { return 'A'; } }
  class B implements IB {
    constructor(@IA private sa: IA) {}
    b() { return `B+${this.sa.a()}`; }
  }
  class C implements IC {
    constructor(@IA private sa: IA, @IB private sb: IB) {}
    c() { return `C+${this.sa.a()}+${this.sb.b()}`; }
  }

  const sc = new ServiceCollection(
    [IA, new SyncDescriptor(A)],
    [IB, new SyncDescriptor(B)],
    [IC, new SyncDescriptor(C)],
  );
  const inst = new InstantiationService(sc);
  const c = inst.getService(IC);
  if (c.c() !== 'C+A+B+A') throw new Error(`Expected C+A+B+A, got ${c.c()}`);
});

await autoStep('SQLite stores and retrieves data', async () => {
  const Database = (await import('better-sqlite3')).default;
  const { configurePragmas, migrateDatabase } = await import('@gho-work/platform');
  const { GLOBAL_MIGRATIONS } = await import('@gho-work/platform');

  const db = new Database(':memory:');
  configurePragmas(db);
  migrateDatabase(db, GLOBAL_MIGRATIONS);

  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('test', '"hello"');
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('test') as any;
  if (row.value !== '"hello"') throw new Error(`Expected "hello", got ${row.value}`);
  db.close();
});

await step('App launches with workbench', 'Run `npm run desktop:dev` — verify:\n' +
  '  1. Activity bar visible on left with 5 icons\n' +
  '  2. Sidebar visible next to activity bar\n' +
  '  3. Chat panel in main content area\n' +
  '  4. Status bar at bottom\n' +
  '  5. Clicking activity bar icons switches sidebar panel');

await step('Theme toggle works', 'Open DevTools → Console → run:\n' +
  '  document.documentElement.setAttribute("data-theme", "dark")\n' +
  '  Then "light" — verify colors change');

await step('Keyboard shortcuts respond', 'Test these shortcuts:\n' +
  '  Cmd+B — toggle sidebar\n' +
  '  Cmd+N — new conversation\n' +
  '  Cmd+, — open settings');

summary();
```

- [ ] **Step 2: Run smoke test**

```bash
npx tsx tests/smoke/phase1.ts
```

Expected: automated steps pass, interactive steps prompt for verification.

- [ ] **Step 3: Commit**

```bash
git add tests/smoke/phase1.ts
git commit -m "test: add Phase 1 smoke test (DI, SQLite, workbench, theming)"
```

---

### Task 23: Final verification against acceptance criteria

Run through each acceptance criterion from the implementation plan and verify with evidence.

- [ ] **Step 1: Agent Host utility process starts and exchanges messages with Renderer via MessagePort**

Verify: integration test `tests/integration/agentHostIpc.test.ts` passes.
```bash
npx vitest run tests/integration/agentHostIpc.test.ts
```

- [ ] **Step 2: DI container resolves a chain of 3+ services with constructor injection**

Verify: unit test passes for 3-service chain.
```bash
npx vitest run packages/base/src/test/common/instantiationService.test.ts
```

Expected: "should resolve a chain of 3+ services" passes.

- [ ] **Step 3: User can sign in with GitHub, token persists across restarts**

Verify: auth service tests pass. Full OAuth flow requires running the app manually (covered in smoke test interactive step).
```bash
npx vitest run packages/platform/src/auth/test/
```

- [ ] **Step 4: SQLite stores and retrieves a test entity**

Verify: storage tests pass.
```bash
npx vitest run packages/platform/src/storage/test/
```

- [ ] **Step 5: Workbench renders sidebar + main panel with theme switching**

Verify: UI component tests pass.
```bash
npx vitest run packages/ui/
```

- [ ] **Step 6: TestInstantiationService can stub services and create instances**

Verify: test infrastructure tests pass.
```bash
npx vitest run packages/base/src/test/common/instantiationService.test.ts -t "TestInstantiationService"
```

- [ ] **Step 7: ensureNoDisposablesAreLeakedInTestSuite() detects leaked disposables**

Verify: disposable tracker module exists and is importable.
```bash
npx vitest run packages/base/src/test/common/lifecycle.test.ts
```

- [ ] **Step 8: All Phase 1 unit tests pass**

```bash
npx vitest run
```

Expected: 0 failures.

- [ ] **Step 9: Full build succeeds**

```bash
npx turbo build
```

Expected: all packages compile cleanly.

- [ ] **Step 10: Update implementation plan checkboxes**

Check off all Phase 1 deliverables and acceptance criteria in `docs/IMPLEMENTATION_PLAN.md`.

- [ ] **Step 11: Final commit**

```bash
git add -A
git commit -m "docs: mark Phase 1 deliverables complete in implementation plan"
```

---

**End of Chunk 6 and Phase 1 plan.**

## Summary

| Chunk | Tasks | Focus |
|-------|-------|-------|
| 1 | 1-6 | DI system, Disposables, Events, Test infrastructure |
| 2 | 7-10 | IPC channels (zod), MessagePort protocol, Agent Host |
| 3 | 11-14c | SQLite storage, migrations, schemas, SqliteStorageService, IFileService |
| 4 | 15-17 | Auth (OAuth PKCE, safeStorage, Copilot tier) |
| 5 | 18-20 | Workbench shell (h(), Widget, ActivityBar, StatusBar, theming) |
| 6 | 21-23 | Component tests, smoke test, final verification |

**Total:** 25 tasks, ~80 steps, ~50 files created/modified.

**Parallelism opportunities:** After Chunk 1 (DI foundation), Chunks 2-5 can be worked on in parallel by separate agents:
- Chunk 2 (IPC) and Chunk 3 (Storage) are independent
- Chunk 4 (Auth) depends on Chunk 3 (needs SecureStorageService concept but not SQLite directly)
- Chunk 5 (Workbench) is independent of Chunks 2-4
- Chunk 6 depends on all previous chunks
