---
name: install-pandoc
description: Install Pandoc document converter on the user's machine
---

# Install Pandoc

## What this tool does
Pandoc enables GHO Work to convert documents between formats: DOCX, PDF, HTML, Markdown, EPUB, and more.

## Important: You are the installer

The user clicked "Install" because they want YOU to handle this. Do not tell the user to run commands — run them yourself using your bash tool.

## Step 1: Check current state

Run `pandoc --version`. If it succeeds, it's already installed — tell the user and stop.

## Step 2: Install

### macOS
1. Check for Homebrew: `brew --version`
2. If brew available: run `brew install pandoc`
3. If not: tell the user to download from https://github.com/jgm/pandoc/releases

### Windows
1. Check for winget: `winget --version`
2. If winget available: run `winget install --id JohnMacFarlane.Pandoc`
3. If not: tell the user to download from https://github.com/jgm/pandoc/releases

### Linux
- Debian/Ubuntu: run `sudo apt install pandoc`
- Fedora/RHEL: run `sudo dnf install pandoc`
- Arch: run `sudo pacman -S pandoc`

## Step 3: Verify

Run `pandoc --version` to confirm installation. Tell the user the result.

Pandoc requires no authentication or additional configuration for basic use.

## Common pitfalls
- PDF output needs LaTeX: suggest `brew install --cask basictex` (macOS) or MiKTeX (Windows) if they need PDF conversion
- Old system version → prefer official installer for latest features
