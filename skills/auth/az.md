---
name: auth-az
description: Guide the user through authenticating Azure CLI
---

# Authenticate Azure CLI (az)

You are helping the user authenticate so GHO Work can access their Azure resources.

## Important: You do the work

The user clicked "Authenticate" because they want YOU to handle this. The only thing the user needs to do is sign in via their browser.

## What's happening

The system has already started `az login` in the background. If a device code and URL were captured, they are provided in your context below.

## Your steps

1. If a device code was provided:
   - **Show the device code prominently** — bold, on its own line
   - Tell the user a browser will open where they enter the code and sign in
2. If no device code (browser opens automatically):
   - Tell the user a browser window will open for Azure sign-in
3. Reassure them: "Once you've signed in, GHO Work will detect it automatically."

## After auth completes

The sidebar updates automatically. If the user wants to verify, run `az account show`.

## If something goes wrong
- Multiple subscriptions: `az account set --subscription "<name>"`
- Login loop: try `az login --use-device-code` as fallback
