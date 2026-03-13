# Launch App for Testing

Build and launch the GHO Work desktop app from the current worktree so the user can test it interactively.

## Steps

1. Detect the current working directory to determine which worktree we're in (could be the main repo or a git worktree under `.worktrees/`).

2. Find the `apps/desktop` directory relative to the repo root:
   ```
   REPO_ROOT=$(git rev-parse --show-toplevel)
   APP_DIR="$REPO_ROOT/apps/desktop"
   ```

3. Kill any existing GHO Work Electron instances to avoid dock clutter:
   ```bash
   pkill -f "electron.*out/main/index.js" 2>/dev/null || true
   ```

4. Build everything:
   ```bash
   npx turbo build
   cd "$APP_DIR" && npx electron-vite build
   ```

5. Launch the app (real SDK mode by default):
   ```bash
   cd "$APP_DIR" && npx electron out/main/index.js
   ```

6. Report the branch name and repo root so the user knows which version they're testing.

## Notes

- Launch with real SDK by default (requires GitHub auth).
- If the user says "launch mock" or "launch with mock", add `--mock` flag.
- The app window will stay open — the user will close it when done.
- If the build fails, show the error and stop. Don't launch a stale build.
