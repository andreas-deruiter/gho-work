---
name: publish
description: Tag and publish a release. CI builds for macOS, Windows, and Linux automatically. Usage: /publish or /publish [version]
---

# Publish to GitHub Releases

Create a version tag and push it. GitHub Actions builds for all platforms and uploads to a draft release.

## Steps

1. **Parse arguments.** If the user passed a version (e.g. `0.1.0`), use it. Otherwise read from root `package.json`.

2. **Pre-flight checks.** Run all of these and stop if any fail:
   - `gh auth status` — confirm GitHub CLI is authenticated
   - `git status --porcelain` — STOP if there are uncommitted changes. All changes must be committed before tagging.
   - `git log --oneline -1` — show the latest commit that will be tagged
   - Confirm with the user: "Will tag the current commit as v{version} and push. CI will build macOS, Windows, and Linux and create a draft release. Proceed?"

3. **Create and push the tag:**
   ```
   git tag v{version}
   git push origin v{version}
   ```

4. **Report results:**
   - Show the Actions run URL: `gh run list --workflow=publish.yml --limit=1 --json url --jq '.[0].url'`
   - Tell the user: "CI is building. Track progress at the URL above. When all 3 platforms complete, review the draft release at: https://github.com/andreas-deruiter/gho-work/releases"

## Building locally (macOS only)

If the user explicitly asks to build locally instead of using CI, or passes `--local`:
1. Get GH_TOKEN via `gh auth token` (do NOT print it)
2. Run `npx turbo build`
3. Run `cd apps/desktop && GH_TOKEN=<token> npm run publish:mac`
4. Show the release URL when done

## Error handling

- If tag already exists, ask the user if they want to delete and recreate it: `git tag -d v{version} && git push origin :refs/tags/v{version}`
- If push fails with permission error, suggest checking repo write access
- If CI fails, link to the Actions run for debugging
