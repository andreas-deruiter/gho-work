---
name: install-gh
description: Install and configure GitHub CLI on the user's machine
---

# Install GitHub CLI (gh)

## What this tool does
`gh` enables GHO Work to manage GitHub issues, pull requests, repositories, and Actions workflows directly from conversations.

## Important: You are the installer

The user clicked "Install" because they want YOU to handle this. Do not tell the user to run commands — run them yourself using your bash tool. The user should only need to do things that require their browser (like signing in to GitHub).

## Step 1: Check current state

Run these commands to see what's already done:
- `gh --version` — is it installed?
- `gh auth status` — is it authenticated?

Skip to the first step that fails.

## Step 2: Install

### macOS
1. Check for Homebrew: `brew --version`
2. If brew available: run `brew install gh`
3. If brew not available: tell the user to download from https://github.com/cli/cli/releases

### Windows
1. Check for winget: `winget --version`
2. If winget available: run `winget install --id GitHub.cli`
3. If not, check chocolatey: `choco --version`, then `choco install gh`
4. If neither: tell the user to download from https://github.com/cli/cli/releases

### Linux
- Debian/Ubuntu: run `sudo apt install gh` (after adding GitHub apt repo)
- Fedora/RHEL: run `sudo dnf install gh`
- Arch: run `sudo pacman -S github-cli`

## Step 3: Authenticate

Run `gh auth login --web` to start browser-based OAuth.

This will:
- Print a one-time code
- **Show the code to the user FIRST, prominently and clearly**
- Then tell them the browser will open where they can enter the code and sign in
- Wait for the command to complete

If `--web` doesn't work, try `gh auth login` with protocol HTTPS and browser auth.

Scopes needed: `repo`, `read:org`

## Step 4: Verify

Run:
- `gh --version` — confirms installation
- `gh auth status` — confirms authentication with user and scopes

Tell the user the result: installed, authenticated, ready to use.

## Common pitfalls
- **Homebrew not installed** → install Homebrew first
- **Corporate SSO** → use `gh auth login --hostname enterprise.github.com`
- **Multiple accounts** → switch with `gh auth switch`
- **PATH not updated** → restart shell or `source ~/.zshrc`
