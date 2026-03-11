---
name: accessibility-patterns
description: Consult when building any UI widget — ARIA roles, keyboard navigation, screen reader support, focus management. Every widget must be accessible from the start.
---

# Accessibility Patterns for Custom Widgets

Every UI widget in GHO Work must be accessible. Do not defer accessibility — build it in from the start.

## Widget ARIA Quick Reference

| Widget | Container Role | Item Role | Key ARIA | Keyboard |
|--------|---------------|-----------|----------|----------|
| Tree view | `tree` | `treeitem` | `aria-expanded`, `aria-selected`, `aria-level` | Up/Down, Left/Right, Home/End, Enter |
| List view | `listbox` or `list` | `option` or `listitem` | `aria-selected`, `aria-activedescendant` | Up/Down, Home/End, Space |
| Tab panel | `tablist` | `tab` + `tabpanel` | `aria-selected`, `aria-controls`, `aria-labelledby` | Left/Right, Home/End, Tab (into panel) |
| Toolbar | `toolbar` | (buttons) | `aria-label`, `aria-orientation` | Left/Right (or Up/Down), Home/End |
| Dialog | `dialog` | — | `aria-modal`, `aria-labelledby` | Tab (trapped), Escape |
| Combobox | `combobox` | `option` | `aria-expanded`, `aria-activedescendant`, `aria-autocomplete` | Down/Up, Enter, Escape |
| Split view | — | `separator` (sash) | `aria-valuenow/min/max`, `aria-orientation` | Arrow keys, Home/End |
| Toggle | `switch` | — | `aria-checked` | Space |
| Status bar | `status` | — | `aria-live="polite"` | — |

## Keyboard Navigation Architecture

### Panel cycling (F6)
F6 cycles focus between major panels (activity bar, sidebar, main panel, status bar). Each panel remembers its last-focused element.

### Within composite widgets: roving tabindex
One tab stop per widget. Arrow keys navigate items. The focused item has `tabindex="0"`, all others `tabindex="-1"`.

```typescript
// When focus moves to a new item:
currentItem.tabIndex = -1;
nextItem.tabIndex = 0;
nextItem.focus();
```

### Focus trapping in dialogs
Tab/Shift+Tab wraps within dialog. Escape closes. Return focus to trigger element on close.

## Streaming Chat Accessibility

**Do NOT announce every token** — this floods the screen reader.

```typescript
function startStreaming(el: HTMLElement) {
  el.setAttribute('aria-busy', 'true');
  statusRegion.textContent = 'Assistant is responding...';
}

function finishStreaming(el: HTMLElement) {
  el.setAttribute('aria-busy', 'false');
  statusRegion.textContent = 'Response complete';
}
```

The chat message container should have `role="log"` with `aria-live="polite"`.

## Tool Call Status Announcements

Use a `role="status"` region (polite) for normal updates, `role="alert"` for failures:
- "Running tool: search_files"
- "Tool completed successfully"
- "Tool failed: permission denied" (alert)

### Dual-container technique (VS Code pattern)
For repeated identical announcements, alternate between two alert containers:
```typescript
const alert1 = createElement('div', { role: 'alert', 'aria-atomic': 'true' });
const alert2 = createElement('div', { role: 'alert', 'aria-atomic': 'true' });
let useFirst = true;

function announce(msg: string) {
  const target = useFirst ? alert1 : alert2;
  const other = useFirst ? alert2 : alert1;
  other.textContent = '';
  target.textContent = msg;
  useFirst = !useFirst;
}
```

## Landmark Structure

```html
<body>
  <header role="banner" aria-label="Application toolbar">...</header>
  <div role="main" aria-label="Workspace">
    <nav role="navigation" aria-label="Activity bar">...</nav>
    <aside role="complementary" aria-label="Sidebar">...</aside>
    <section role="region" aria-label="Chat">...</section>
  </div>
  <footer role="contentinfo" aria-label="Status bar">
    <div role="status" aria-live="polite">...</div>
  </footer>
</body>
```

## Virtualized Lists

When using virtual scrolling (only visible items in DOM), you MUST provide:
- `aria-setsize` — total number of items
- `aria-posinset` — 1-based position of each visible item

Without these, screen readers cannot convey list size or position.

## Permission Prompt (Dialog)

Use `role="alertdialog"` (not just `dialog`) for permission prompts — these are critical decisions.
- Initial focus: place on the **least destructive** action (Deny)
- `aria-labelledby` pointing to the prompt title
- Announce keyboard shortcuts: "Enter to allow, Escape to deny"

## Sash (Resizable Separator)

VS Code has NO accessibility on sash handles (known gap, issue #120261). We must do better:
```html
<div role="separator"
     aria-valuenow="30"
     aria-valuemin="0"
     aria-valuemax="100"
     aria-label="Resize sidebar"
     aria-orientation="vertical"
     tabindex="0">
</div>
```
Arrow keys adjust position. Home/End go to min/max. Enter toggles collapse.

## Testing

1. **VoiceOver** (macOS): Cmd+F5 to enable. Navigate with Tab + VO keys. Use Rotor (Ctrl+Option+U).
2. **axe-core**: `@axe-core/playwright` in E2E tests for automated ARIA validation.
3. **Tab-key test**: Tab through entire app with screen reader on — catches most issues.
4. Force enable during dev: `app.setAccessibilitySupportEnabled(true)`

## Checklist for Every Widget

- [ ] Appropriate ARIA role set on container and items
- [ ] `aria-label` or `aria-labelledby` on every interactive container
- [ ] Keyboard navigation works (arrow keys within, Tab between widgets)
- [ ] Focus visible (outline/ring on focused element)
- [ ] State changes announced (`aria-expanded`, `aria-selected`, `aria-checked`)
- [ ] Dynamic content uses live regions (`aria-live`, `aria-busy`)
- [ ] Works with VoiceOver (test manually)
