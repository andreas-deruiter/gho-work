# Chat Progress UX Spec

> How GHO Work displays thinking, tool calls, and streaming progress in the chat panel — modeled on VS Code Copilot's patterns.

## 1. Design Principles

| Principle | Rationale |
|-----------|-----------|
| **Collapse by default, expand on demand** | Tool calls and reasoning are verbose. Show a one-line summary; let the user drill in. |
| **Lazy content initialization** | Don't create expanded DOM until the user actually clicks to expand. Saves memory and keeps the DOM shallow. |
| **State machine for tool calls** | Every tool invocation moves through explicit states (streaming → confirming → executing → completed/cancelled). No ambiguous UI. |
| **Observable-driven updates** | Use `IObservable<T>` + `autorun()` for reactive rendering. Only the affected content part re-renders. |
| **Past tense on completion** | Once a tool finishes, replace the verbose in-progress message with a short past-tense summary (e.g., "Searched codebase" instead of "Searching the codebase for references to AuthService..."). |
| **Shimmer over spinners** | A gradient text shimmer (CSS animation) is the primary "working" indicator — more subtle than a spinner, works well for text-heavy UI. |
| **Accessibility first** | ARIA `aria-expanded`, `aria-label` on every collapsible. Screen reader announcements for state changes. Checkmarks configurable for low-vision users. |

---

## 2. Thinking / Reasoning Display

### What the user sees

A collapsible section labeled **"Working"** appears at the top of the assistant's response while the model is thinking/streaming.

```
▸ Working ~~~shimmer~~~
```

- The title text ("Working") uses a **shimmer animation** — a CSS gradient sweep across the text that loops every 2s.
- The title verb rotates randomly from a pool: "Thinking", "Reasoning", "Considering", "Analyzing", "Evaluating".
- When a tool is active, the verb switches to tool-relevant words: "Processing", "Preparing", "Loading" (general) or "Executing", "Running" (terminal).

### Expanded state

Clicking the title expands a bordered box showing the model's internal reasoning as rendered markdown. A vertical "chain of thought" line runs down the left edge connecting thinking items and tool calls.

```
▾ Thinking
│  I need to check the auth middleware to understand
│  how tokens are stored...
│
│ 🔍 Searched codebase for "authMiddleware"     ✓
│ 📖 Read src/auth/middleware.ts                 ✓
│
│  The middleware stores tokens in a session cookie
│  without encryption, which is the compliance issue...
```

### Display modes (configurable)

| Mode | Behavior |
|------|----------|
| `collapsed` (default) | Always collapsed; user clicks to expand |
| `collapsed-preview` | Shows a live preview (max 200px tall) while streaming; collapses when done |
| `fixed-scrolling` | Stays visible in a 200px scrollable area while streaming; collapses when done |

### When streaming completes

- Shimmer animation stops
- Icon changes from `●` (circle-filled) to `▸`/`▾` (chevron)
- Section remains expandable for review
- If a title was auto-generated from the thinking content, it replaces the generic verb

---

## 3. Tool Call States

Every tool invocation is modeled as a state machine:

```
                 ┌─────────────┐
                 │  Streaming   │  (LM streaming tool call parameters)
                 └──────┬──────┘
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
   ┌──────────────────┐  ┌───────────────┐
   │ WaitingForConfirm │  │   Executing   │  (auto-approved tools)
   └────────┬─────────┘  └───────┬───────┘
            │                    │
     ┌──────┴──────┐      ┌─────┴──────┐
     ▼             ▼      ▼            ▼
 ┌────────┐  ┌─────────┐ ┌─────────┐ ┌─────────┐
 │Executing│  │Cancelled│ │Completed│ │ Failed  │
 └────┬────┘  └─────────┘ └─────────┘ └─────────┘
      │
 ┌────┴────────────┐
 ▼                 ▼
┌─────────┐  ┌──────────────────┐
│Completed│  │WaitingPostApproval│  (e.g., confirm file write)
└─────────┘  └──────────────────┘
```

### State rendering

| State | Icon | Label | Extra UI |
|-------|------|-------|----------|
| **Streaming** | `loading` (spin) | `Using "{toolName}"` | Partial parameters update live |
| **WaitingForConfirmation** | `shield` | Tool name + description | Confirmation widget (Accept / Dismiss), expandable parameter preview |
| **Executing** | `loading` (spin) | `invocationMessage` (e.g., "Reading src/auth.ts...") | Progress % if available, message updates in-place |
| **Completed** | `check` | `pastTenseMessage` (e.g., "Read src/auth.ts") | Expandable result details |
| **Failed** | `error` | `pastTenseMessage` + error summary | Expandable error details |
| **Cancelled** | `close` | "Tool denied" / "Tool skipped" + reason | Reason message visible |
| **WaitingPostApproval** | `shield` | "Review changes" | Confirmation widget for result |

---

## 4. Tool Call Display

### Collapsed (default)

Each tool call renders as a single clickable line with:

```
[icon] [message]                              [chevron]
```

- **Icon** is tool-specific based on tool ID pattern matching:
  - Search/grep/find → `search`
  - Read/get_file → `book`
  - Edit/create/write → `pencil`
  - Terminal/exec → `terminal`
  - Default → `tools`
- **Message** is `invocationMessage` while running, `pastTenseMessage` when complete
- **Chevron** appears on hover (right side): `▸` when collapsed, `▾` when expanded
- While executing, the message text gets the **shimmer animation**

### Expanded

Clicking reveals:
- **Parameters**: The tool's input (JSON or rendered) — scrollable, max 80vh
- **Output/Result**: The tool's response — scrollable, max 80vh
- For terminal tools: inline output view (max 10 rows before scroll) + "Show Terminal" link

### Completed tools within thinking

When tools appear inside a thinking block, they render as nested items in the chain-of-thought:

```
│ 🔍 Searched codebase for "authMiddleware"     ✓
```

Inside thinking, the `loading` spinner and `check` icons are hidden by default (cleaner look). Checkmarks can be re-enabled via an accessibility setting.

### Hidden-after-complete presentation

Some tools (e.g., internal housekeeping) can opt into `HiddenAfterComplete` presentation — they show progress while running but disappear from the chat once done.

---

## 5. Tool Confirmation Widget

When a tool requires user approval before execution:

```
┌─────────────────────────────────────────┐
│ ⚠ Allow "editFile" to modify            │
│   src/auth/middleware.ts?                │
│                                         │
│ ▸ View parameters                       │
│                                         │
│         [Accept]  [Dismiss]             │
└─────────────────────────────────────────┘
```

- **Expandable parameter preview**: User can inspect (and optionally edit) the tool's input before approving.
- **Approval scopes**: Accept once, for this session, for this workspace, or always.
- **Two-step approval** for URL-fetching tools: pre-approve the URL, then post-approve the fetched content.

---

## 6. Preventing Chat Overflow

### Strategy summary

| Mechanism | What it controls |
|-----------|-----------------|
| **Collapsible thinking** | All reasoning text collapsed by default |
| **Collapsible tool calls** | Each tool call is a one-line summary until expanded |
| **Nested collapsibles** | Thinking → tools → details: three levels of progressive disclosure |
| **Max-height + scroll** | Thinking: 200px. Tool output: 80vh. Terminal: 10 rows. |
| **Lazy DOM creation** | Expanded content only created on first expand |
| **Past-tense summaries** | Completed items use short messages, saving vertical space |
| **Auto-hide progress** | Transient "Working..." messages disappear when real content arrives |
| **Subagent collapsing** | Subagent runs collapse into one line showing agent name + current action |

### Content hierarchy (from most to least prominent)

1. **Assistant's final response text** — always visible, full width
2. **File changes summary** — compact "N files changed" bar (expandable)
3. **Thinking section** — collapsed one-liner with shimmer
4. **Individual tool calls** — nested inside thinking, collapsed
5. **Tool parameters/output** — nested inside tool call, lazy-loaded

---

## 7. Streaming / Progressive Rendering

- **Markdown streams progressively**: Content updates the existing DOM element via `updateMessage()` rather than replacing it.
- **Code blocks stream with animation**: Configurable (`chat.agent.codeBlockProgress`) shimmer on in-progress code blocks.
- **Scroll follows output**: Auto-scroll to bottom while streaming, stop following if user scrolls up.
- **Dimension updates deferred**: Layout recalculation happens after streaming completes for accurate sizing.

---

## 8. Visual Design Tokens

### CSS classes

| Class | Purpose |
|-------|---------|
| `.chat-thinking-box` | Root container for thinking section |
| `.chat-thinking-active` | Applied while streaming (enables shimmer) |
| `.chat-used-context-collapsed` | Collapsed state |
| `.chat-thinking-title-shimmer` | Shimmer gradient on title text |
| `.chat-tool-invocation-part` | Individual tool call container |
| `.chat-thinking-collapsible` | Bordered box containing chain-of-thought |
| `.chat-thinking-spinner-item` | Active progress step with shimmer label |

### Shimmer animation

```css
.chat-thinking-title-shimmer {
  background: linear-gradient(90deg,
    var(--description-foreground) 0%,
    var(--description-foreground) 30%,
    var(--shimmer-highlight) 50%,
    var(--description-foreground) 70%,
    var(--description-foreground) 100%);
  background-size: 400% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: chat-thinking-shimmer 2s linear infinite;
}

@keyframes chat-thinking-shimmer {
  0%   { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}
```

### Chain-of-thought vertical line

A 1px vertical line on the left edge connects thinking items, tool calls, and progress steps inside the expanded thinking box. Uses CSS `::before` pseudo-elements with mask-image for clean start/end caps.

### Icon semantics

| Context | Icon |
|---------|------|
| Thinking active | `circle-filled` (hidden when shimmer is on title) |
| Thinking collapsed | `chevron-right` |
| Thinking expanded | `chevron-down` |
| Thinking complete | `check` (when accessibility checkmarks enabled) |
| Tool in progress | `loading` + spin animation |
| Tool complete | `check` |
| Tool failed | `error` |
| Tool cancelled | `close` |

---

## 9. Accessibility

- Every collapsible has `aria-expanded="true|false"` and descriptive `aria-label`.
- Screen reader setting (`accessibility.verboseChatProgressUpdates`) announces each tool state change.
- Checkmark visibility configurable via `ShowChatCheckmarks` setting for low-vision users.
- All interactive elements keyboard-focusable and activatable with Enter/Space.
- Progress messages announced as ARIA live regions.

---

## 10. GHO Work Implementation Notes

### Mapping to our architecture

| VS Code concept | GHO Work equivalent | Package |
|----------------|---------------------|---------|
| `ChatCollapsibleContentPart` | `CollapsibleWidget` | `packages/ui` |
| `ChatThinkingContentPart` | `ThinkingContentPart` | `packages/ui` |
| `ChatToolInvocation` (state machine) | `ToolInvocationState` | `packages/agent` |
| `ChatToolProgressPart` | `ToolProgressWidget` | `packages/ui` |
| `ChatConfirmationContentPart` | `ConfirmationWidget` | `packages/ui` |
| Observable-driven rendering | Same pattern (we already use `Event<T>`) | `packages/base` |
| CSS shimmer animation | Same CSS approach | `packages/ui` |

### Key decisions for GHO Work

1. **We adopt VS Code's collapsible-by-default approach** — this is the single most important pattern for keeping the chat usable during long agent sessions.

2. **Thinking display mode defaults to `collapsed-preview`** — shows a live 200px preview while streaming (so the user can see the agent is working), collapses when done.

3. **Tool-specific icons** via a `getToolIcon(toolId: string)` function using pattern matching on tool ID — same approach as VS Code.

4. **State machine is in `packages/agent`** (common/) since it's pure logic with no DOM. The UI rendering is in `packages/ui` (browser/).

5. **All widgets extend `Disposable`** and use `h()` helper for DOM creation — consistent with our existing patterns.

6. **No new dependencies** — shimmer is pure CSS, collapsibles are vanilla DOM, state machine is plain TypeScript.

### What we intentionally skip (for now)

- **Context window usage indicator** — requires token counting from the SDK, add later
- **Subagent display** — we don't have subagents yet
- **Post-approval flow** — start with pre-approval only
- **Editable parameters in confirmation** — start with read-only parameter preview
- **Terminal-specific renderer** — start with generic tool renderer, specialize later

### Implementation order

1. `ToolInvocationState` state machine (packages/agent/src/common/)
2. `CollapsibleWidget` base class (packages/ui/src/browser/widgets/)
3. CSS shimmer animation + chain-of-thought line (packages/ui/src/browser/)
4. `ThinkingContentPart` — collapsible thinking with display modes
5. `ToolProgressWidget` — tool call rendering with icon mapping
6. `ConfirmationWidget` — approval UI
7. Wire into `ChatPanel` response rendering
8. Accessibility pass (ARIA, keyboard, screen reader)

---

## 11. Patterns from Copilot Chat Extension Source

> Source: `references/vscode-copilot-chat/` (MIT-licensed, shallow clone)

### Tool registry pattern

Tools register via a static registry with class-based registration:

```typescript
class ReadFileTool implements IAgentTool<IReadFileInput> {
  static readonly toolName = ToolName.ReadFile;

  prepareInvocation(options): PreparedToolInvocation {
    return {
      invocationMessage: `Reading ${options.input.path}`,     // shown while running
      pastTenseMessage: `Read ${options.input.path}`,         // shown after completion
    };
  }

  async invoke(options, token): Promise<ToolResult> { ... }
}

ToolRegistry.registerTool(ReadFileTool);
```

**Adopt for GHO Work:** Same pattern in `packages/agent/src/common/tools/`. Each tool declares its own messages. The agent service iterates the registry to build the tool list for the SDK.

### Virtual tool grouping

When tool count exceeds ~64, related tools collapse into `activate_*` groups:

```
activate_jupyter_notebook  → [create_notebook, edit_notebook, run_cell, ...]
activate_web_interaction   → [fetch_webpage, github_repo, ...]
activate_testing           → [run_tests, test_search, test_failure, ...]
```

The LLM can invoke `activate_jupyter_notebook` to expand the group, then call individual tools. Groups collapse again via LRU when the tool count is too high.

**Adopt for GHO Work (later):** Essential when MCP servers add many tools. Implement when total tool count exceeds ~30.

### Prompt construction with priority-based truncation

Prompt sections have `priority` (higher = kept first when truncating) and `flexGrow` (weight for flexible space allocation):

```
SystemMessage     priority=1000  (always kept)
WorkspaceInfo     priority=800   flexGrow=2
CustomInstructions priority=700  flexGrow=3
History           priority=600   flexGrow=5  (summarized if too long)
UserQuery         priority=900   flexGrow=7  (almost always kept)
```

**Adopt for GHO Work:** Build a simpler version in plain TypeScript (not JSX). Each prompt section returns `{ content, priority, estimatedTokens }`. A `buildPrompt(sections, tokenBudget)` function assembles them.

### Background conversation summarization

When history exceeds token limits, a background job summarizes it using a structured format:
1. Chronological review
2. Intent mapping
3. Technical inventory
4. Code archaeology (files changed, patterns used)
5. Progress assessment

The summary replaces full history in the prompt, preserving the most important context.

**Adopt for GHO Work:** Critical for long agent sessions. Run summarization when history exceeds 50% of context window.

### Agent orchestration loop

```
while (true) {
  prompt = buildPrompt(history, context, tools)
  response = await fetchLM(prompt, toolDefinitions)
  toolCalls = parseToolCalls(response)

  if (toolCalls.length === 0 || cancelled || limitExceeded) break

  results = await executeTools(toolCalls, token)
  history.addRound({ toolCalls, results })
}
```

Key details:
- **Max 15 iterations** (auto-extends to 200 in autopilot)
- **Temperature 0** for agent mode (deterministic)
- **Auto-retry** on transient errors (max 3, 1s delay)
- **Stop hooks** can block completion with reasons sent back to the model
- **Yield mechanism** pauses the loop when user types a new message

**Adopt for GHO Work:** Our agent service already has a basic loop. Enhance with: iteration limits, stop hooks, yield-on-user-input, auto-retry.

### Hierarchical tool permissions

```
bypass → auto-approve → confirm dialog
```

- **Bypass mode**: Skip all confirmations (for trusted environments)
- **Auto-approve**: Tool handler returns `canAutoApprove: true` for safe tools (read-only)
- **Confirm dialog**: Shows tool name, description, expandable parameters, Accept/Dismiss

**Adopt for GHO Work:** Map to our existing permission model. Read tools auto-approve; write tools confirm; terminal commands always confirm.

### MCP gateway lifecycle

- Per-session HTTP gateway via `startMcpGateway()`
- **10-minute idle timeout** disposes gateway and cleans up resources
- Graceful degradation: gateway failure logs warning, session continues without MCP
- Gateway URI scoped to session ID for isolation

**Adopt for GHO Work:** Match this pattern in `packages/connectors`. Add idle timeout to prevent resource leaks.

### Cache breakpoints (Claude optimization)

Static context (system prompt, workspace info) is marked with `<cacheBreakpoint>` tags. Claude models cache this content across turns, reducing cost and latency.

**Adopt for GHO Work (later):** Add when we integrate Claude models directly. Not needed for Copilot SDK which manages its own caching.
