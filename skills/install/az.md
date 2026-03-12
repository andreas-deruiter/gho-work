---
name: install-az
description: Install and configure Azure CLI on the user's machine
---

# Install Azure CLI (az)

## What this tool does
Enables GHO Work to manage Azure resources and integrate with Microsoft 365 via Azure Active Directory. Provides access to Azure subscriptions, resource groups, and services, as well as AAD-based identity and app registration management.

## Platform detection
- macOS: check for Homebrew (`brew --version`), fall back to manual installer
- Windows: check for winget (`winget --version`), fall back to MSI installer

## Installation steps

### macOS
1. `brew install azure-cli`
2. If brew not available: download the pkg installer from https://aka.ms/installazureclimacos

### Windows
1. `winget install -e --id Microsoft.AzureCLI`
2. If winget not available: download the MSI installer from https://aka.ms/installazurecliwindows

## Post-install setup
Auth uses browser-based OAuth:
1. Run `az login`
2. A browser window will open automatically
3. Sign in with your Microsoft/Azure account
4. Close the browser tab once authentication completes
5. The CLI will display your active subscription

## Verification
- `az --version` — should print version info
- `az account show` — should return subscription info with name, ID, and tenantId

## Common pitfalls
- Python dependency issues on some macOS versions → use the brew install path which bundles its own Python, or use the pkg installer
- Proxy configuration needed → run `az configure` and set `http_proxy`/`https_proxy` environment variables
- Multiple subscriptions → switch with `az account set --subscription "<subscription-name-or-id>"`
- Login loop (browser doesn't close) → try `az login --use-device-code` as a fallback
- AAD Conditional Access blocking → contact IT admin; may need to use `az login --tenant <tenant-id>` to target the correct tenant
- Command not found after install → restart terminal or run `source ~/.zshrc` / `source ~/.bashrc`

## Resume
1. `az --version` → is it installed?
2. `az account show` → is it authenticated and pointing to the correct subscription?
