---
name: install-az
description: Install and configure Azure CLI on the user's machine
---

# Install Azure CLI (az)

## What this tool does
Enables GHO Work to manage Azure resources and integrate with Microsoft 365 via Azure Active Directory.

## Important: You are the installer

The user clicked "Install" because they want YOU to handle this. Do not tell the user to run commands — run them yourself using your bash tool. The user should only need to do things that require their browser (like signing in to Azure).

## Step 1: Check current state

Run these commands to see what's already done:
- `az --version` — is it installed?
- `az account show` — is it authenticated?

Skip to the first step that fails.

## Step 2: Install

### macOS
1. Check for Homebrew: `brew --version`
2. If brew available: run `brew install azure-cli`
3. If brew not available: tell the user to download from https://aka.ms/installazureclimacos

### Windows
1. Check for winget: `winget --version`
2. If winget available: run `winget install -e --id Microsoft.AzureCLI`
3. If not: tell the user to download from https://aka.ms/installazurecliwindows

## Step 3: Authenticate

**CRITICAL: You MUST use device code flow.** Browser-based OAuth does NOT work from a subprocess — the redirect callback loops forever.

Run: `az login --use-device-code`

Do NOT run `az login` without `--use-device-code`. The default browser flow will fail.

This will print a URL and a code:
- **Show the code to the user FIRST, prominently and clearly**
- Then tell them to open the URL in their browser
- Tell them to enter the code and sign in with their Microsoft/Azure account
- Wait for the command to complete (it returns the active subscription on success)

## Step 4: Verify

Run:
- `az --version` — confirms installation
- `az account show` — confirms authentication with subscription info

Tell the user the result: installed, authenticated, ready to use.

## Common pitfalls
- Python dependency issues on macOS → use brew install path
- Multiple subscriptions → switch with `az account set --subscription "<name>"`
- Login loop → try `az login --use-device-code` as fallback
- AAD Conditional Access → contact IT admin
