---
name: install-workiq
description: Install and configure Work IQ CLI on the user's machine
---

# Install Work IQ CLI (workiq)

## What this tool does
Enables GHO Work to access Work IQ productivity features, including intelligent work item tracking, cross-service task aggregation, and AI-assisted prioritization. Work IQ builds on top of Microsoft Graph, so mgc must be installed and authenticated first.

## Prerequisites
Work IQ CLI depends on Microsoft Graph CLI (mgc) being installed and authenticated.

Before proceeding, verify mgc is ready:
```bash
mgc --version     # must succeed
mgc me get        # must return your user profile JSON
```

If either command fails, complete the mgc install skill first. See `skills/install/mgc.md`.

## Platform detection
- macOS: check for Homebrew (`brew --version`), fall back to dotnet global tool
- Windows: check for winget (`winget --version`), fall back to dotnet global tool

## Installation steps

> **Note:** Work IQ CLI distribution method is TBD. The steps below are placeholders and will be updated once the CLI is publicly distributed.

### macOS (placeholder)
1. *(TBD — Homebrew tap or direct download)*
2. Fallback: `dotnet tool install WorkIQ.Cli -g` *(if distributed as a dotnet global tool)*

### Windows (placeholder)
1. *(TBD — winget package or MSI installer)*
2. Fallback: `dotnet tool install WorkIQ.Cli -g` *(if distributed as a dotnet global tool)*

## Post-install setup
Work IQ typically shares authentication with mgc — no separate login step should be required if mgc is already authenticated.

If a separate auth step is needed:
1. Run `workiq auth login`
2. Follow the prompts (likely device code flow, same as mgc)

Minimum permissions required: same as mgc scopes (User.Read, Mail.Read, Files.Read, Calendars.Read) plus any Work IQ-specific scopes documented at distribution time.

## Verification
- `workiq --version` — should print version
- `workiq status` — should confirm connection to Work IQ services and show authenticated user

## Common pitfalls
- mgc not authenticated → complete mgc setup first; workiq cannot function without a valid mgc session
- Insufficient Microsoft 365 permissions → ensure mgc was authenticated with the minimum required scopes
- Work IQ tenant not provisioned → contact your organization's IT admin to provision Work IQ access
- CLI not on PATH → restart terminal after install, or add the install location to PATH manually

## Resume
1. `mgc --version` and `mgc me get` → is mgc installed and authenticated?
2. `workiq --version` → is workiq installed?
3. `workiq status` → is workiq connected and authorized?
