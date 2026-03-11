---
name: retrospective
description: End-of-session retrospective. Capture what worked, what didn't, and update project memory. Run when finishing a significant chunk of work.
---

# Session Retrospective

Run this at the end of a significant work session or when the user asks for a retrospective.

## Steps

1. **What was accomplished** — List the tasks completed this session with references to implementation plan items.

2. **What went wrong** — List any issues encountered:
   - Bugs introduced and fixed
   - Wrong assumptions made
   - Tools/APIs that behaved unexpectedly
   - Time spent on dead ends

3. **What was learned** — Extract reusable lessons:
   - New patterns discovered
   - API quirks or gotchas
   - Better approaches identified after the fact

4. **Update project memory** — For each lesson learned:
   - Check if it's already captured in CLAUDE.md, auto memory, or skill files
   - If not, decide where it belongs:
     - **CLAUDE.md** — Project-wide rules or conventions
     - **Auto memory** — Patterns and debugging insights
     - **Skill files** — Process improvements
   - Write the update

5. **Update implementation plan** — Check off completed items. Note any scope changes or new risks discovered.

6. **Recommendations** — Suggest next steps based on what was learned.

## When to run

- After completing a full implementation plan phase
- After a debugging session that took > 30 minutes
- When the user explicitly asks
- Before ending a long session (> 2 hours of active work)
