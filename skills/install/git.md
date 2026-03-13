---
name: install-git
description: Install and configure Git on the user's machine
---

# Install Git

## What this tool does
Git is required by GHO Work for all repository operations: cloning, committing, branching, and diffing. It is also a prerequisite for `gh` (GitHub CLI).

## Important: You are the installer

The user clicked "Install" because they want YOU to handle this. Do not tell the user to run commands — run them yourself using your bash tool. Only ask the user for information you can't determine yourself (like their name and email for git config).

## Step 1: Check current state

Run these commands to see what's already done:
- `git --version` — is it installed?
- `git config user.name` — is the identity configured?
- `git config user.email` — is the email configured?

Skip to the first step that fails.

## Step 2: Install

### macOS
Option A — Xcode Command Line Tools (simplest):
1. Run `xcode-select --install`
2. This triggers a system prompt. Tell the user to click "Install" when the dialog appears, then wait.

Option B — Homebrew (if available, gets a more recent version):
1. Run `brew install git`

### Windows
1. Check for winget: `winget --version`
2. If winget available: run `winget install --id Git.Git`
3. If not: tell the user to download from https://git-scm.com/download/win

### Linux
- Debian/Ubuntu: run `sudo apt install git`
- Fedora/RHEL: run `sudo dnf install git`
- Arch: run `sudo pacman -S git`

## Step 3: Configure identity

Ask the user for their name and email, then run:
```
git config --global user.name "Their Name"
git config --global user.email "their@email.com"
```

### Credential helper (do this automatically, no need to ask)
- macOS: `git config --global credential.helper osxkeychain`
- Windows: Git for Windows ships with Git Credential Manager; no extra step needed
- Linux: `git config --global credential.helper store`

### Default branch name (do this automatically)
```
git config --global init.defaultBranch main
```

## Step 4: Verify

Run:
- `git --version` — confirms installation
- `git config user.name` — confirms name
- `git config user.email` — confirms email

Tell the user the result: installed, configured, ready to use.

## Common pitfalls
- macOS: Xcode CLT prompt doesn't appear → run `xcode-select --install` again
- macOS: system Git is very old → install via Homebrew for a current version
- Windows: line-ending conflicts → use `core.autocrlf=input` for cross-platform repos
