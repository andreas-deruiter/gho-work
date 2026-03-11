# GHO Work - Project Instructions

## Project Overview
GHO Work is an Electron-based desktop app providing agentic AI capabilities for office productivity, built on the GitHub Copilot SDK. See docs/PRD.md for full details.

## Working Style

### Stop and confirm before acting
- When asked to "consider X before doing Y", STOP after X. Present findings. Wait for confirmation before Y.
- Before installing any tools, plugins, MCP servers, or dependencies: explain WHAT you plan to install, WHY it helps the current task, and at what SCOPE. Wait for approval.
- Before making architectural decisions not covered in the PRD, flag them.

### Scope
- All tool/plugin/MCP installations should be project-scoped (--scope local) unless explicitly told otherwise.
- Keep changes focused on what was asked. Don't add tangential improvements.

### When unsure
- Ask, don't guess. A short clarifying question is better than 10 minutes of wasted work.
- If a task has multiple valid interpretations, state your interpretation before executing.

## Tech Stack
- Electron + TypeScript + Vite + electron-vite
- Turborepo monorepo (packages/base, platform, agent, connectors, ui, electron + apps/desktop)
- VS Code-inspired architecture (DI, multi-process, Event<T>, Disposable)
- Vitest for tests, Playwright for e2e
- No first-party MCP servers — rely on MCP Registry ecosystem + CLI tools

## Key Docs
- docs/PRD.md — Product requirements (source of truth)
- docs/IMPLEMENTATION_PLAN.md — Phased implementation plan (checkbox-tracked)
- docs/tutorial/index.html — UX tutorial and design spec

## VS Code Reference

The VS Code source (MIT-licensed) is cloned at `references/vscode/` (gitignored, shallow clone). Use it as a reference for patterns, not as a base to build on. See `.claude/skills/vscode-patterns.md` for a lookup guide.

### Architecture — adapted from VS Code's layering

Our monorepo packages map to VS Code's layers with strict import rules:

```
packages/base        → General utilities, data structures, UI building blocks (imports nothing)
packages/platform    → DI + base services: auth, storage, files, IPC (imports base)
packages/agent       → Copilot SDK, agent service, permissions, memory (imports base, platform)
packages/connectors  → MCP manager, registry, CLI detection (imports base, platform)
packages/ui          → Workbench shell, chat, settings, widgets (imports base, platform)
packages/electron    → Electron-specific: main process, preload, native APIs (imports all)
apps/desktop         → App entry point, ties everything together (imports all)
```

**Import rule**: packages may only import from packages above them in this list. Never import downward. This is the single most important architectural constraint.

### Environment subdirectories

Within each package, organize code by runtime target:
- `common/` — Pure TypeScript, no DOM, no Node (runs everywhere)
- `browser/` — Requires DOM APIs (renderer process)
- `node/` — Requires Node.js APIs (main process, utility processes)
- `electron-main/` — Requires Electron main process APIs

Code in `common/` must never import from `browser/` or `node/`. This enables code sharing and testability.

### Dependency decisions

Follow VS Code's framework for deciding build vs buy:

| Decision | When to apply |
|----------|--------------|
| **Build in-house** | UI components, performance-critical code, core patterns (DI, events, disposables) |
| **Fork/maintain** | Native bindings that need to track Electron versions |
| **Take external dep** | Commodity tasks (zip, encoding detection, HTTP proxy) where the package is small, stable, well-maintained, and not on the critical path |
| **Never** | UI frameworks (React, Vue, etc.) — we control our own rendering |

Before adding any dependency, check: Does VS Code solve this without a dependency? If so, study their approach first. See `references/vscode/src/vs/base/` for utilities that may already cover the need.

### Code conventions (adapted from VS Code)

**Service organization** — every service follows this pattern:
```
packages/<pkg>/src/<service>/
  common/
    <service>.ts              # Interface + createServiceIdentifier
    <service>Impl.ts          # Common implementation
  browser/
    <service>Impl.ts          # Browser-specific implementation (if needed)
  node/
    <service>Impl.ts          # Node-specific implementation (if needed)
```

**File naming**: camelCase for files (`instantiationService.ts`). Interface and decorator share the same name (`IMyService`).

**Event naming**: `on[Will|Did]VerbNoun` — `onWill` for about-to-happen, `onDid` for already-happened. Example: `onDidChangeAuth`, `onWillDispose`.

**Disposable discipline**:
- Every service, widget, and subscription must follow the Disposable pattern
- Use `DisposableStore` (not raw arrays) for managing groups of disposables
- Use `_register()` in classes extending `Disposable` to track child resources
- Tests must verify no disposables leak (adapt VS Code's `ensureNoDisposablesAreLeakedInTestSuite()` for Vitest)

**DOM creation**: Use a declarative `h()` helper (inspired by VS Code's `dom.ts`) instead of raw `document.createElement()`. All widgets extend `Disposable`.

**Coding style**:
- PascalCase for types/enums/classes, camelCase for functions/methods/properties/variables
- Prefer `export function` over `export const fn = () =>` (better stack traces)
- Always use curly braces for loops/conditionals
- Prefer complete words in identifiers (not abbreviations)

## Development Workflow

### Skills (in .claude/skills/)
Use these skills at the appropriate points in the development cycle:
- **before-task** — Self-assess readiness, capture baseline, plan approach
- **after-edit** — Lint, type check, run affected tests after every code change
- **verify-task** — Evidence-based verification against acceptance criteria
- **retrospective** — End-of-session learning capture
- **vscode-patterns** — Reference guide for VS Code patterns (consult before implementing DI, events, disposables, services, widgets, IPC)
- **electron-hardening** — Security, packaging, signing, native modules, safeStorage, multi-process, crash recovery
- **mcp-client** — MCP protocol client: transports, tool management, sampling, elicitation, OAuth, health monitoring
- **accessibility-patterns** — ARIA roles, keyboard navigation, screen reader support for every widget type
- **sqlite-patterns** — better-sqlite3 setup, schema design, migrations, performance tuning

### Quality gates
Every code change must pass before moving on:
1. `npx turbo lint` — 0 errors (suppress false positives inline, log in `.claude/skills/lint-suppressions.md`)
2. `npx turbo build` — clean TypeScript compilation
3. `npx vitest run --changed` — affected tests pass
4. Playwright smoke tests for UI changes: `npx playwright test`

### Testing strategy
- **Unit tests** (Vitest): cover service logic, edge cases, error paths. Co-located with source (`*.test.ts`).
- **Integration tests** (Vitest): cover cross-package interactions. In `tests/integration/`.
- **E2E/smoke tests** (Playwright): cover critical user flows on the Electron app. In `tests/e2e/`.
- **User smoke tests** (tsx scripts): interactive step-by-step verification. In `tests/smoke/`. Run with `npx tsx tests/smoke/<name>.ts`.

### Baseline-before-change (Anvil-inspired)
Before modifying existing code: note current test state, capture which files will change. After the change, compare to baseline to verify no regressions. The before-task and verify-task skills enforce this.

### Evidence over assertions
Never claim "it works" without proof. Show test output, build output, or runtime evidence. The verify-task skill enforces this standard.

## Task execution

### Parallel tasks
Use Claude Code's task system for independent work items. Structure tasks from the implementation plan — each deliverable item is a potential task.

### Task sizing
| Size | Criteria | Approach |
|------|----------|----------|
| Small | Single file, < 50 lines, well-understood | Proceed directly |
| Medium | Multiple files, 50-200 lines | State plan, proceed |
| Large | New package/module, > 200 lines, architectural | State plan, wait for confirmation |

### Model selection
- Use Opus for planning, architectural decisions, and complex debugging
- Use Sonnet for straightforward implementation tasks (subagents)

## Self-learning meta-rules

### Learn from failures
When something goes wrong (bug introduced, wrong assumption, dead end):
1. Fix the immediate issue
2. Ask: "Could a rule or pattern have prevented this?"
3. If yes, update CLAUDE.md, auto memory, or the relevant skill file
4. If a skill file needs updating, update it directly — don't defer

### Correct stored knowledge
When a stored memory or rule turns out to be wrong:
1. Fix the incorrect entry immediately (don't just add a new contradicting one)
2. If the error came from a skill file, update the skill file
3. If it came from auto memory, update the memory file

### Periodic review
During retrospectives, review:
- Are the skills still accurate and useful?
- Are there patterns that keep recurring that should become skills?
- Are there lint suppressions that are no longer needed?
