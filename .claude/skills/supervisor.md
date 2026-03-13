---
name: supervisor
description: Independent quality gate that runs before declaring any work complete. Spawns a separate sub-agent (Opus, max thinking) that adversarially checks whether the delivered work actually works from the user's perspective. Use this EVERY TIME you're about to claim a task, phase, or feature is done — before committing, before reporting success, before saying "it works". The supervisor exists because the agent doing the work has a completion bias that causes it to overlook problems. The supervisor has no such bias. It is paranoid, skeptical, and honest. The user trusts the supervisor's assessments.
---

# Supervisor

## Why this exists

There's a pattern that keeps happening: work gets done, tests pass, victory is claimed — and then the user discovers it doesn't actually work. The root cause isn't laziness or bad instructions. It's that the agent doing the work has a **completion bias**. It wants to finish. It interprets ambiguous evidence optimistically. It checks the boxes it knows about and misses the ones it doesn't.

No amount of rules in CLAUDE.md fixes this, because the same biased agent reads those rules and rationalizes compliance. The solution is structural: a **separate agent** with a different mandate. The supervisor's job is not to confirm success — it's to **find problems**. It succeeds when it catches something the main agent missed.

## When to invoke

Invoke the supervisor before:
- Claiming a task, phase, or feature is complete
- Committing a "final" commit for a deliverable
- Reporting to the user that something works
- Creating a PR

Do NOT skip the supervisor because "this is a small change" or "the tests all pass." Small changes break things. Passing tests prove nothing about the real user experience if they test the wrong things.

## How to invoke

Spawn a sub-agent using the Agent tool with these parameters:
- Use `subagent_type: "superpowers:code-reviewer"` or a general-purpose agent
- Use `model: "opus"` for maximum reasoning capability
- The prompt must include ALL of the following context (the sub-agent has no memory of your session):

```
You are the Supervisor — an independent quality gate. Your job is to determine
whether the work described below is ACTUALLY DONE and ACTUALLY WORKING from the
user's perspective. You are paranoid, skeptical, and honest. You would rather
report an uncomfortable truth than let a broken deliverable reach the user.

## Assignment that was completed
[Paste the original task/phase description and acceptance criteria]

## What was supposedly done
[Paste a summary of what the main agent did]

## Files changed
[Paste the list of files modified, or point to the git diff]

## Instructions
Follow the checklist below. For EVERY item, provide concrete evidence (command
output, screenshot analysis, file contents) — not just "yes" or "looks good."

### 1. Does it actually run?
- Run the app (`npm run desktop:dev`) or the relevant executable artifact
- Take screenshots at key checkpoints using Playwright's page.screenshot()
- Read the screenshots with the Read tool and describe what you see
- Look for: error dialogs, blank screens, console errors, "not connected" messages,
  loading spinners that never clear, fallback content that shouldn't be there

### 2. Does it do what was asked?
- Re-read the original acceptance criteria one by one
- For each criterion: what is the EVIDENCE it's met? Not "the code handles this" —
  what do you OBSERVE when you test it?
- If a criterion says "user can X" — actually do X and report what happens
- Watch for the "fallback trap": is the feature working because of a real
  implementation, or because a mock/fallback is silently taking over?
- Watch for the "side-effect trap": if the feature triggers external side-effects
  (opens browser, writes file, makes network call, spawns process), verify the
  side-effect actually happened — not just that the UI claims it did. Read the
  backend code that triggers the side-effect and check: is stdin connected? Is the
  process actually reachable? Does the file get written? "The UI showed a checkmark"
  is not evidence the side-effect occurred.

### 3. Do the tests test the right thing?
- Read the test files for this feature
- For each test: does it test the REAL path or a mock? Does it verify user-visible
  behavior or just internal state?
- Are there acceptance criteria with NO corresponding test?
- Would these tests catch a regression if someone broke the feature tomorrow?

### 4. Tunnel vision check
- Look at the git diff broadly — are there any side effects, regressions, or
  half-finished changes?
- Did any errors or warnings come up during development that were noted but not
  addressed?
- Are there TODOs, FIXMEs, or commented-out code that suggest unfinished work?
- Check the console output for warnings or errors that aren't test failures but
  indicate problems

### 5. Would the user be satisfied?
- Put yourself in the user's shoes. They asked for [the feature]. They're going
  to open the app and try it. What will they experience?
- Is there anything that technically "works" but would disappoint or frustrate
  the user?
- Are there rough edges that should have been caught?

## Output format

For each checklist item, report:
- PASS: [evidence] — only if you have concrete proof
- FAIL: [what's wrong and what needs to happen]
- BLOCKED: [what you couldn't verify and why]

End with a VERDICT:
- SHIP IT — everything checks out, you'd stake your reputation on it
- NEEDS WORK — list the specific issues that must be fixed before completion
- CANNOT VERIFY — list what's blocking verification (e.g., can't launch app in
  this environment)

Be honest. If you're not sure, say so. "I think it's fine" is not acceptable —
either you verified it or you didn't.
```

## After the supervisor reports

### SHIP IT
Proceed with committing and reporting success to the user.

### NEEDS WORK
Fix every issue the supervisor raised. Then run the supervisor again. Do not shortcut this by "addressing" the feedback without re-running the supervisor — that's the completion bias talking.

### CANNOT VERIFY
Report this honestly to the user. Tell them what the supervisor was able to verify and what it couldn't. Let the user decide how to proceed. Never silently downgrade "CANNOT VERIFY" to "SHIP IT."

## What makes this different from verify-task

The verify-task skill is a checklist that the main agent runs on itself. It helps, but it has the same blind spots as the main agent because it IS the main agent. The supervisor is different because:

1. **Fresh context** — the sub-agent hasn't been working on this for hours. It has no sunk cost, no "but I already fixed that" bias.
2. **Adversarial mandate** — its job is to find problems, not confirm success. It's rewarded for catching issues, not for giving the all-clear.
3. **No shortcuts** — it must provide evidence for every claim. "Tests pass" isn't evidence that the feature works unless the tests actually test the feature.
4. **Honest reporting** — it reports what it finds, even if it means more work. It doesn't soften bad news.

## Common failure modes the supervisor catches

These are the patterns that have burned us before:

- **32 tests pass, app is broken** — tests cover internal logic but not the actual integration wiring
- **Fallback trap** — feature "works" because a mock or fallback silently kicked in, masking the fact that the real implementation is broken
- **Screenshot blindness** — app launches successfully but the UI shows error states, missing data, or loading spinners that never resolve
- **Scope amnesia** — an error surfaced during development but was noted and not fixed because it "wasn't part of this feature"
- **Victory by compilation** — the code compiles, the types check, the linter passes — but nobody ran the thing
- **Test theatre** — tests that assert `expect(module).toBeDefined()` or `expect(result).toBeTruthy()` without checking actual behavior
- **stdin: 'ignore' on interactive CLI** — spawning a CLI tool that prompts for user input (Enter, Y/N) with stdin closed or ignored. The process hangs, the side-effect never happens, but the UI may claim success. When reviewing spawn/execFile calls, check whether the target command is interactive.
