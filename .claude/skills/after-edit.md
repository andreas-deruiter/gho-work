---
name: after-edit
description: Run after making code changes — lint check, type check, and run affected tests. Ensures zero regressions before moving on.
---

# After-Edit Verification

After making code changes, run the following checks before considering the change complete.

## Steps

1. **Lint check** — Run `npx turbo lint` (or the package-specific lint script if only one package changed). Goal: 0 errors. If a lint rule produces a false positive, suppress it inline with a comment explaining why, then note it in `.claude/skills/lint-suppressions.md`.

2. **Type check** — Run `npx turbo build` (TypeScript compilation is part of the build). All packages must compile cleanly.

3. **Run affected tests** — Run `npx vitest run --changed` to test only files affected by the change. If no tests exist for the changed code, note this but do NOT auto-generate placeholder tests.

4. **Report** — Summarize: how many lint errors, type errors, and test failures. If all pass, proceed. If any fail, fix before moving on.

## When to skip

- Documentation-only changes (*.md files)
- Configuration file changes that have no lint/type/test impact (e.g., turbo.json pipeline order)

## Suppressing false positives

When a lint rule fires incorrectly:
- Add an inline `// eslint-disable-next-line <rule-name> -- <reason>` comment
- Log the suppression in `.claude/skills/lint-suppressions.md` with: file, rule, reason, date
