---
name: install-mgc
description: Install and configure Microsoft Graph CLI on the user's machine
---

# Install Microsoft Graph CLI (mgc)

## What this tool does
Enables GHO Work to access Microsoft 365 services: Outlook email, OneDrive files, Teams messages, Calendar events, SharePoint documents.

## Platform detection
- macOS: check for Homebrew, fall back to dotnet global tool
- Windows: check for winget, fall back to dotnet global tool

## Installation steps

### macOS
1. `brew install microsoft/msgraph/msgraph-cli`
2. If brew not available: `dotnet tool install Microsoft.Graph.Cli -g` (requires .NET runtime)

### Windows
1. `winget install Microsoft.GraphCLI`
2. If winget not available: `dotnet tool install Microsoft.Graph.Cli -g`

## Post-install setup
Auth uses device code flow:
1. Run `mgc login --scopes "User.Read Mail.Read Files.Read Calendars.Read"`
2. A device code will be displayed — copy it
3. Open https://microsoft.com/devicelogin in a browser
4. Enter the device code
5. Sign in with your Microsoft account
6. Approve the requested permissions

Minimum scopes for GHO Work: User.Read, Mail.Read, Files.Read, Calendars.Read

## Verification
- `mgc --version` — should print version
- `mgc me get` — should return user profile JSON

## Common pitfalls
- .NET runtime needed for dotnet tool install → install .NET from https://dot.net
- Tenant restrictions → admin may need to consent to the app
- Conditional access policies blocking device code → contact IT admin
- Multiple Microsoft accounts → sign out first with `mgc logout`, then sign in with correct account
- Firewall blocking → ensure access to login.microsoftonline.com and graph.microsoft.com

## Resume
1. `mgc --version` → is it installed?
2. `mgc me get` → is it authenticated and authorized?
