---
name: verify-task
description: Verify a completed task against acceptance criteria. Anvil-inspired evidence-based verification — proof, not promises.
---

# Task Verification

After completing an implementation task, verify it properly before marking it done.

## Steps

1. **Run the full check suite**
   - `npx turbo lint` — 0 errors
   - `npx turbo build` — clean compilation
   - `npx vitest run` — all tests pass

2. **Check acceptance criteria** — Re-read the acceptance criteria from `docs/IMPLEMENTATION_PLAN.md` for this task. For each criterion:
   - Describe the evidence that it's met (test output, screenshot, manual verification)
   - If a criterion can't be verified yet (depends on unbuilt features), note it explicitly

3. **Compare to baseline** — If a baseline was captured in the before-task skill:
   - Compare file changes (new files, modified files, deleted files)
   - Compare test results (before vs after)
   - Ensure no regressions were introduced

4. **Smoke test** — If a smoke test script exists for this feature in `tests/smoke/`, run it:
   ```bash
   npx tsx tests/smoke/<feature>.ts
   ```

5. **Report** — Present a verification summary:
   - Checks passed/failed
   - Acceptance criteria met/unmet
   - Baseline comparison (regressions: yes/no)
   - Smoke test result (if applicable)

## Evidence standard

Do not claim a task is complete based on "it should work" or "I wrote the code correctly." Provide evidence:
- Test output showing passes
- Build output showing clean compilation
- Runtime output showing expected behavior

## HARD GATE: Launch the app for UI/IPC changes

After completing any phase or feature that touches UI, IPC, or service wiring: you MUST build and launch the app, exercise the primary user flow, and report what you observed BEFORE committing.

**Self-verification with screenshots:** Write a temp Playwright script that uses `_electron.launch()` to launch the built app, exercise user flows, and call `page.screenshot()` at each checkpoint. View the screenshots with the Read tool. Clean up the temp script after.

**Never claim "headless environment" on macOS.** Darwin is a desktop OS. Always attempt the app launch.

## HARD GATE must verify the actual feature

Launching the app and seeing it render is necessary but not sufficient. The verification must exercise the specific feature that was implemented. If the feature is "real SDK integration," verify the app is using the real SDK — not silently falling back to mock.

## Run every executable artifact in its actual runtime

Different runtimes have different capabilities:
- **Vitest** (Node.js + Vite transforms) supports `experimentalDecorators` and top-level await
- **tsx/esbuild** does not support parameter decorators or top-level await in CJS
- **Electron renderer** (browser) cannot use Node.js builtins (`util`, `fs`, `path`)

A successful `turbo build` is not a proxy for "the app launches." A successful `vitest run` is not a proxy for "the smoke test works under tsx."

## Verify tool output, not just exit code

When a build or rebuild tool reports success, verify the artifact was actually modified (check file timestamp, size, or content hash). Tools can report success while producing no change.

## Verify bundled resource paths at runtime

`app.getAppPath()` returns different values in dev vs packaged builds. After adding any path that resolves relative to `app.getAppPath()`, verify the resolved path at runtime.

## Silent fallbacks must be tested in both directions

When a service has a fallback path (e.g., mock mode), tests must verify:
1. **The primary path works** — the real implementation loads, constructs, and starts
2. **The fallback triggers only when expected** — not silently masking a broken primary path

**Mock and real SDK have different stream semantics.** The mock SDK completes synchronously and does not emit lifecycle events (e.g., `done`) from its generator. The real SDK emits `done` as a yielded event. Any feature that depends on stream lifecycle events must be tested without `--mock`.

## Boss gate

Before declaring ANY task, phase, or feature complete, invoke the boss agent (`.claude/agents/boss.md`) using the `Agent` tool with `subagent_type: "boss"`. The boss is an independent agent whose sole job is to find problems. If the boss says NEEDS WORK, fix the issues and re-run.
