---
name: install-pandoc
description: Install Pandoc document converter on the user's machine
---

# Install Pandoc

## What this tool does
Pandoc enables GHO Work to convert documents between formats: DOCX, PDF, HTML, Markdown, EPUB, and more. It is used for document export, report generation, and format translation tasks initiated by the agent.

## Platform detection
- macOS: check for Homebrew (`brew --version`)
- Windows: check for winget (`winget --version`)

## Installation steps

### macOS
1. `brew install pandoc`
2. If Homebrew is not available, download the `.pkg` installer from https://github.com/jgm/pandoc/releases and run it.

### Windows
1. `winget install --id JohnMacFarlane.Pandoc`
2. If winget is not available, download the `.msi` installer from https://github.com/jgm/pandoc/releases and run it.

### Linux
- Debian/Ubuntu: `sudo apt install pandoc`
- Fedora/RHEL: `sudo dnf install pandoc`
- Arch: `sudo pacman -S pandoc`

## Post-install setup
Pandoc requires no authentication. No additional configuration is needed for basic use.

For PDF output, a LaTeX distribution must also be installed (see Common pitfalls below).

## Verification
- `pandoc --version` — should print the installed version (e.g., `pandoc 3.1.9`)

## Common pitfalls
- **PDF output fails** → LaTeX is required for PDF conversion. Install a minimal LaTeX distribution:
  - macOS: `brew install --cask basictex` (smaller) or `mactex` (full)
  - macOS alternative: install TinyTeX via R: `tinytex::install_tinytex()`
  - Windows: install MiKTeX from https://miktex.org or TinyTeX from https://yihui.org/tinytex/
- **PATH not updated after install on Windows** → open a new terminal window; the installer should update PATH automatically
- **Older system pandoc** → system package managers sometimes ship outdated versions; prefer the official installer for features like Lua filters and newer output formats

## Resume
Check current state before continuing:
1. `pandoc --version` → is it installed?

If the command succeeds, installation is complete.
