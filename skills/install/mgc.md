---
name: install-mgc
description: Install and configure Microsoft Graph CLI on the user's machine
---

# Install Microsoft Graph CLI (mgc)

## What this tool does
Enables GHO Work to access Microsoft 365 services: Outlook email, OneDrive files, Teams messages, Calendar events, SharePoint documents.

## Important: You are the installer

The user clicked "Install" because they want YOU to handle this. Do not tell the user to run commands — run them yourself using your bash tool. The user should only need to do things that require their browser (like signing in to Microsoft).

## CRITICAL: Install `mgc`, not `m365`

These are different tools:
- `mgc` = Microsoft Graph CLI (Microsoft's official tool) — THIS is what you're installing
- `m365` = CLI for Microsoft 365 (PnP community tool) — NOT this one

Do not install `m365` or any other tool. Install `mgc` only.

## Step 1: Check current state

Run these commands to see what's already done:
- `mgc --version` — is it installed?
- `mgc me get` — is it authenticated?

Skip to the first step that fails.

## Step 2: Install

### macOS
1. Check for Homebrew: `brew --version`
2. If brew available: run `brew install microsoft/msgraph/msgraph-cli`
3. If brew not available: run `dotnet tool install Microsoft.Graph.Cli -g` (requires .NET runtime)

### Windows
1. Check for winget: `winget --version`
2. If winget available: run `winget install Microsoft.GraphCLI`
3. If not: run `dotnet tool install Microsoft.Graph.Cli -g`

## Step 3: Authenticate

**CRITICAL: You MUST use device code flow.** Browser-based OAuth does NOT work from a subprocess — the redirect callback loops forever.

Run: `mgc login --strategy DeviceCode --scopes "User.Read Mail.Read Files.Read Calendars.Read"`

Do NOT run `mgc login` without `--strategy DeviceCode`. The default browser flow will fail.

This will print a URL and a device code to the terminal:
- **Show the device code to the user FIRST, prominently and clearly**
- Then tell them to open https://microsoft.com/devicelogin in their browser
- Tell them to enter the code and sign in with their Microsoft account
- Wait for the command to complete (it returns when auth succeeds)

Minimum scopes for GHO Work: User.Read, Mail.Read, Files.Read, Calendars.Read

## Step 4: Verify

Run:
- `mgc --version` — confirms installation
- `mgc me get` — confirms authentication (should return user profile JSON)

Tell the user the result: installed, authenticated, ready to use.

## Common pitfalls
- **Auth loop in browser** → you used browser flow instead of device code. Always use `--strategy DeviceCode`
- .NET runtime needed for dotnet tool install → install from https://dot.net
- Tenant restrictions → admin may need to consent to the app
- Conditional access policies → contact IT admin
- Multiple accounts → sign out first with `mgc logout`, then sign in with correct account
