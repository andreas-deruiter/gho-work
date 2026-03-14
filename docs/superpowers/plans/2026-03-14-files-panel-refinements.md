# Files Panel Refinements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the Documents Panel into a polished Files panel with better naming, icons, folder attach, resizable sidebar, tooltips, and recursive file search.

**Architecture:** Seven changes applied to the existing DocumentsPanel, TreeWidget, Workbench, ActivityBar, and CSS. A new IPC channel `FILES_SEARCH` enables recursive filename search from main process. The sidebar gets a drag-resize handle between `.workbench-sidebar` and `.workbench-main`.

**Tech Stack:** TypeScript, DOM APIs, CSS, Node.js `fs/promises` (for recursive search in main process)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/ui/src/browser/activityBar.ts` | Modify | Rename 'Documents' label to 'Files' |
| `packages/ui/src/browser/documentsPanel.ts` | Modify → rename to `filesPanel.ts` | Rename class, title, CSS classes; add folder attach; remove new-file button; SVG icons; search mode |
| `packages/ui/src/browser/filesPanel.ts` | Create (rename of documentsPanel.ts) | New filename for the panel |
| `packages/ui/src/browser/treeWidget.ts` | Modify | Add title attribute to rendered name spans (tooltip) |
| `packages/ui/src/browser/workbench.ts` | Modify | Update import, add resize handle |
| `packages/ui/src/index.ts` | Modify | Update export |
| `packages/platform/src/ipc/common/ipc.ts` | Modify | Add FILES_SEARCH channel + schema |
| `packages/platform/src/files/common/files.ts` | Modify | Add `search` method to IFileService |
| `packages/platform/src/files/node/fileService.ts` | Modify | Implement recursive search |
| `packages/electron/src/main/mainProcess.ts` | Modify | Add FILES_SEARCH IPC handler |
| `apps/desktop/src/preload/index.ts` | Modify | Whitelist FILES_SEARCH |
| `apps/desktop/src/renderer/documents.css` → `files.css` | Rename + Modify | Rename CSS classes, add resize handle styles, search results styles |
| `apps/desktop/src/renderer/main.ts` | Modify | Update CSS import |
| `tests/e2e/documents.spec.ts` → `files.spec.ts` | Rename + Modify | Update selectors and test names |
| `packages/ui/src/browser/__tests__/treeWidget.test.ts` | Modify | Verify tooltip behavior |

---

## Chunk 1: Rename + UI Cleanup

### Task 1: Rename Documents → Files everywhere

This is a mechanical rename across all files. Rename the class, CSS classes, labels, exports, and test file.

**Files:**
- Modify: `packages/ui/src/browser/activityBar.ts:62-67,93`
- Rename: `packages/ui/src/browser/documentsPanel.ts` → `packages/ui/src/browser/filesPanel.ts`
- Modify: `packages/ui/src/browser/workbench.ts:17,76-94`
- Modify: `packages/ui/src/index.ts:16`
- Rename: `apps/desktop/src/renderer/documents.css` → `apps/desktop/src/renderer/files.css`
- Modify: `apps/desktop/src/renderer/main.ts`
- Rename: `tests/e2e/documents.spec.ts` → `tests/e2e/files.spec.ts`

- [ ] **Step 1: Rename documentsPanel.ts to filesPanel.ts**

```bash
cd /Users/andreasderuiter/Project/gho-work/.worktrees/documents-panel
git mv packages/ui/src/browser/documentsPanel.ts packages/ui/src/browser/filesPanel.ts
```

- [ ] **Step 2: Update filesPanel.ts internals**

In `packages/ui/src/browser/filesPanel.ts`:
- Rename class `DocumentsPanel` → `FilesPanel`
- Rename CSS class `documents-panel` → `files-panel`
- Rename CSS class `documents-header` → `files-header`
- Rename CSS class `documents-title` → `files-title`
- Rename CSS class `documents-actions` → `files-actions`
- Rename CSS class `documents-filter` → `files-filter`
- Rename CSS class `documents-filter-input` → `files-filter-input`
- Rename CSS class `documents-tree` → `files-tree`
- Rename CSS class `documents-footer` → `files-footer`
- Rename CSS class `documents-workspace-path` → `files-workspace-path`
- Change title text from `'DOCUMENTS'` to `'FILES'`
- Update all console log prefixes from `[DocumentsPanel]` to `[FilesPanel]`

- [ ] **Step 3: Rename documents.css to files.css and update class names**

```bash
git mv apps/desktop/src/renderer/documents.css apps/desktop/src/renderer/files.css
```

In `apps/desktop/src/renderer/files.css`, replace all `.documents-` prefixes with `.files-`:
- `.documents-panel` → `.files-panel`
- `.documents-header` → `.files-header`
- `.documents-title` → `.files-title`
- `.documents-actions` → `.files-actions`
- `.documents-filter` → `.files-filter`
- `.documents-filter-input` → `.files-filter-input`
- `.documents-tree` → `.files-tree`
- `.documents-footer` → `.files-footer`
- `.documents-summary` → `.files-summary`

- [ ] **Step 4: Update CSS import in main.ts**

In `apps/desktop/src/renderer/main.ts`, change:
```typescript
import './documents.css';
```
to:
```typescript
import './files.css';
```

- [ ] **Step 5: Update activityBar.ts**

In `packages/ui/src/browser/activityBar.ts`:
- Line 62-67: Change the `case 'documents':` comment to `// Folder icon (Feather: folder)` and keep the icon (we'll update icons in Task 5)
- Line 93: Change `label: 'Documents'` to `label: 'Files'`

Also rename the `ActivityBarItem` type: change `'documents'` to `'files'` in the union type on line 6:
```typescript
export type ActivityBarItem = 'chat' | 'tools' | 'files' | 'settings';
```

- [ ] **Step 6: Update workbench.ts**

In `packages/ui/src/browser/workbench.ts`:
- Line 17: Change import from `DocumentsPanel` to `FilesPanel` and from `'./documentsPanel.js'` to `'./filesPanel.js'`
- Line 76: Change `DocumentsPanel` to `FilesPanel` variable name
- Line 84: Change `new DocumentsPanel(...)` to `new FilesPanel(...)`
- Line 85: Change `'documents'` to `'files'` in `addPanel`
- Update all references to `documentsPanel` variable → `filesPanel`
- Update `documentsLoaded` → `filesLoaded`

- [ ] **Step 7: Update index.ts export**

In `packages/ui/src/index.ts` line 16, change:
```typescript
export { DocumentsPanel } from './browser/documentsPanel.js';
```
to:
```typescript
export { FilesPanel } from './browser/filesPanel.js';
```

- [ ] **Step 8: Update sidebar panel ID in workbench.ts activity bar handler**

Search for any `'documents'` string used in sidebar panel switching and change to `'files'`. This includes the activity bar `onDidSelectItem` handler where it maps activity bar items to sidebar panels.

- [ ] **Step 9: Rename e2e test file**

```bash
git mv tests/e2e/documents.spec.ts tests/e2e/files.spec.ts
```

Update all `.documents-` selectors to `.files-` in the test file. Update test descriptions from "Documents" to "Files".

- [ ] **Step 10: Run build and verify**

```bash
npx turbo build
```

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor: rename Documents panel to Files panel"
```

---

### Task 2: Remove new-file button + add folder attach button

**Files:**
- Modify: `packages/ui/src/browser/filesPanel.ts`

- [ ] **Step 1: Remove the new-file button from `_buildHeader`**

In `packages/ui/src/browser/filesPanel.ts`, delete the entire block that creates `newFileBtn` (lines ~166-174 in the original, the block starting with `// New file button`).

Also remove the `_handleNewFile` method entirely (~lines 284-294).

- [ ] **Step 2: Add attach button to folders in `FileTreeRenderer.renderNode`**

Remove the `if (entry.type === 'file')` guard around the attach button. The attach button should appear on both files and folders. Change the aria-label to be generic:

```typescript
const attachBtn = document.createElement('button');
attachBtn.classList.add('tree-attach-btn');
attachBtn.setAttribute('aria-label', `Attach ${entry.name}`);
attachBtn.setAttribute('title', 'Attach to chat');
attachBtn.textContent = '+';
attachBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  this._onAttach(entry);
});
container.appendChild(attachBtn);
```

- [ ] **Step 3: Run build and verify**

```bash
npx turbo build
```

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/browser/filesPanel.ts
git commit -m "feat: remove new-file button, add attach to folders"
```

---

### Task 3: Add tooltip on clipped filenames

**Files:**
- Modify: `packages/ui/src/browser/filesPanel.ts`

- [ ] **Step 1: Add title attribute to name span**

In `FileTreeRenderer.renderNode`, after setting `nameSpan.textContent = entry.name`, add:

```typescript
nameSpan.setAttribute('title', entry.name);
```

This gives a native browser tooltip when the filename is clipped by `text-overflow: ellipsis`.

- [ ] **Step 2: Commit**

```bash
git add packages/ui/src/browser/filesPanel.ts
git commit -m "feat: add tooltip on clipped filenames"
```

---

## Chunk 2: Icons + Resize

### Task 4: Replace text buttons with SVG icons (Codicon-style)

Replace the text-based header buttons (H, A↓, ↻) with proper SVG icons matching VS Code's Codicon style. All icons use 16x16 viewBox, stroke-based, no innerHTML.

**Files:**
- Modify: `packages/ui/src/browser/filesPanel.ts`

- [ ] **Step 1: Create SVG icon helper functions**

Add these helper functions at the top of `filesPanel.ts` (after the imports):

```typescript
const SVG_NS = 'http://www.w3.org/2000/svg';

function createSVGIcon(paths: string[], size = 16): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
  }
  return svg;
}

// Feather: eye
function createEyeIcon(): SVGElement {
  const svg = createSVGIcon(['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z']);
  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '3');
  circle.setAttribute('stroke', 'currentColor');
  circle.setAttribute('stroke-width', '2');
  svg.appendChild(circle);
  return svg;
}

// Feather: eye-off
function createEyeOffIcon(): SVGElement {
  return createSVGIcon([
    'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94',
    'M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19',
    'M14.12 14.12a3 3 0 1 1-4.24-4.24',
    'M1 1l22 22',
  ]);
}

// Feather: refresh-cw
function createRefreshIcon(): SVGElement {
  const svg = createSVGIcon([]);
  const poly1 = document.createElementNS(SVG_NS, 'polyline');
  poly1.setAttribute('points', '23,4 23,10 17,10');
  poly1.setAttribute('stroke', 'currentColor');
  poly1.setAttribute('stroke-width', '2');
  poly1.setAttribute('stroke-linecap', 'round');
  poly1.setAttribute('stroke-linejoin', 'round');
  poly1.setAttribute('fill', 'none');
  svg.appendChild(poly1);

  const poly2 = document.createElementNS(SVG_NS, 'polyline');
  poly2.setAttribute('points', '1,20 1,14 7,14');
  poly2.setAttribute('stroke', 'currentColor');
  poly2.setAttribute('stroke-width', '2');
  poly2.setAttribute('stroke-linecap', 'round');
  poly2.setAttribute('stroke-linejoin', 'round');
  poly2.setAttribute('fill', 'none');
  svg.appendChild(poly2);

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('fill', 'none');
  svg.appendChild(path);
  return svg;
}

// Feather: arrow-down + "A" text for sort
function createSortIcon(): SVGElement {
  return createSVGIcon([
    'M12 5v14',
    'M19 12l-7 7-7-7',
  ]);
}
```

- [ ] **Step 2: Replace text buttons with SVG icons in `_buildHeader`**

Replace the toggle hidden button:
```typescript
// Toggle hidden button
const toggleHiddenBtn = document.createElement('button');
toggleHiddenBtn.setAttribute('aria-label', 'Toggle hidden files');
toggleHiddenBtn.setAttribute('title', 'Toggle hidden files');
toggleHiddenBtn.appendChild(this._showHidden ? createEyeIcon() : createEyeOffIcon());
toggleHiddenBtn.addEventListener('click', () => {
  this._showHidden = !this._showHidden;
  // Update icon
  while (toggleHiddenBtn.firstChild) { toggleHiddenBtn.removeChild(toggleHiddenBtn.firstChild); }
  toggleHiddenBtn.appendChild(this._showHidden ? createEyeIcon() : createEyeOffIcon());
  this._tree.setFilter((entry) => this._applyFilter(entry));
  void this._tree.refresh();
});
actions.appendChild(toggleHiddenBtn);
```

Replace the sort button:
```typescript
const sortBtn = document.createElement('button');
sortBtn.setAttribute('aria-label', 'Sort');
sortBtn.setAttribute('title', 'Sort');
sortBtn.appendChild(createSortIcon());
actions.appendChild(sortBtn);
```

Replace the refresh button:
```typescript
const refreshBtn = document.createElement('button');
refreshBtn.setAttribute('aria-label', 'Refresh');
refreshBtn.setAttribute('title', 'Refresh');
refreshBtn.appendChild(createRefreshIcon());
refreshBtn.addEventListener('click', () => {
  void this._tree.refresh();
});
actions.appendChild(refreshBtn);
```

- [ ] **Step 3: Run build and verify**

```bash
npx turbo build
```

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/browser/filesPanel.ts
git commit -m "feat: replace text buttons with SVG icons in Files panel"
```

---

### Task 5: Make sidebar resizable

Add a drag handle between `.workbench-sidebar` and `.workbench-main` that lets the user resize the sidebar width.

**Files:**
- Modify: `packages/ui/src/browser/workbench.ts`
- Modify: `apps/desktop/src/renderer/styles.css`

- [ ] **Step 1: Add resize handle element in workbench.ts**

After `layout.sidebar.appendChild(this._sidebar.getDomNode());` add:

```typescript
// Resize handle
const resizeHandle = document.createElement('div');
resizeHandle.classList.add('sidebar-resize-handle');
let startX = 0;
let startWidth = 0;

const onMouseMove = (e: MouseEvent) => {
  const newWidth = Math.max(160, Math.min(600, startWidth + (e.clientX - startX)));
  layout.sidebar.style.width = `${newWidth}px`;
};

const onMouseUp = () => {
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
};

resizeHandle.addEventListener('mousedown', (e) => {
  e.preventDefault();
  startX = e.clientX;
  startWidth = layout.sidebar.getBoundingClientRect().width;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
});

layout.sidebar.appendChild(resizeHandle);
```

- [ ] **Step 2: Add CSS for resize handle**

In `apps/desktop/src/renderer/styles.css`, after the `.workbench-sidebar` rules, add:

```css
.sidebar-resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  z-index: 10;
}
.sidebar-resize-handle:hover {
  background: var(--brand-primary);
  opacity: 0.5;
}
```

Also add `position: relative;` to `.workbench-sidebar`.

- [ ] **Step 3: Run build and verify**

```bash
npx turbo build
```

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/browser/workbench.ts apps/desktop/src/renderer/styles.css
git commit -m "feat: add resizable sidebar with drag handle"
```

---

## Chunk 3: Recursive File Search

### Task 6: Add FILES_SEARCH IPC channel and main process handler

**Files:**
- Modify: `packages/platform/src/ipc/common/ipc.ts`
- Modify: `packages/platform/src/files/common/files.ts`
- Modify: `packages/platform/src/files/node/fileService.ts`
- Modify: `packages/electron/src/main/mainProcess.ts`
- Modify: `apps/desktop/src/preload/index.ts`

- [ ] **Step 1: Add IPC channel and schema**

In `packages/platform/src/ipc/common/ipc.ts`:

Add to `IPC_CHANNELS`:
```typescript
FILES_SEARCH: 'files:search',
```

Add schema:
```typescript
export const FilesSearchRequestSchema = z.object({
  rootPath: z.string(),
  query: z.string(),
  maxResults: z.number().optional(),
});
```

- [ ] **Step 2: Add search method to IFileService**

In `packages/platform/src/files/common/files.ts`, add to the `IFileService` interface:

```typescript
search(rootPath: string, query: string, maxResults?: number): Promise<FileEntry[]>;
```

- [ ] **Step 3: Implement recursive search in NodeFileService**

In `packages/platform/src/files/node/fileService.ts`, add:

```typescript
async search(rootPath: string, query: string, maxResults = 50): Promise<FileEntry[]> {
  const results: FileEntry[] = [];
  const lowerQuery = query.toLowerCase();

  const walk = async (dir: string): Promise<void> => {
    if (results.length >= maxResults) { return; }
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // Skip inaccessible directories
    }
    for (const entry of entries) {
      if (results.length >= maxResults) { return; }
      const fullPath = join(dir, entry.name);
      if (entry.name.toLowerCase().includes(lowerQuery)) {
        results.push({
          name: entry.name,
          path: fullPath,
          type: entry.isDirectory() ? 'directory' : 'file',
        });
      }
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        await walk(fullPath);
      }
    }
  };

  await walk(rootPath);
  return results;
}
```

Also add `Dirent` to the imports from `node:fs`:
```typescript
import { watch as fsWatch, type FSWatcher, type Dirent } from 'node:fs';
```

- [ ] **Step 4: Add IPC handler in mainProcess.ts**

In `packages/electron/src/main/mainProcess.ts`, add after the existing file handlers:

```typescript
ipcMainAdapter.handle(IPC_CHANNELS.FILES_SEARCH, async (...args: unknown[]) => {
  const { rootPath, query, maxResults } = args[0] as { rootPath: string; query: string; maxResults?: number };
  validatePath(rootPath);
  return fileService.search(rootPath, query, maxResults);
});
```

- [ ] **Step 5: Whitelist in preload**

In `apps/desktop/src/preload/index.ts`, add `IPC_CHANNELS.FILES_SEARCH` to `ALLOWED_INVOKE_CHANNELS`.

- [ ] **Step 6: Run build and verify**

```bash
npx turbo build
```

- [ ] **Step 7: Commit**

```bash
git add packages/platform/src/ipc/common/ipc.ts packages/platform/src/files/common/files.ts packages/platform/src/files/node/fileService.ts packages/electron/src/main/mainProcess.ts apps/desktop/src/preload/index.ts
git commit -m "feat: add FILES_SEARCH IPC channel for recursive file search"
```

---

### Task 7: Wire search into FilesPanel UI

When the filter input has text, switch from tree view to flat search results. When cleared, switch back to tree view.

**Files:**
- Modify: `packages/ui/src/browser/filesPanel.ts`
- Modify: `apps/desktop/src/renderer/files.css`

- [ ] **Step 1: Add search state and results container**

In `FilesPanel`, add new private fields:

```typescript
private _searchResults: HTMLElement;
private _searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
```

In the constructor, create the search results container (hidden by default) and add it after the tree container:

```typescript
this._searchResults = document.createElement('div');
this._searchResults.classList.add('files-search-results');
this._searchResults.style.display = 'none';
this._container.insertBefore(this._searchResults, this._treeContainer.nextSibling);
```

- [ ] **Step 2: Update filter input to trigger search**

Replace the current input event handler in `_buildFilterInput` with:

```typescript
input.setAttribute('placeholder', 'Search files...');
input.setAttribute('aria-label', 'Search files');
input.addEventListener('input', () => {
  this._filterText = input.value;
  if (this._searchDebounceTimer) { clearTimeout(this._searchDebounceTimer); }

  if (!this._filterText) {
    // Clear search, show tree
    this._searchResults.style.display = 'none';
    this._treeContainer.style.display = '';
    this._tree.setFilter((entry) => this._applyFilter(entry));
    void this._tree.refresh();
    return;
  }

  this._searchDebounceTimer = setTimeout(() => {
    this._searchDebounceTimer = null;
    void this._performSearch(this._filterText);
  }, 300);
});
```

- [ ] **Step 3: Add `_performSearch` method**

```typescript
private async _performSearch(query: string): Promise<void> {
  try {
    const results = await this._ipc.invoke<FileEntry[]>(IPC_CHANNELS.FILES_SEARCH, {
      rootPath: this._workspacePath,
      query,
      maxResults: 50,
    });

    // Hide tree, show results
    this._treeContainer.style.display = 'none';
    this._searchResults.style.display = '';

    // Clear previous results
    while (this._searchResults.firstChild) {
      this._searchResults.removeChild(this._searchResults.firstChild);
    }

    if (results.length === 0) {
      const empty = document.createElement('div');
      empty.classList.add('files-search-empty');
      empty.textContent = 'No files found';
      this._searchResults.appendChild(empty);
      return;
    }

    for (const entry of results) {
      const row = document.createElement('div');
      row.classList.add('files-search-row');

      // Icon
      const icon = entry.type === 'directory'
        ? getFolderIconSVG(false)
        : createFileIconSVG(entry.name);
      icon.classList.add('tree-icon');
      row.appendChild(icon);

      // Name
      const nameSpan = document.createElement('span');
      nameSpan.classList.add('files-search-name');
      nameSpan.textContent = entry.name;
      nameSpan.setAttribute('title', entry.path);
      row.appendChild(nameSpan);

      // Relative path
      const pathSpan = document.createElement('span');
      pathSpan.classList.add('files-search-path');
      const relativePath = entry.path.replace(this._workspacePath + '/', '');
      pathSpan.textContent = relativePath;
      pathSpan.setAttribute('title', entry.path);
      row.appendChild(pathSpan);

      // Attach button
      const attachBtn = document.createElement('button');
      attachBtn.classList.add('tree-attach-btn');
      attachBtn.setAttribute('aria-label', `Attach ${entry.name}`);
      attachBtn.setAttribute('title', 'Attach to chat');
      attachBtn.textContent = '+';
      attachBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._onDidRequestAttachEmitter.fire(entry);
      });
      row.appendChild(attachBtn);

      this._searchResults.appendChild(row);
    }
  } catch (err) {
    console.error('[FilesPanel] Search failed:', err);
  }
}
```

- [ ] **Step 4: Remove the old `_applyFilter` text filter logic**

In `_applyFilter`, remove the text filter block (the `if (this._filterText)` section). The method should only handle hidden files filtering:

```typescript
private _applyFilter(entry: FileEntry): boolean {
  if (!this._showHidden && isHiddenByDefault(entry)) {
    return false;
  }
  return true;
}
```

- [ ] **Step 5: Add CSS for search results**

In `apps/desktop/src/renderer/files.css`, add:

```css
/* Search results */
.files-search-results { flex: 1; overflow-y: auto; }

.files-search-row {
  display: flex;
  align-items: center;
  padding: 2px 8px;
  cursor: pointer;
  white-space: nowrap;
  gap: 6px;
}
.files-search-row:hover { background: var(--bg-hover); }
.files-search-row:hover .tree-attach-btn { opacity: 1; }

.files-search-name {
  font-size: var(--font-size-sm);
  color: var(--fg-primary);
  flex-shrink: 0;
}

.files-search-path {
  font-size: var(--font-size-sm);
  color: var(--fg-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.files-search-empty {
  padding: 16px;
  text-align: center;
  color: var(--fg-muted);
  font-size: var(--font-size-sm);
}
```

- [ ] **Step 6: Clean up search timer on dispose**

In the `dispose` method, add:
```typescript
if (this._searchDebounceTimer) { clearTimeout(this._searchDebounceTimer); }
```

- [ ] **Step 7: Add `FILES_SEARCH` to the IPC_CHANNELS import**

Make sure `IPC_CHANNELS.FILES_SEARCH` is available in `filesPanel.ts`. Since `filesPanel.ts` already imports `IPC_CHANNELS` from `@gho-work/platform/common`, this should work automatically after Task 6.

- [ ] **Step 8: Run build and verify**

```bash
npx turbo build
```

- [ ] **Step 9: Commit**

```bash
git add packages/ui/src/browser/filesPanel.ts apps/desktop/src/renderer/files.css
git commit -m "feat: add recursive file search in Files panel"
```

---

## Chunk 4: Verification

### Task 8: Update E2E tests and verify

**Files:**
- Modify: `tests/e2e/files.spec.ts`

- [ ] **Step 1: Update E2E test selectors**

In `tests/e2e/files.spec.ts`, update all CSS selectors from `.documents-*` to `.files-*`. Update the activity bar label from `'Documents'` to `'Files'`. Update test descriptions.

- [ ] **Step 2: Run all tests**

```bash
npx vitest run packages/ui/src/browser/__tests__/treeWidget.test.ts
npx turbo build
```

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/files.spec.ts
git commit -m "test: update e2e tests for Files panel rename"
```

### Task 9: HARD GATE — Launch and verify all 7 changes

- [ ] **Step 1: Build and launch**

```bash
npx turbo build
cd apps/desktop && npx electron out/main/index.js
```

- [ ] **Step 2: Verify each change**

1. Activity bar shows "Files" label (not "Documents")
2. Panel title says "FILES"
3. Folders have a + attach button on hover
4. No "new file" button in header
5. Sidebar can be resized by dragging the right edge
6. Long filenames show tooltip on hover
7. Header buttons show SVG icons (eye, sort arrow, refresh arrows)
8. Type in search box → flat search results appear with relative paths
9. Clear search box → tree view returns
10. Search finds files in nested directories
