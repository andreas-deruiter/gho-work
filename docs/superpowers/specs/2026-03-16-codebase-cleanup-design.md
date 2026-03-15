# Codebase Cleanup Design Spec

**Date:** 2026-03-16
**Branch:** refactor/codebase-cleanup
**Scope:** Full codebase — cleanup, test infrastructure, structural refactoring

## Problem

The codebase has grown through rapid feature development and accumulated:
- Dead artifacts and unused code
- Inconsistent test organization with duplicated utilities
- God classes (mainProcess.ts at 1550 lines, pluginsPage.ts at 1221, chatPanel.ts at 919)
- Silent error swallowing in catch blocks and void promises
- CSS duplication and lint violations

The architecture itself is solid (clean layering, no circular deps, proper DI/Disposable patterns). This work is about pruning and restructuring, not redesigning.

## Phase 1: Quick Cleanup

**Goal:** Remove dead weight, fix lint errors, clean up artifacts.

Changes:
1. **Delete accumulated artifacts** — `.e2e-userdata-*` directories, `.e2e-screenshots/`, `.e2e-test-instructions/`, `.superpowers/brainstorm/` sessions (add to .gitignore if not already)
2. **Remove unused imports** — `handleAddMCPServer`, `handleRemoveMCPServer`, `handleListMCPServers` in `mainProcess.ts`
3. **Remove unused dependency** — `better-sqlite3` from `connectors/package.json`
4. **Remove unused IPC channel** — `PORT_AGENT_HOST` from `ipc.ts`
5. **Remove transitive deps** — `agent` and `connectors` from `apps/desktop/package.json` (they come via `electron`)
6. **Consolidate CSS** — deduplicate `@keyframes spin` (defined 3 times)
7. **Fix console.log violations** — replace 9 `console.log` calls with `console.warn`/`console.error` per lint rules
8. **Fix tautological test** — `mockCopilotSDK.test.ts:127` `expect(true).toBe(true)`
9. **Remove skipped placeholder** — `connectorSetup.test.ts:57` permanently-skipped test

## Phase 2: Test Infrastructure

**Goal:** Improve test organization and reduce duplication.

Changes:
1. **Move MockCopilotSDK** — from `agent/src/node/mockCopilotSDK.ts` (production code) to `agent/src/test/mockCopilotSDK.ts`. Update all imports. Keep it exported from package index (it's used by electron tests) but clearly mark as test utility.
2. **Extract shared test helpers** — create `packages/ui/src/test/mockIpc.ts` with shared `createMockIPC()` factory, replace 3+ duplicate implementations across UI test files.
3. **Consolidate duplicate type tests** — merge `base/src/common/types.test.ts` and `base/src/__tests__/types.test.ts` into single file at `base/src/common/types.test.ts`.

## Phase 3: Structural Refactoring

**Goal:** Decompose god classes into focused modules.

### 3A: mainProcess.ts (1550 → ~300 lines orchestrator)

Extract into focused modules within `packages/electron/src/main/`:
- **`diContainer.ts`** — `createDIContainer()`: all service instantiation and registration (~30 services)
- **`ipcHandlers.ts`** — `registerIpcHandlers()`: all 40+ IPC handler registrations, organized by domain (agent, plugin, mcp, storage, auth, files, settings)
- **`sdkLifecycle.ts`** — `initializeSDK()`: SDK startup, ready promise, error handling
- **`pluginReconciler.ts`** — `reconcilePluginState()`: plugin scanning, loading, reconciliation at startup

`mainProcess.ts` becomes a thin orchestrator that calls these in sequence.

### 3B: chatPanel.ts (919 → ~350 lines + 2 extracted modules)

Extract from `packages/ui/src/browser/chatPanel.ts`:
- **`chatMessageRenderer.ts`** — DOM building for messages, markdown rendering, tool call rendering
- **`chatStreamManager.ts`** — streaming state management, parts accumulation, lifecycle events

`chatPanel.ts` retains: input handling, IPC coordination, layout, keyboard shortcuts.

### 3C: Add error handling

- Replace empty `catch {}` blocks in `mcpConnection.ts`, `pluginInstaller.ts`, `mcpClientManagerImpl.ts` with `console.warn()` logging
- Add `.catch()` to fire-and-forget `void` promises in UI event handlers (pluginsPage.ts and similar)

## Constraints

- **No behavior changes** — all refactoring must be pure restructuring. Same API surface, same runtime behavior.
- **Import rules preserved** — extracted modules stay within their package. No new cross-package dependencies.
- **Tests must pass** — run `npx vitest run --changed` after each phase. Pre-existing SQLite ABI failures are excluded.
- **Build must pass** — `npx turbo build` clean after each phase.

## Risk

- **Phase 3A is highest risk** — mainProcess.ts is the app's entry point. Incorrect extraction could break IPC wiring. Mitigated by: keeping the same function signatures, testing with `npx turbo build`, and running Playwright E2E after.
- **Phase 3B moderate risk** — ChatPanel is the main UI component. Mitigated by: extracting pure functions first, keeping event wiring in the original file.
- **Phases 1-2 are low risk** — deletions and moves with straightforward import updates.

## Success Criteria

1. `npx turbo lint` — 0 errors (currently has warnings from unused imports)
2. `npx turbo build` — clean compilation
3. `npx vitest run` — same pass/fail counts as baseline (681 pass, 11 fail from pre-existing SQLite)
4. No file over 500 lines in the changed set (mainProcess.ts, chatPanel.ts)
5. Zero empty catch blocks in changed files
