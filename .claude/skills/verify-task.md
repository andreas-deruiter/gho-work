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
