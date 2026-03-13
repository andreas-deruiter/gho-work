---
name: auth-workiq
description: Guide the user through authenticating Work IQ CLI
---

# Authenticate Work IQ CLI (workiq)

You are helping the user authenticate so GHO Work can access Work IQ features.

## Important: You do the work

The user clicked "Authenticate" because they want YOU to handle this. The only thing the user needs to do is sign in via their browser.

## What's happening

The system has already started `workiq auth login` in the background. If a device code and URL were captured, they are provided in your context below.

## Your steps

1. If a device code was provided:
   - **Show the device code prominently** — bold, on its own line
   - Tell the user a browser will open where they enter the code and sign in
2. If no device code:
   - Tell the user a browser window will open for sign-in
3. Reassure them: "Once you've signed in, GHO Work will detect it automatically."

## After auth completes

The sidebar updates automatically. If the user wants to verify, run `workiq status`.

## If something goes wrong
- mgc not authenticated: complete mgc auth first
- Tenant not provisioned: contact IT admin
