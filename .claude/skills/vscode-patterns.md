---
name: vscode-patterns
description: Reference guide for VS Code patterns. Consult when implementing DI, events, disposables, services, widgets, IPC, or any infrastructure component. Points to exact files in references/vscode/.
---

# VS Code Patterns Reference

Use this skill when implementing infrastructure components. Look up the VS Code reference implementation before writing code.

## Where to look

The VS Code source is at `references/vscode/`. Key directories:

```
references/vscode/src/vs/
  base/common/          # Utilities — lifecycle, events, async, data structures, strings
  base/browser/         # DOM utilities, h() helper, input handling
  base/browser/ui/      # 35 widget components (SplitView, ListView, TreeView, etc.)
  base/parts/ipc/       # IPC infrastructure, ProxyChannel
  platform/instantiation/  # DI system (createDecorator, InstantiationService)
  platform/             # Base services (files, storage, configuration, etc.)
  workbench/            # Full workbench shell and layout
```

## Pattern 1: Dependency Injection

**Reference files:**
- `src/vs/platform/instantiation/common/instantiation.ts` — `createDecorator`, `ServiceIdentifier`
- `src/vs/platform/instantiation/common/serviceCollection.ts` — `ServiceCollection`
- `src/vs/platform/instantiation/common/instantiationService.ts` — resolver
- `src/vs/platform/instantiation/common/descriptors.ts` — `SyncDescriptor` for lazy init

**How it works:**
```typescript
// 1. Define interface + decorator (same name trick)
export interface IMyService { doThing(): void; }
export const IMyService = createServiceIdentifier<IMyService>('myService');

// 2. Implement
class MyServiceImpl implements IMyService {
  constructor(@ILogService private readonly logService: ILogService) {}
  doThing() { this.logService.info('done'); }
}

// 3. Register (at module scope)
registerSingleton(IMyService, MyServiceImpl, InstantiationType.Delayed);
```

**Our adaptation:** We use `createServiceIdentifier<T>()` (not `createDecorator` — we don't use TypeScript experimental decorators). Same pattern otherwise.

**Key difference from VS Code:** VS Code uses `createDecorator` which returns a function that works as both a type and a parameter decorator. We may use a simpler approach since we target TypeScript 5.x decorators. Study the VS Code implementation and decide during Phase 1.

## Pattern 2: Events

**Reference file:** `src/vs/base/common/event.ts`

**Core pattern:**
```typescript
class MyService extends Disposable {
  private readonly _onDidChange = this._register(new Emitter<IChangeEvent>());
  readonly onDidChange: Event<IChangeEvent> = this._onDidChange.event;

  doSomething() {
    // Only the owner can fire
    this._onDidChange.fire({ type: 'update' });
  }
}

// Consumer
const disposable = myService.onDidChange(event => { /* handle */ });
// Later: disposable.dispose() to unsubscribe
```

**Composition utilities** (all on `Event` namespace):
- `Event.map(event, fn)` — transform payload
- `Event.filter(event, predicate)` — only fire when condition met
- `Event.debounce(event, merge, delay)` — debounce
- `Event.latch(event)` — skip duplicate consecutive values
- `Event.buffer(event)` — accumulate events, flush on first listener

**Naming convention:** `on[Will|Did]VerbNoun`
- `onDidChangeAuth` — auth state changed
- `onWillDispose` — about to dispose
- `onDidAddServer` — server was added

## Pattern 3: Disposables

**Reference file:** `src/vs/base/common/lifecycle.ts`

**Hierarchy:**
- `IDisposable` — interface with `dispose(): void`
- `Disposable` — base class with `_register<T>(disposable: T): T` and `_isDisposed` flag
- `DisposableStore` — safe collection, auto-disposes all children. Use instead of `IDisposable[]`.
- `DisposableMap<K>` — map of disposables, auto-disposes when key overwritten/removed
- `MutableDisposable<T>` — single value that changes, auto-disposes old when replaced
- `toDisposable(fn)` — wraps a cleanup function as IDisposable

**Rules:**
1. Every class that holds resources extends `Disposable`
2. Register child disposables with `this._register(child)` — they auto-dispose when parent disposes
3. Never use raw `IDisposable[]` — use `DisposableStore`
4. Event listeners always return `IDisposable` — always dispose them
5. In tests, verify no leaks (adapt `ensureNoDisposablesAreLeakedInTestSuite()`)

## Pattern 4: Service Organization

**Reference:** any service in `src/vs/platform/` (e.g., `files/`, `configuration/`, `storage/`)

**Standard layout for our project:**
```
packages/<pkg>/src/<serviceName>/
  common/
    <serviceName>.ts          # IServiceName interface + createServiceIdentifier
    <serviceName>Impl.ts      # Platform-agnostic implementation
  browser/
    <serviceName>Impl.ts      # DOM-dependent implementation
  node/
    <serviceName>Impl.ts      # Node.js-dependent implementation
  test/
    <serviceName>.test.ts     # Tests
```

The interface file exports:
- The `IServiceName` interface (contract)
- The `IServiceName` service identifier (same name)
- Related types, enums, events

## Pattern 5: IPC / Cross-Process Communication

**Reference files:**
- `src/vs/base/parts/ipc/common/ipc.ts` — `IChannel`, `IServerChannel`
- `src/vs/base/parts/ipc/common/ipc.net.ts` — network transport
- `src/vs/base/parts/ipc/electron-main/ipc.electron.ts` — Electron IPC
- `src/vs/base/parts/ipc/common/ipc.mp.ts` — MessagePort transport

**Pattern:** Services are made available across processes via `ProxyChannel`:
- Server side: `ProxyChannel.fromService(localService)` wraps a service as an `IServerChannel`
- Client side: `ProxyChannel.toService(channel)` creates a transparent proxy
- The proxy auto-marshals method calls as `call(command, args)` and events as `listen(event)`

**Our adaptation:** We use MessagePort (Main→Renderer, Renderer→Agent Host). Study VS Code's `ipc.mp.ts` for the MessagePort transport implementation.

## Pattern 6: Widget / UI Components

**Reference files:**
- `src/vs/base/browser/dom.ts` — `h()` helper for declarative DOM creation
- `src/vs/base/browser/ui/widget.ts` — Widget base class
- `src/vs/base/browser/ui/splitview/splitview.ts` — SplitView
- `src/vs/base/browser/ui/list/listView.ts` — virtualized list
- `src/vs/base/browser/ui/tree/` — tree widget

**The `h()` helper:**
```typescript
const el = h('div.container', [
  h('div.header@header'),
  h('div.content@content', [
    h('div.sidebar@sidebar'),
    h('div.main@main'),
  ]),
]);
// el.header, el.content, el.sidebar, el.main are typed DOM refs
```

**Widget pattern:**
- All widgets extend `Disposable`
- Widgets manage their own DOM lifecycle
- Event listeners registered via `this._register(addDisposableListener(element, type, handler))`
- CSS via companion `.css` files loaded alongside the widget
- Theming via CSS custom properties (`--vscode-` prefix, we use `--gho-` prefix)

## Pattern 7: Testing

**VS Code uses:** Mocha (TDD: `suite`/`test`) + `sinon` + Node `assert`
**We use:** Vitest (similar API: `describe`/`it`/`test`) + built-in mocking + `expect`

**Adaptations from VS Code:**
- `TestInstantiationService` — mock DI container with `stub()`, `createInstance()`, `get()`, `set()`
- Disposable leak detection — port `ensureNoDisposablesAreLeakedInTestSuite()` to Vitest
- Tests organized in `test/` subdirectories matching `common/`, `browser/`, `node/`
- Test services file providing pre-configured mock services

**Reference files:**
- `src/vs/platform/instantiation/test/common/instantiationServiceMock.ts`
- `src/vs/workbench/test/browser/workbenchTestServices.ts`

## Pattern 8: Async Patterns

**Reference file:** `src/vs/base/common/async.ts`

Key patterns to adapt:
- `Lazy<T>` — compute on first access
- `IdleValue<T>` — compute during browser idle ("idle until urgent")
- `ThrottledDelayer` — throttle + delay
- `RunOnceScheduler` — schedule a callback to run once after a delay
- `CancellationToken` / `CancellationTokenSource` — cooperative cancellation
- `Barrier` — a promise that can be resolved externally
- `Queue<T>` — sequential async task execution

## Architecture Rules (from CLAUDE.md)

### Environment subdirectories

Within each package, organize code by runtime target:
- `common/` — Pure TypeScript, no DOM, no Node (runs everywhere)
- `browser/` — Requires DOM APIs (renderer process)
- `node/` — Requires Node.js APIs (main process, utility processes)
- `electron-main/` — Requires Electron main process APIs

Code in `common/` must never import from `browser/` or `node/`.

### Barrel exports must respect environment boundaries

A package barrel (`index.ts`) that re-exports both `common/` and `node/` code forces browser consumers to pull in Node.js dependencies (e.g., `better-sqlite3`), crashing the renderer. Packages with mixed environments must provide separate entry points:
- `@gho-work/<pkg>` — full package (Node.js consumers only)
- `@gho-work/<pkg>/common` — browser-safe exports (no Node.js, no native modules)

Browser code (`packages/ui/src/browser/`, renderer entry points) must import from `/common` subpaths, never from the full barrel of packages that contain Node.js code.

### Native modules and bundling

Before instantiating a class that uses a native module (like `better-sqlite3`), trace the bundling chain: is the module externalized in `electron.vite.config.ts`? Is the `require()` at the top level or lazy? Will tree-shaking remove it if the class is only used as a type? Native modules used in Electron must be lazy-loaded (`const load = () => require('mod')`) so the `require` only executes when the code path is actually reached.

**Never restore Node.js ABI for better-sqlite3.** Keep it compiled for Electron at all times. After any `npm install` or `npm rebuild`, re-run: `cd node_modules/better-sqlite3 && npx node-gyp rebuild --target=35.7.5 --arch=arm64 --dist-url=https://electronjs.org/headers --runtime=electron`.

### Dependency decisions

| Decision | When to apply |
|----------|--------------|
| **Build in-house** | UI components, performance-critical code, core patterns (DI, events, disposables) |
| **Fork/maintain** | Native bindings that need to track Electron versions |
| **Take external dep** | Commodity tasks (zip, encoding, HTTP proxy) — small, stable, well-maintained, not critical path |
| **Never** | UI frameworks (React, Vue, etc.) — we control our own rendering |

Before adding any dependency, check: Does VS Code solve this without a dependency? See `references/vscode/src/vs/base/`.

### Coding style

- PascalCase for types/enums/classes, camelCase for functions/methods/properties/variables
- Prefer `export function` over `export const fn = () =>` (better stack traces)
- Always use curly braces for loops/conditionals
- Prefer complete words in identifiers (not abbreviations)
- **DOM creation**: Use `h()` helper instead of raw `document.createElement()`. All widgets extend `Disposable`.

## When to use this skill

Before implementing any of these, read the VS Code reference first:
- [ ] DI system (Phase 1) → Pattern 1
- [ ] Event/Emitter (Phase 1) → Pattern 2
- [ ] Disposable base classes (Phase 1) → Pattern 3
- [ ] Any service (all phases) → Pattern 4
- [ ] IPC infrastructure (Phase 1) → Pattern 5
- [ ] Any UI widget (Phases 1-5) → Pattern 6
- [ ] Test infrastructure (Phase 0) → Pattern 7
- [ ] Async utilities (Phase 1) → Pattern 8
