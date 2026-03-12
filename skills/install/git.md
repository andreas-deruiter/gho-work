---
name: install-git
description: Install and configure Git on the user's machine
---

# Install Git

## What this tool does
Git is required by GHO Work for all repository operations: cloning, committing, branching, and diffing. It is also a prerequisite for `gh` (GitHub CLI) and many other developer tools.

## Platform detection
- macOS: `git --version` triggers the Xcode Command Line Tools prompt if Git is not installed; alternatively check for Homebrew
- Windows: check for winget (`winget --version`)

## Installation steps

### macOS
Option A — Xcode Command Line Tools (simplest, no extra tools needed):
1. `xcode-select --install`
2. Follow the system prompt to install the Command Line Tools package.

Option B — Homebrew (if Homebrew is already installed, gets a more recent version):
1. `brew install git`

### Windows
1. `winget install --id Git.Git`
2. If winget is not available, download the installer from https://git-scm.com/download/win and run it.
   - Recommended installer options: use the default editor, use Git from the command line, use OpenSSH, use the native Windows Secure Channel library.

### Linux
- Debian/Ubuntu: `sudo apt install git`
- Fedora/RHEL: `sudo dnf install git`
- Arch: `sudo pacman -S git`

## Post-install setup

### Identity (required before first commit)
```
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

### Credential helper (recommended)
- macOS: `git config --global credential.helper osxkeychain`
- Windows: Git for Windows ships with Git Credential Manager; no extra step needed.
- Linux: `git config --global credential.helper store` (or use `libsecret` for encrypted storage)

### Default branch name (optional, avoids deprecation warnings)
```
git config --global init.defaultBranch main
```

## Verification
- `git --version` — should print the installed version (e.g., `git version 2.43.0`)
- `git config user.name` — should print the configured name
- `git config user.email` — should print the configured email

## Common pitfalls
- **macOS: Xcode CLT prompt does not appear** → run `xcode-select --install` from the terminal to trigger it manually; or use Homebrew as an alternative
- **macOS: system Git is very old** → `/usr/bin/git` is Apple's stub; install via Homebrew for a current version
- **Windows: line-ending conflicts** → the installer defaults to `core.autocrlf=true`; for cross-platform repos, use `core.autocrlf=input` instead
- **Windows: SSH keys not found** → Git for Windows may use a different SSH agent than your system; configure `core.sshCommand` to point to your preferred SSH binary
- **Credential prompts on every push** → set up a credential helper (see Post-install setup above)

## Resume
Check current state before continuing:
1. `git --version` → is it installed?
2. `git config user.name` → is the identity configured?
3. `git config user.email` → is the email configured?

If all three pass, setup is complete. Skip to whichever step failed.
