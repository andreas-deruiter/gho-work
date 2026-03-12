---
name: install-gcloud
description: Install and configure Google Cloud CLI on the user's machine
---

# Install Google Cloud CLI (gcloud)

## What this tool does
Enables GHO Work to integrate with Google Workspace (Gmail, Google Drive, Google Calendar, Google Meet) and Google Cloud resources. Provides authenticated access to Google APIs and cloud services.

## Platform detection
- macOS: check for Homebrew (`brew --version`), fall back to manual installer
- Windows: check for winget (`winget --version`), fall back to interactive installer

## Installation steps

### macOS
1. `brew install --cask google-cloud-sdk`
   - Note: use `--cask`, not `--formula` — the cask installs the full SDK with shell integration
2. If brew not available: download the tar.gz from https://cloud.google.com/sdk/docs/install and run `./google-cloud-sdk/install.sh`

### Windows
1. `winget install Google.CloudSDK`
2. If winget not available: download the interactive installer from https://cloud.google.com/sdk/docs/install-sdk#windows

## Post-install setup

### PATH setup (macOS cask install)
After the cask install, add gcloud to your shell PATH:
```bash
source "$(brew --prefix)/share/google-cloud-sdk/path.zsh.inc"
source "$(brew --prefix)/share/google-cloud-sdk/completion.zsh.inc"
```
Add these lines to `~/.zshrc` (or `~/.bashrc` for bash) to persist across sessions.

### Initialize and authenticate
1. Run `gcloud init`
2. Follow the interactive prompts:
   - A browser window will open for Google OAuth
   - Sign in with your Google/Workspace account
   - Approve the requested permissions
   - Select or create a Google Cloud project when prompted
   - Optionally set a default compute region/zone

## Verification
- `gcloud --version` — should print SDK version and component versions
- `gcloud auth list` — should show your active account with an asterisk

## Common pitfalls
- PATH not set after cask install → run the `source` commands above, then restart terminal
- Multiple Google accounts → switch with `gcloud config set account <email>` or run `gcloud auth login` for a new account
- Multiple Google Cloud projects → switch with `gcloud config set project <PROJECT_ID>`
- Browser auth fails → try `gcloud auth login --no-browser` for a device-code-style flow
- Workspace account vs personal Google account → ensure you sign in with the account that has Workspace access
- Python version conflict on macOS → gcloud bundles its own Python, but PATH ordering matters; check `which python3`

## Resume
1. `gcloud --version` → is it installed and on PATH?
2. `gcloud auth list` → is there an active authenticated account?
