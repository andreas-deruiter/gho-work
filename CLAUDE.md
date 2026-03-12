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
- docs/tutorial/index.html — UX tutorial and design spec (source of truth for visual design: icons, colors, layout)
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

**Entry point rule**: Before modifying a preload, renderer, or main process file, verify you're editing the file that the build actually uses. Check the build config (`electron.vite.config.ts` or equivalent) for the actual entry points. The monorepo has both package-level files (`packages/electron/src/preload/`) and app-level files (`apps/desktop/src/preload/`) — only the app-level files are used by the desktop build.

**Externalization rule**: When a workspace package uses dynamic `import()` for a `node_modules` dependency, electron-vite will try to bundle it (because workspace packages are in the `exclude` list for `externalizeDepsPlugin`). Add such dependencies to `rollupOptions.external` in `electron.vite.config.ts`. The symptom of a missing external is runtime errors like `(void 0) is not a function` that don't reproduce in Vitest (which doesn't bundle).

### Environment subdirectories

Within each package, organize code by runtime target:
- `common/` — Pure TypeScript, no DOM, no Node (runs everywhere)
- `browser/` — Requires DOM APIs (renderer process)
- `node/` — Requires Node.js APIs (main process, utility processes)
- `electron-main/` — Requires Electron main process APIs

Code in `common/` must never import from `browser/` or `node/`. This enables code sharing and testability.

**Barrel exports must respect environment boundaries.** A package barrel (`index.ts`) that re-exports both `common/` and `node/` code forces browser consumers to pull in Node.js dependencies (e.g., `better-sqlite3`), crashing the renderer. Packages with mixed environments must provide separate entry points:
- `@gho-work/<pkg>` — full package (Node.js consumers only)
- `@gho-work/<pkg>/common` — browser-safe exports (no Node.js, no native modules)

Browser code (`packages/ui/src/browser/`, renderer entry points) must import from `/common` subpaths, never from the full barrel of packages that contain Node.js code.

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
- **supervisor** — Independent quality gate (spawns Opus sub-agent) that adversarially verifies work before completion. MUST run before claiming any task/phase is done.
- **`/reflect`** — End-of-session failure analysis and instruction improvement (slash command in `.claude/commands/`)
- **vscode-patterns** — Reference guide for VS Code patterns (consult before implementing DI, events, disposables, services, widgets, IPC)
- **electron-hardening** — Security, packaging, signing, native modules, safeStorage, multi-process, crash recovery
- **mcp-client** — MCP protocol client: transports, tool management, sampling, elicitation, OAuth, health monitoring
- **accessibility-patterns** — ARIA roles, keyboard navigation, screen reader support for every widget type
- **sqlite-patterns** — better-sqlite3 setup, schema design, migrations, performance tuning
- **copilot-sdk** — GitHub Copilot SDK API reference: sessions, streaming, tools, MCP integration, custom agents (consult when wiring agent service)
- **playwright-testing** — Playwright e2e patterns for Electron: app exploration, test generation, locator strategy, debugging
- **context-map** — Pre-edit checklist: map affected files, dependencies, tests, and risks before multi-file changes

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

### E2E tests must exercise real user flows
Automated tests that only check "element exists" or "module exports" give false confidence. Every e2e test must exercise the actual interaction: type input, trigger the action, wait for the result, verify the final state (including absence of transient UI like loading indicators). A test that doesn't interact like a user would is a structural check, not a behavior check — label and treat it accordingly.

### Baseline-before-change (Anvil-inspired)
Before modifying existing code: note current test state, capture which files will change. After the change, compare to baseline to verify no regressions. The before-task and verify-task skills enforce this.

### Evidence over assertions
Never claim "it works" without proof. Show test output, build output, or runtime evidence. The verify-task skill enforces this standard. Automated test pass is necessary but not sufficient — if the tests don't cover the user-facing behavior, they don't count as evidence for that behavior.

### HARD GATE: Launch the app before declaring completion
**After completing any phase or feature that touches UI, IPC, or service wiring: you MUST run `npm run desktop:dev`, exercise the primary user flow, and report what you observed BEFORE committing the final commit.** This is not optional. This is not deferrable. Unit tests passing is not a substitute. "I'll add a Playwright test" is not a substitute. You must launch the real app and verify it works the way a user would use it.

**Self-verification with screenshots:** Write a temp script that uses `_electron.launch()` from `@playwright/test` to launch the built app, exercise user flows, and call `page.screenshot()` at each checkpoint. View the screenshots with the Read tool to self-verify. This is the standard approach — do not ask the user to visually confirm what you can check yourself. Clean up the temp script after verification.

**Never claim "headless environment" on macOS.** Darwin is a desktop OS. Always attempt the app launch.

### Run every executable artifact in its actual runtime
A build pass and unit test pass say nothing about whether the app works in its real environment. Different runtimes have different capabilities:
- **Vitest** (Node.js + Vite transforms) supports `experimentalDecorators` and top-level await
- **tsx/esbuild** does not support parameter decorators or top-level await in CJS
- **Electron renderer** (browser) cannot use Node.js builtins (`util`, `fs`, `path`)

After writing any executable artifact, run it the way a user would:
- Smoke test (`tests/smoke/*.ts`) → run `npx tsx tests/smoke/<name>.ts`
- Desktop app changes → run `npm run desktop:dev` and verify the window renders
- E2E tests → run `npx playwright test`

A successful `turbo build` is not a proxy for "the app launches." A successful `vitest run` is not a proxy for "the smoke test works under tsx."

### Verify bundled resource paths at runtime
`app.getAppPath()` returns different values in dev vs packaged builds. In dev it returns the directory of the main entry script (e.g., `apps/desktop/out/main`), not the project root. After adding any path that resolves relative to `app.getAppPath()`, verify it resolves correctly by logging and checking at runtime — don't assume the path is right from reading the code.

### Catch blocks must not silently swallow errors
Every `catch` block that falls back to an alternative path must log the error (`console.error` or `console.warn`). Silent catch blocks mask the real failure and make debugging impossible. If the fallback is intentional, the log message should explain what failed and why the fallback was chosen.

### Verify DOM elements exist before styling them
Before adding CSS rules for an element, verify the element is actually created in the render code. CSS for a non-existent element is dead code that gives false confidence. Check both the DOM creation (in `render()` / `h()` calls) and the CSS selectors match.

### Silent fallbacks must be tested in both directions
When a service has a fallback path (e.g., mock mode), tests must verify:
1. **The primary path works** — the real implementation loads, constructs, and starts
2. **The fallback triggers only when expected** — not silently masking a broken primary path

A test that only exercises the fallback proves the fallback works, not that the real thing works. If every test uses `useMock: true`, you have zero coverage of the actual integration.

### HARD GATE must verify the actual feature, not just "app runs"
Launching the app and seeing it render is necessary but not sufficient. The HARD GATE verification must exercise the specific feature that was implemented. If the feature is "real SDK integration," verify the app is using the real SDK — not silently falling back to mock. Check console output, network activity, or behavioral differences that distinguish real from fake.

### Supervisor gate: before declaring completion, invoke the supervisor skill
The HARD GATES above are self-checks — the same agent that did the work verifies it. History shows this is insufficient: the agent's completion bias causes it to interpret ambiguous evidence optimistically. **Before declaring ANY task, phase, or feature complete, invoke the supervisor skill.** The supervisor spawns an independent sub-agent (Opus) whose sole job is to find problems. It runs the app, takes screenshots, reads them, checks acceptance criteria against actual behavior, and reports honestly. If the supervisor says NEEDS WORK, fix the issues and re-run the supervisor. Do not skip this step for "small changes" — small changes have caused the biggest surprises.

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
During reflections, review:
- Are the skills still accurate and useful?
- Are there patterns that keep recurring that should become skills?
- Are there lint suppressions that are no longer needed?
