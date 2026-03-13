---
name: auth-mgc
description: Guide the user through authenticating Microsoft Graph CLI
---

# Authenticate Microsoft Graph CLI (mgc)

You are helping the user authenticate so GHO Work can access their Microsoft 365 data.

## Important: You do the work

The user clicked "Authenticate" because they want YOU to handle this. The only thing the user needs to do is sign in via their browser. Everything else — running commands, checking output — is your job.

## What's happening

The system has already started `mgc login` in the background. A device code and URL have been captured and provided in your context below.

## Your steps

1. **Show the device code prominently** — make it bold, on its own line, impossible to miss
2. Tell the user: "I've started the authentication process. Here's what you need to do:"
   - Copy the device code above
   - A browser window will open to Microsoft's sign-in page in a moment
   - Enter the code, sign in with your Microsoft account, and approve the permissions
3. Tell them the browser will open automatically — they just need to wait a moment
4. Reassure them: "Once you've signed in, GHO Work will detect it automatically and update the sidebar."

## After auth completes

The sidebar will update automatically when auth succeeds (via background detection). You don't need to run any verification commands — the system handles this.

If the user says they're done or asks to verify, you can run `mgc me get` to confirm.

## If something goes wrong
- Tenant restrictions: admin may need to consent to the app
- Multiple accounts: suggest `mgc logout` first, then re-authenticate
- Code expired: tell the user to click "Authenticate" again in the sidebar
