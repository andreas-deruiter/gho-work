---
name: install-gh
description: Install and configure GitHub CLI on the user's machine
---

# Install GitHub CLI (gh)

## What this tool does
`gh` enables GHO Work to manage GitHub issues, pull requests, repositories, and Actions workflows directly from conversations. It is the primary bridge between the agent and GitHub-hosted projects.

## Platform detection
- macOS: check for Homebrew (`brew --version`), fall back to `.pkg` from GitHub releases
- Windows: check for winget (`winget --version`), fall back to Chocolatey (`choco --version`), fall back to `.msi` from GitHub releases

## Installation steps

### macOS
1. `brew install gh`
2. If Homebrew is not available, download the `.pkg` from https://github.com/cli/cli/releases and run the installer.

### Windows
1. `winget install --id GitHub.cli`
2. If winget is not available: `choco install gh`
3. If neither is available: download the `.msi` from https://github.com/cli/cli/releases and run the installer.

### Linux
- Debian/Ubuntu: `sudo apt install gh` (after adding the GitHub apt repo per https://cli.github.com/manual/installation)
- Fedora/RHEL: `sudo dnf install gh`
- Arch: `sudo pacman -S github-cli`

## Post-install setup
Auth flow: `gh auth login`
1. Select **GitHub.com** (or your enterprise hostname)
2. Select **HTTPS** protocol
3. Authenticate via **browser OAuth** (preferred) or paste a personal access token
4. Scopes needed: `repo`, `read:org`

## Verification
- `gh --version` — should print the installed version (e.g., `gh version 2.45.0`)
- `gh auth status` — should show the logged-in user and active scopes

## Common pitfalls
- **Homebrew not installed** → install Homebrew first:
  `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`
- **Corporate SSO** → authenticate against the enterprise hostname:
  `gh auth login --hostname enterprise.github.com`
- **Multiple GitHub accounts** → switch between them with `gh auth switch`
- **PATH not updated after install** → restart the shell or run `source ~/.zshrc` (macOS/Linux) or open a new terminal (Windows)
- **`winget` not available on older Windows** → update Windows or use the `.msi` installer directly

## Resume
Check current state before continuing:
1. `gh --version` → is it installed?
2. `gh auth status` → is it authenticated?

If both pass, installation is complete. Skip to whichever step failed.
