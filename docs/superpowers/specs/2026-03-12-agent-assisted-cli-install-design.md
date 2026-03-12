# Agent-Assisted CLI Tool Installation — Design Spec

**Date:** 2026-03-12
**Status:** Approved
**Scope:** Replace passive "Install guide" links with agent-driven installation conversations

---

## Problem

The current CLI tool installation experience shows users a link to external documentation and expects them to follow multi-step platform-specific instructions. This is too much friction for novice users who may not be comfortable with terminal commands, package managers, or authentication flows. Tools like `mgc` require app registration and device-code auth — a manual process that even experienced users find tedious.

## Solution

An "Install" button in the Connectors settings screen that starts a new agent conversation pre-loaded with a tool-specific install skill. The agent handles the installation interactively: running commands (with user permission), verifying each step, walking through post-install auth, and falling back to web search when the known steps don't work.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Skill vs live lookup | Skill baseline + live fallback | Skills capture institutional knowledge (auth flows, pitfalls) while the agent adapts when things change |
| Install UI | New conversation in main chat panel | Reuses existing chat infrastructure; conversational format fits troubleshooting naturally |
| Onboarding integration | Detection-only during onboarding, install from Settings later | Keeps onboarding fast and linear; install conversations can be lengthy |
| Scope | 7 tools across 2 tiers | Covers the tools that appear in detection + connector settings; tier 3 utilities handled by the agent ad-hoc |

## Scope: Supported Tools

| Tier | Tool | Description | Post-install Auth | Complexity |
|------|------|-------------|-------------------|------------|
| Core | `gh` | GitHub CLI — Issues, PRs, repos | `gh auth login` (browser OAuth) | Low |
| Core | `pandoc` | Document conversion — DOCX, PDF, HTML | None | Trivial |
| Core | `git` | Version control (usually pre-installed) | Credential setup | Low |
| Integration | `mgc` | Microsoft Graph CLI — OneDrive, Outlook, Teams, Calendar | Device code + app registration | High |
| Integration | `az` | Azure CLI — Cloud resources | `az login` (browser OAuth) | Medium |
| Integration | `gcloud` | Google Cloud CLI | `gcloud init` (browser OAuth) | Medium |
| Integration | `wiq` | Work IQ CLI — Semantic search across M365 data | Depends on mgc auth | Medium |

**Out of scope for install skills** (handled by agent's general shell ability when needed): `aws` (cloud infrastructure, not office productivity), `jq`, `csvkit`, `wkhtmltopdf`, `pdftotext`, `sqlite3`. Note: the PRD lists `aws` alongside `az`/`gcloud` under Cloud Platforms, but GHO Work targets office productivity — `az` and `gcloud` are included because they integrate with M365 and Google Workspace respectively, while `aws` does not have an office productivity use case in v1.

## UX Flow

### Entry Point

Connectors settings screen > CLI Tools subsection.

- **Installed tools**: show version and auth status (unchanged)
- **Missing tools**: show an "Install" button instead of "Install guide" link

### Conversation Flow

1. User clicks "Install" on a missing tool (e.g., `mgc`)
2. GHO Work creates a new conversation with:
   - The tool's install skill loaded as agent context
   - Platform info injected: OS (macOS/Windows), architecture (arm64/x64), detected package managers (Homebrew, winget, chocolatey)
3. The conversation opens in the main chat panel
4. The agent starts working with a brief greeting — no lengthy preamble
5. Installation commands run with normal permission prompts (user sees `brew install mgc` and approves)
6. After install, the agent runs verification (`mgc --version`)
7. If auth is needed, the agent walks through it (e.g., `mgc login`, device code flow)
8. On completion: agent reports success, Connectors settings auto-refreshes detection status

### Error Handling

When a step fails, the agent:

1. Reads the error output
2. Checks the skill's "Common pitfalls" section for a known fix
3. If not covered, searches the web for current instructions
4. Explains what happened and proposes a fix
5. If the issue requires user action it can't perform (sudo, firewall change, IT admin approval), explains clearly what's needed

The agent never retries the same failing command without diagnosing first.

### Navigation

- The conversation appears in the sidebar like any other (auto-titled "Install mgc" or similar)
- User can switch to other conversations and come back
- The install conversation persists — if the user closes the app mid-install, they can resume

## Install Skills

### Location

Skills ship with the app as built-in skill definitions, loaded by the Phase 4 skill loading system. They are not in the user's `.claude/skills/` — they are part of the app bundle and updated via app updates.

```
skills/
  install/
    gh.md
    pandoc.md
    mgc.md
    az.md
    gcloud.md
    wiq.md
    git.md
```

### Skill Template

Each skill follows the same structure:

```markdown
---
name: install-{tool}
description: Install and configure {tool} on the user's machine
---

# Install {tool}

## What this tool does
Brief description of what the tool enables in GHO Work.
Why the user should care about having it installed.

## Platform detection
- macOS: check for Homebrew, fall back to direct download
- Windows: check for winget, fall back to chocolatey, fall back to direct download
- Note any platform where the tool is unavailable

## Installation steps

### macOS
1. [package manager command]
2. [verification]

### Windows
1. [package manager command]
2. [verification]

## Post-install setup
Auth flow if needed. Step-by-step with expected prompts and responses.
What scopes/permissions to request and why.

## Verification
How to confirm the tool is installed and working:
- Version check command
- Simple test command that exercises core functionality
- Expected output

## Common pitfalls
- [platform-specific gotcha and fix]
- [PATH not updated — how to fix per shell]
- [version conflicts with existing install]
- [corporate proxy/firewall workarounds]
- [package manager not installed — how to bootstrap]
```

### Key Principle

Skills are baselines, not rigid scripts. The agent uses them as a starting point and adapts when reality differs. If `brew install mgc` fails with an unexpected error, the agent diagnoses and searches for current info rather than blindly retrying or giving up.

## Technical Integration

### Creating a pre-contextualized conversation

The "Install" button click in the renderer triggers a new method on `IAgentService`:

```typescript
createInstallConversation(toolId: string, platformContext: IPlatformContext): Promise<string /* conversationId */>
```

Where `IPlatformContext` contains: `os` (darwin/win32), `arch` (arm64/x64), `packageManagers` (which of brew/winget/chocolatey are available). The method:

1. Creates a new conversation via `IConversationService`
2. Loads the install skill content from the bundled `skills/install/{toolId}.md`
3. Injects skill content + platform context as the system message for the SDK session
4. Returns the conversation ID so the renderer can navigate to it

IPC: the renderer calls this via the existing `IAgentService` IPC channel (same pattern as `executeTask`).

### CLI detection refresh after install

`ICLIDetectionService` (in `packages/connectors`) emits an `onDidChangeDetection` event. The refresh is triggered by:

1. The agent conversation completing (conversation reaches idle state)
2. The renderer's Connectors settings panel subscribes to `onDidChangeDetection`
3. When the install conversation ends, the `IAgentService` fires a `onDidCompleteTask` event
4. The Connectors settings panel listens for this and calls `ICLIDetectionService.rescan()`
5. The rescan results flow back via `onDidChangeDetection`, updating the UI

This avoids polling. The renderer doesn't need to know _what_ the agent did — it just re-scans when a task completes while the Connectors panel is visible.

### Built-in skill loading

The Phase 4 skill loading system scans user/workspace paths (`.claude/skills/`, `.github/skills/`, `~/.claude/skills/`). Built-in install skills ship in the app bundle at a separate path (e.g., `resources/skills/install/`). The skill loading system needs an additional scan path for bundled skills, read-only and not user-editable. This is a small extension to the Phase 4 skill loader — add `app.getPath('resources')/skills/` to the scan list.

### Platform detection utility placement

- **OS and architecture detection**: `packages/platform/src/common/platform.ts` — pure TypeScript (`process.platform`, `process.arch`), no DOM or Node APIs beyond what's universally available
- **Package manager detection**: `packages/connectors/src/node/cliDetection.ts` — extends the existing CLI detection logic (already checks PATH for tools, adding brew/winget/chocolatey to the scan list)

### Conversation resumption

If the user closes the app mid-install and reopens, the conversation persists (standard conversation persistence). When the user opens the install conversation again, the agent should re-detect the current state before continuing — check whether the tool is now installed (version command), whether auth is configured, and whether any partial state needs cleanup. The install skills should include a "Resume" section with diagnostic commands to assess current state. The agent should not blindly replay previous steps.

## Changes to Existing Specs

### PRD Section 6.2 (Onboarding Flow)

Step 4 (CLI Detection) changes from showing "Install guide" links to showing informational text: "Available from Settings > Connectors after setup." The detection screen still shows found/missing tools with versions, building awareness without interrupting the onboarding flow.

### PRD Section 10.5 (Connector Configuration UX)

Update the CLI Tools tab description:

| State | Display |
|-------|---------|
| Installed | Tool name, version, auth status (unchanged) |
| Missing | Tool name, description, **"Install" button** |

Add: clicking "Install" creates a new conversation with the tool's install skill pre-loaded and platform info injected.

### Tutorial Mockups

- **Onboarding Step 4**: Replace "Install guide" links on missing tools with "Install later from Settings" text (done)
- **Connectors settings**: Add "Install" button on missing CLI tools (TODO — mockup to be created during Phase 4 implementation)

### Implementation Plan

**Phase 4** (new deliverables):
- Install skill files for 7 tools (gh, pandoc, git, mgc, az, gcloud, wiq)
- "Install" button in Connectors UI > CLI Tools that creates a pre-contextualized conversation
- Platform detection utility: detect OS, architecture, available package managers — inject into install conversation context

**Phase 5** (update existing):
- Update onboarding deliverable: detection screen is informational only, no install actions

## What's NOT Changing

- CLI tool detection mechanism (PATH scanning) — unchanged
- Installed tool display in Connectors settings — unchanged
- MCP server installation — separate concern, handled via registry
- Tier 3 utility tools — no install skills, agent handles ad-hoc
- The agent's general ability to install tools via shell when asked — unchanged

## Testing

- **Unit tests**: platform detection utility (OS, arch, package manager detection)
- **Integration test**: "Install" button creates conversation with correct skill and platform context
- **E2E test (Playwright)**: click Install button on a missing tool → verify conversation opens with install skill context → mock agent completes installation → verify Connectors settings refreshes and shows tool as installed. This exercises the full cross-process flow (renderer → IPC → agent → CLI detection refresh → UI update).
- **Manual verification**: walk through install flow for each tool on macOS (and Windows when available)
- **Edge case coverage in skills**: each skill's "Common pitfalls" section should be informed by real testing — use CI containers or fresh VMs to validate install steps on clean machines without pre-existing tools
