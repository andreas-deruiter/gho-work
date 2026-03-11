---
name: before-task
description: Self-assessment before starting any implementation task. Check capabilities, identify unknowns, research if needed.
---

# Before-Task Assessment

Before starting any implementation task, assess readiness.

## Steps

1. **Understand the task** — Re-read the relevant section in `docs/IMPLEMENTATION_PLAN.md`. Identify the specific deliverable and acceptance criteria.

2. **Check dependencies** — Are prerequisite tasks complete? Are the packages/files this task depends on in place?

3. **Identify unknowns** — List any APIs, libraries, or patterns you're not confident about. For each unknown:
   - Check if there's a `cli-guides/` or `docs/` file covering it
   - Search the codebase for existing usage patterns
   - If still uncertain, research using web search or context7 docs before writing code

4. **Assess tools needed** — Does this task require tools/libraries not yet installed? If so, flag them for approval before proceeding (per CLAUDE.md working style rules).

5. **Baseline capture** (Anvil-inspired) — Before making changes:
   - Note the current state of affected files (which files exist, key line counts)
   - Run the test suite to capture the current pass/fail state
   - This baseline enables "before vs after" comparison when verifying the task

6. **Plan the approach** — State your implementation plan in 3-5 bullet points. For Medium/Large tasks, get user confirmation before proceeding.

## Task sizing

| Size | Criteria | Action |
|------|----------|--------|
| Small | Single file, < 50 lines, well-understood pattern | Proceed directly |
| Medium | Multiple files, new pattern, 50-200 lines | State plan, proceed unless risky |
| Large | New package/module, architectural decision, > 200 lines | State plan, wait for confirmation |
