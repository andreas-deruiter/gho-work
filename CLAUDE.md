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
- docs/tutorial/index.html — UX tutorial and design spec (source of truth for visual design)

## Architecture

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

**Import rule**: packages may only import from packages above them in this list. Never import downward.

**Entry point rule**: Before modifying a preload, renderer, or main process file, verify you're editing the file the build actually uses. Check `electron.vite.config.ts` for entry points — only `apps/desktop/src/` files are used by the desktop build.

**Externalization rule**: When a workspace package uses dynamic `import()` for a `node_modules` dependency, add it to `rollupOptions.external` in `electron.vite.config.ts`. Symptom of missing external: `(void 0) is not a function` at runtime.

For environment subdirectories, barrel exports, native modules, dependency decisions, and code conventions, see `.claude/skills/vscode-patterns.md`.

## Development Workflow

### Quality gates
Every code change must pass before moving on:
1. `npx turbo lint` — 0 errors
2. `npx turbo build` — clean TypeScript compilation
3. `npx vitest run --changed` — affected tests pass
4. Playwright smoke tests for UI changes: `npx playwright test`

### Testing strategy
- **Unit tests** (Vitest): co-located `*.test.ts`
- **Integration tests** (Vitest): `tests/integration/`
- **E2E tests** (Playwright): `tests/e2e/`
- **User smoke tests** (tsx): `tests/smoke/`. Run with `npx tsx tests/smoke/<name>.ts`

### Key rules
- **E2E tests must exercise real user flows** — not just check "element exists". Type input, trigger action, verify final state.
- **Catch blocks must not silently swallow errors** — always log with `console.error` or `console.warn`.
- **Verify DOM elements exist before styling them** — CSS for non-existent elements is dead code.
- **Evidence over assertions** — never claim "it works" without proof. Show test/build/runtime output.

### Verification (details in `.claude/skills/verify-task.md`)
- **HARD GATE**: Launch the app before declaring UI/IPC work complete. Use Playwright screenshots for self-verification.
- **Boss gate**: Invoke the boss agent (`subagent_type: "boss"`) before declaring any task complete.
- **Run artifacts in their actual runtime** — `turbo build` passing ≠ app launches. `vitest` passing ≠ tsx works.
- **Test both mock and real SDK paths** — mock SDK has different stream semantics than real SDK.

## Task execution

### Task sizing
| Size | Criteria | Approach |
|------|----------|----------|
| Small | Single file, < 50 lines | Proceed directly |
| Medium | Multiple files, 50-200 lines | State plan, proceed |
| Large | New package/module, > 200 lines | State plan, wait for confirmation |

### Model selection
- Use Opus for planning, architectural decisions, and complex debugging
- Use Sonnet for straightforward implementation tasks (subagents)

## Self-learning

When something goes wrong: fix it, then ask "Could a rule have prevented this?" If yes, update CLAUDE.md, memory, or the relevant skill file. When stored knowledge is wrong, fix the entry immediately.
