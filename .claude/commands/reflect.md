# Session Reflection

This skill exists because the most valuable learning happens when things go wrong — but only if we capture the lesson where it will actually prevent the same mistake next time. A generic "lessons learned" list fades from memory; a rule added to the right file changes behavior permanently.

## When to run

- After completing a significant piece of work (implementation plan phase, major feature)
- After a debugging session that ate significant time
- When the user asks — "reflect", "retro", "what went wrong", "how can we do better"
- Before ending a long session (> 2 hours of active work)

## Step 1: Gather evidence

Before reflecting, collect the raw material. Don't rely on memory alone — look at what actually happened.

1. **Git diff since session start** — `git log --oneline` for commits this session, `git diff` for uncommitted changes. Look for reverted work, fixup commits, files changed multiple times (signs of iteration/struggle).

2. **Scan the conversation** — Walk back through the session and note:
   - Tool calls that failed or were retried
   - Times the user corrected you or expressed frustration
   - Approaches that were abandoned partway through
   - Tasks that took multiple attempts

3. **Check test results** — Were there test failures? Did tests pass but miss real bugs that surfaced later? Did the test suite catch regressions, or did you find them manually?

4. **Check build/lint output** — Were there repeated build or lint failures from the same category of mistake?

## Step 2: Classify what went wrong

Organize findings into categories. Not everything will have entries — only include categories where something actually happened. For each issue, note the **root cause** (why it happened) not just the symptom.

### Tool and API failures
Things like: wrong parameters passed to tool calls, misunderstanding of an API's behavior, tools used when a better alternative existed, retrying the same failing approach instead of changing strategy.

**Root cause patterns**: outdated mental model of the API, not reading docs first, copy-paste from a similar but different context.

### Test gaps
Tests that passed but shouldn't have (testing the wrong thing), bugs that tests should have caught but didn't, test stubs that check structure instead of behavior, missing edge case coverage.

**Root cause patterns**: testing the happy path only, asserting existence instead of correctness, not testing the actual runtime (tsx vs vitest vs Electron).

### Wrong assumptions
Incorrect beliefs about the codebase, architecture, dependencies, or runtime environment that led to wasted work. Code that compiled but failed at runtime because of environment differences.

**Root cause patterns**: not reading the code before modifying it, assuming one runtime behaves like another, not checking existing patterns first.

### Scope and approach issues
Over-engineering, scope creep, adding unrequested features, taking a complex approach when a simple one would do. Also the opposite: under-engineering that caused rework.

**Root cause patterns**: not confirming the approach with the user, gold-plating, not knowing when to stop.

### User friction
Times the user had to repeat themselves, correct a misunderstanding, or express frustration. Times you acted without confirming when you should have asked first. Times you were too verbose or not verbose enough.

**Root cause patterns**: not reading instructions carefully, making assumptions about intent, ignoring signals from the user.

### Regressions
Changes that broke existing functionality. Things that worked before but stopped working after an edit. Fixes that introduced new bugs.

**Root cause patterns**: not running the full test suite after changes, not understanding the blast radius of a change, not using the context-map skill before multi-file edits.

## Step 3: Extract improvement actions

This is the most important step. For each issue identified above, ask: **"What change to our instructions, skills, or workflow would have prevented this?"**

Each improvement action should specify:
- **What to change** — the specific file and section (e.g., "CLAUDE.md > Code conventions", "skills/after-edit.md > Steps", "memory/feedback_*.md")
- **The change** — the exact addition, modification, or removal
- **Why it helps** — how this prevents the specific failure from recurring

Categories of improvement:
- **Add a rule to CLAUDE.md** — for project-wide conventions or constraints discovered the hard way
- **Update a skill** — when a workflow step was missing, incomplete, or misleading
- **Add/update memory** — when context about the user, project, or tooling would have saved time
- **Add a test** — when a specific class of bug should be caught automatically going forward
- **No action needed** — some failures are one-offs that don't warrant a rule. That's fine. Don't over-correct.

Be selective. A rule that prevents a recurring problem is valuable; a rule for every one-time mistake creates noise. When in doubt, note the issue but don't propose a rule change.

## Step 4: Present findings and get approval

Present the reflection as a structured summary:

```
## Session reflection

### What was accomplished
- [Brief list of completed work, referencing plan items if applicable]

### What went wrong

#### [Category]: [Brief description]
- **What happened**: [Concrete description of the failure]
- **Root cause**: [Why it happened]
- **Proposed fix**: [Specific change to file X, section Y]

[Repeat for each issue]

### Proposed improvements
1. [File]: [Change description]
2. [File]: [Change description]
...

Shall I apply these improvements?
```

Wait for the user to review and approve before making any changes. They may want to modify, skip, or add to the proposals. The user knows their project better than any set of instructions can capture — their judgment is final.

## Step 5: Apply approved improvements

Once the user confirms (they may approve all, some, or none):

1. Make the approved changes to CLAUDE.md, skill files, or memory files
2. If updating memory, follow the two-step process (write memory file, update MEMORY.md index)
3. If updating CLAUDE.md or skills, keep edits minimal and focused — don't reorganize surrounding content
4. Update the implementation plan if any items were completed or scope changed

## What makes a good improvement

Good improvements are:
- **Specific** — "Add a check for Node.js imports in browser/ files" not "Be more careful about imports"
- **Actionable** — Something the agent can actually follow next time, not a vague aspiration
- **Proportional** — The weight of the rule matches the severity and frequency of the problem
- **Explained** — Include *why* so the rule can be applied intelligently, not just mechanically

Bad improvements are:
- Rules for one-time flukes that won't recur
- Vague admonitions ("be more careful", "test better")
- Duplicate of something already documented
- Over-specific rules that only apply to one exact scenario
