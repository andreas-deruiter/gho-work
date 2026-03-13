---
name: install-gcloud
description: Install and configure Google Cloud CLI on the user's machine
---

# Install Google Cloud CLI (gcloud)

## What this tool does
Enables GHO Work to integrate with Google Workspace (Gmail, Google Drive, Google Calendar, Google Meet) and Google Cloud resources. Provides authenticated access to Google APIs and cloud services.

## Important: You are the installer

The user clicked "Install" because they want YOU to handle this. Do not tell the user to run commands — run them yourself using your bash tool. The user should only need to do things that require their browser (like signing in to Google).

## Step 1: Check current state

Run these commands to see what's already done:
- `gcloud --version` — is it installed?
- `gcloud auth list` — is there an active account?

Skip to the first step that fails.

## Step 2: Install

### macOS
1. Check for Homebrew: `brew --version`
2. If brew available: run `brew install --cask google-cloud-sdk`
   - Note: use `--cask`, not `--formula` — the cask installs the full SDK with shell integration
3. If brew not available: tell the user to install Homebrew first, or download from https://cloud.google.com/sdk/docs/install

### Windows
1. Check for winget: `winget --version`
2. If winget available: run `winget install Google.CloudSDK`
3. If not: tell the user to download from https://cloud.google.com/sdk/docs/install-sdk#windows

## Step 3: PATH setup (macOS cask install)

After brew cask install, gcloud may not be on PATH yet. Run:
```bash
source "$(brew --prefix)/share/google-cloud-sdk/path.zsh.inc"
source "$(brew --prefix)/share/google-cloud-sdk/completion.zsh.inc"
```

Also add these lines to `~/.zshrc` (or `~/.bashrc`) so it persists:
```bash
echo 'source "$(brew --prefix)/share/google-cloud-sdk/path.zsh.inc"' >> ~/.zshrc
echo 'source "$(brew --prefix)/share/google-cloud-sdk/completion.zsh.inc"' >> ~/.zshrc
```

Verify with `gcloud --version`.

## Step 4: Authenticate

**CRITICAL: You MUST use `--no-browser` flag.** Browser-based OAuth does NOT work from a subprocess — the redirect callback loops forever.

Run: `gcloud auth login --no-browser`

Do NOT run `gcloud auth login` without `--no-browser`. The default browser flow will fail.

This prints a URL and a command the user needs to run in their browser:
- **Show the URL and any code/command to the user FIRST, prominently and clearly**
- Then tell them to open the browser and complete the sign-in
- Wait for the command to finish (it will return when auth succeeds)

## Step 5: Verify

Run:
- `gcloud --version` — confirms installation
- `gcloud auth list` — confirms active account

Tell the user the result: installed, authenticated, ready to use.

## Common pitfalls
- PATH not set after cask install → run the `source` commands above, then verify
- Multiple Google accounts → switch with `gcloud config set account <email>`
- Browser auth fails → use `gcloud auth login --no-browser` for device-code flow
- Workspace vs personal account → ensure correct account
