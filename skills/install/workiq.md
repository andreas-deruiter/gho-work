---
name: install-workiq
description: Install and configure Work IQ CLI on the user's machine
---

# Install Work IQ CLI (workiq)

## What this tool does
Enables GHO Work to access Work IQ productivity features, including intelligent work item tracking, cross-service task aggregation, and AI-assisted prioritization.

## Important: You are the installer

The user clicked "Install" because they want YOU to handle this. Do not tell the user to run commands — run them yourself using your bash tool. The user should only need to do things that require their browser (like signing in).

## Prerequisites

Work IQ CLI depends on Microsoft Graph CLI (mgc). Check first:
- Run `mgc --version` — if this fails, tell the user they need to install Microsoft Graph CLI first (they can click "Install" on it in the sidebar)
- Run `mgc me get` — if this fails, tell the user they need to authenticate mgc first

## Step 1: Check current state

Run these commands:
- `workiq --version` — is it installed?
- `workiq status` — is it connected?

Skip to the first step that fails.

## Step 2: Install

> **Note:** Work IQ CLI distribution method is TBD. Try these approaches:

### macOS
1. Check for Homebrew: `brew --version`
2. If brew available: try `brew install workiq` or the appropriate tap
3. Fallback: try `dotnet tool install WorkIQ.Cli -g`

### Windows
1. Check for winget: `winget --version`
2. If winget available: try `winget install WorkIQ.CLI`
3. Fallback: try `dotnet tool install WorkIQ.Cli -g`

## Step 3: Authenticate

Work IQ typically shares authentication with mgc. Run `workiq status` to check.

If separate auth is needed, run `workiq auth login`. This likely uses device code flow:
- **Show the device code to the user FIRST, prominently and clearly**
- Then tell them to open the URL in their browser
- Wait for the command to complete

## Step 4: Verify

Run:
- `workiq --version` — confirms installation
- `workiq status` — confirms connection

Tell the user the result.

## Common pitfalls
- mgc not authenticated → complete mgc setup first
- Insufficient permissions → ensure mgc has required scopes
- Tenant not provisioned → contact IT admin
