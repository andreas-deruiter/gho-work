# Context Map

> Adapted from [github/awesome-copilot](https://github.com/github/awesome-copilot/tree/main/plugins/context-engineering) (MIT)

Use before implementing changes that touch multiple files. Map all affected files, dependencies, and tests before writing code.

## When to Use

- Before any multi-file change
- Before refactoring across packages
- When adding a new feature that integrates with existing code
- When unsure what a change will affect

## Process

1. Search the codebase for files related to the task
2. Identify direct dependencies (imports/exports)
3. Find related tests
4. Look for similar patterns in existing code
5. Assess risks

## Output Format

```markdown
## Context Map: [task description]

### Files to Modify
| File | Purpose | Changes Needed |
|------|---------|----------------|
| path/to/file.ts | description | what changes |

### Dependencies (may need updates)
| File | Relationship |
|------|--------------|
| path/to/dep.ts | imports X from modified file |

### Test Files
| Test | Coverage |
|------|----------|
| path/to/test.ts | tests affected functionality |

### Reference Patterns
| File | Pattern |
|------|---------|
| path/to/similar.ts | example to follow |

### Risk Assessment
- [ ] Breaking changes to public API (barrel exports)
- [ ] Cross-environment boundary (Node.js ↔ browser)
- [ ] Database migrations needed
- [ ] Configuration changes required
- [ ] Import rule violations (packages importing downward)
```

**Do not proceed with implementation until this map is reviewed.**

## GHO Work Specifics

When mapping context in this project, always check:

- **Import direction** — does the change respect `base → platform → agent/connectors → ui → electron`?
- **Environment boundary** — does browser code accidentally pull in Node.js code via barrel exports? (Use `/common` subpath imports for browser code)
- **Disposable tracking** — does the change create new subscriptions that need `_register()`?
- **IPC channels** — does the change add new channels that need preload whitelisting?
- **Service registration** — does the change add new services that need DI wiring in main process?

## Refactor Planning

For multi-file refactors, extend the context map with execution phases:

```markdown
### Execution Plan

#### Phase 1: Types and Interfaces
- [ ] Update types in `common/` files first
- [ ] Verify: `npx turbo build`

#### Phase 2: Implementation
- [ ] Update implementations
- [ ] Verify: affected tests pass

#### Phase 3: Tests
- [ ] Update/add tests
- [ ] Verify: `npx turbo test`

#### Phase 4: Cleanup
- [ ] Remove deprecated code
- [ ] Update barrel exports

### Rollback Plan
If something fails:
1. `git stash` or revert to last commit
2. Re-assess the approach
```
