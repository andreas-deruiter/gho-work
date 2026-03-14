# Documents Panel — Design Spec

**Date:** 2026-03-14
**Status:** Draft
**Scope:** Sidebar file explorer for browsing workspace files and attaching them to chat messages

---

## 1. Overview

The Documents panel is a sidebar view (accessible via Activity Bar, `Cmd+3`) that shows a recursive file tree of the current workspace folder. It behaves like a simplified VS Code Explorer — browse, expand/collapse folders, create/rename/delete files — with one key addition: an attach action that lets users reference files in chat messages so the agent can work with them.

### Goals

- Browse workspace files with familiar tree UI (expand/collapse, keyboard nav)
- Attach files to chat messages for agent context
- Basic file operations (create, rename, delete) via context menu
- Smart defaults: hide dotfiles and build artifacts, configurable in settings
- Lightweight implementation (~500-800 lines for tree widget) that fits existing codebase patterns

### Non-Goals (v1)

- Document preview/rendering in main panel
- Drag-and-drop (files or reordering)
- Multi-select
- Virtualized scrolling
- File icon themes
- Split-view (chat + document preview side by side)

---

## 2. Data Model

### FileEntry

The data structure returned by the file service and used throughout the UI:

```typescript
interface FileEntry {
  name: string;          // "report.docx"
  path: string;          // "/Users/me/workspace/reports/report.docx"
  type: 'file' | 'directory' | 'symlink';
  size: number;          // bytes
  mtime: number;         // last modified timestamp (ms)
  isHidden: boolean;     // starts with "."
}
```

### FileChangeEvent

Emitted by the file watcher when files are created, changed, or deleted:

```typescript
interface FileChangeEvent {
  type: 'created' | 'changed' | 'deleted';
  path: string;
}
```

### FileAttachment

Represents a file attached to a chat message:

```typescript
interface FileAttachment {
  name: string;          // display name
  path: string;          // absolute path
  type: 'file';
  size: number;
  iconType: string;      // for rendering the correct icon
}
```

---

## 3. IFileService

Extend the existing interface in `packages/platform/src/files/common/files.ts`:

```typescript
interface IFileService {
  // Existing methods
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  readDir(path: string): Promise<string[]>;
  mkdir(path: string): Promise<void>;

  // New methods for Documents panel
  readDirWithStats(path: string): Promise<FileEntry[]>;
  stat(path: string): Promise<FileEntry>;
  createFile(path: string, content?: string): Promise<void>;
  createDir(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  delete(path: string): Promise<void>;

  // File watching
  watch(path: string): Promise<IDisposable>;
  onDidChangeFile: Event<FileChangeEvent>;
}
```

### NodeFileService

Extend the existing implementation in `packages/platform/src/files/node/fileService.ts` (NOT a new file):

- Uses `fs/promises` for all operations
- `readDirWithStats()` calls `readdir` then `stat` for each entry, returns `FileEntry[]`
- File watching via `fs.watch` with `{ recursive: true }` — no chokidar dependency
  - **Platform note:** `fs.watch` recursive mode is only supported on macOS and Windows. Linux support is not available. v1 targets macOS (Darwin) only for file watching. A future iteration can add Linux support via manual directory traversal or a lightweight watcher library.
- `delete()` uses `rm` with `{ recursive: true }` for directories, with confirmation handled by the UI layer
- All paths validated to stay within workspace root (prevent path traversal)

### IPC Channels

All new channels must be added to `IPC_CHANNELS` in `packages/platform/src/ipc/common/ipc.ts` with corresponding Zod schemas, following the existing pattern. Channel constants are referenced everywhere — never use raw strings.

Seven new invoke channels plus one push channel:

| Channel | Direction | Payload | Response |
|---------|-----------|---------|----------|
| `files:readDir` | renderer→main | `{ path: string }` | `FileEntry[]` |
| `files:stat` | renderer→main | `{ path: string }` | `FileEntry` |
| `files:create` | renderer→main | `{ path: string, type: 'file' \| 'directory', content?: string }` | `void` |
| `files:rename` | renderer→main | `{ oldPath: string, newPath: string }` | `void` |
| `files:delete` | renderer→main | `{ path: string }` | `void` |
| `files:watch` | renderer→main | `{ path: string }` | `{ watchId: string }` |
| `files:unwatch` | renderer→main | `{ watchId: string }` | `void` |
| `files:changed` | main→renderer | `FileChangeEvent` | — |

All channels added to `IPC_CHANNELS` constants, Zod schemas, and the preload whitelist in `apps/desktop/src/preload/index.ts`.

---

## 4. TreeWidget

A reusable, lightweight tree component in `packages/ui/src/browser/treeWidget.ts`. Inspired by VS Code's tree patterns but purpose-built (~500-800 lines).

### Interfaces

```typescript
interface ITreeDataSource<T> {
  getRoots(): Promise<T[]>;
  hasChildren(element: T): boolean;
  getChildren(element: T): Promise<T[]>;
}

interface ITreeRenderer<T> {
  renderNode(element: T, depth: number, container: HTMLElement): IDisposable;
  updateNode?(element: T, container: HTMLElement): void;
}

interface ITreeOptions<T> {
  dataSource: ITreeDataSource<T>;
  renderer: ITreeRenderer<T>;
  filter?: (element: T) => boolean;
  sorter?: (a: T, b: T) => number;
}
```

### TreeWidget<T> extends Widget

**Rendering:**
- Recursive DOM rendering — each node is a `div` with indent based on depth (16px per level)
- Chevron icon for expandable nodes (▶ collapsed, ▼ expanded)
- Loading spinner shown while children are being fetched

**Lazy loading:**
- Children fetched on first expand via `dataSource.getChildren()`
- Cached until `refresh(element?)` is called
- `refresh()` re-fetches and re-renders a subtree (or full tree if no element specified)

**Keyboard navigation:**
- `↑` / `↓` — move focus between visible nodes
- `←` — collapse current node, or move to parent if already collapsed
- `→` — expand current node, or move to first child if already expanded
- `Enter` — select focused node (fires `onDidSelect`)
- `Space` — toggle expand/collapse

**Events:**
- `onDidSelect: Event<T>` — fired when a node is selected (click or Enter)
- `onDidToggle: Event<{ element: T, expanded: boolean }>` — fired on expand/collapse
- `onContextMenu: Event<{ element: T, event: MouseEvent }>` — fired on right-click

**Filtering & sorting:**
- `filter` function applied during render — hidden nodes not added to DOM
- `sorter` function applied to children before rendering
- Both can be updated dynamically via `setFilter()` / `setSorter()`

**Not included in v1:** virtualized scrolling, drag-and-drop, multi-select, sticky scroll headers.

---

## 5. DocumentsPanel

Sidebar panel in `packages/ui/src/browser/documentsPanel.ts`. Extends `Widget`.

### Structure

```
DocumentsPanel
├── Header
│   ├── Title ("DOCUMENTS")
│   ├── New File button (+)
│   ├── Toggle Hidden Files button (eye icon)
│   ├── Sort toggle (name / modified time)
│   └── Refresh button (↻)
├── Filter Input
│   └── Text input with "Filter files..." placeholder
├── TreeWidget<FileEntry>
│   ├── Workspace root label
│   └── Recursive file/folder tree
│       ├── Folder rows: chevron + folder icon + name
│       └── File rows: file icon + name + timestamp + attach button
└── Footer
    └── File/folder count summary
```

### File Row Interactions

- **Hover** — row highlights, attach button (📎) fades in
- **Click file name** — selects the row, shows basic info (size, modified date, path) in a tooltip or small popover
- **Click attach button** — adds file as attachment chip in ChatInput
- **Right-click** — context menu with: Attach to Message, Rename, Delete, Reveal in Finder, Copy Path
- **Click folder** — expands/collapses

### Header Actions

- **New File (+)** — creates an inline rename input at the current location. User types name and presses Enter. Creates file or directory (trailing `/` = directory).
- **Toggle Hidden** — toggles visibility of dotfiles and build artifacts. Eye icon shows current state (open = showing all, closed = filtered).
- **Sort toggle** — cycles between name (A↓) and modified time (clock icon). Persisted in settings.
- **Refresh** — re-reads the full tree from disk.

### Constructor Pattern

Following the existing `Widget` convention (see `ActivityBar`, `ConversationListPanel`):

```typescript
class DocumentsPanel extends Widget {
  constructor(private readonly workspacePath: string, private readonly ipc: IIPCRenderer) {
    const { root } = h('div.documents-panel', [
      h('div.documents-header'),
      h('div.documents-filter'),
      h('div.documents-tree'),
      h('div.documents-footer'),
    ]);
    super(root);
    // Build sub-widgets, register disposables via this._register()
  }
}
```

### Data Source

```typescript
class FileTreeDataSource implements ITreeDataSource<FileEntry> {
  constructor(private readonly workspacePath: string, private readonly ipc: IIPCRenderer) {}

  async getRoots(): Promise<FileEntry[]> {
    // Returns the workspace root as a single-element array
    const stat = await this.ipc.invoke(IPC_CHANNELS.FILES_STAT, { path: this.workspacePath });
    return [stat];
  }

  hasChildren(entry: FileEntry): boolean {
    return entry.type === 'directory';
  }

  async getChildren(entry: FileEntry): Promise<FileEntry[]> {
    return this.ipc.invoke(IPC_CHANNELS.FILES_READ_DIR, { path: entry.path });
  }
}
```

### Renderer

```typescript
class FileTreeRenderer implements ITreeRenderer<FileEntry> {
  renderNode(entry: FileEntry, depth: number, container: HTMLElement): IDisposable {
    // Creates: [indent] [chevron?] [icon] [name] [timestamp] [attach btn]
    // Icon and color determined by getFileIcon(entry)
    // Timestamp formatted as relative time (2m, 1h, 3d)
    // Attach button visible on hover
  }
}
```

---

## 6. File Icons

Simple extension-based mapping in `packages/ui/src/browser/fileIcons.ts`:

```typescript
const FILE_ICON_MAP: Record<string, { icon: string; color: string }> = {
  // Documents
  md:    { icon: 'markdown', color: '#6b9ff4' },
  docx:  { icon: 'word',     color: '#4285f4' },
  doc:   { icon: 'word',     color: '#4285f4' },
  pdf:   { icon: 'pdf',      color: '#e06c75' },
  txt:   { icon: 'text',     color: '#aaa' },
  rtf:   { icon: 'text',     color: '#aaa' },
  // Spreadsheets
  xlsx:  { icon: 'excel',    color: '#0f9d58' },
  xls:   { icon: 'excel',    color: '#0f9d58' },
  csv:   { icon: 'csv',      color: '#0f9d58' },
  // Presentations
  pptx:  { icon: 'powerpoint', color: '#d04423' },
  ppt:   { icon: 'powerpoint', color: '#d04423' },
  // Images
  png:   { icon: 'image',    color: '#c678dd' },
  jpg:   { icon: 'image',    color: '#c678dd' },
  jpeg:  { icon: 'image',    color: '#c678dd' },
  gif:   { icon: 'image',    color: '#c678dd' },
  svg:   { icon: 'image',    color: '#c678dd' },
  // Data
  json:  { icon: 'json',     color: '#febc2e' },
  yaml:  { icon: 'yaml',     color: '#febc2e' },
  yml:   { icon: 'yaml',     color: '#febc2e' },
  xml:   { icon: 'xml',      color: '#febc2e' },
  // Archives
  zip:   { icon: 'archive',  color: '#888' },
  tar:   { icon: 'archive',  color: '#888' },
  gz:    { icon: 'archive',  color: '#888' },
  // Default
  _:     { icon: 'file',     color: '#888' },
};
```

Icons are inline SVGs — no icon font dependency. Folder icon is always yellow (`#febc2e`). The map is easily extensible.

---

## 7. Smart Filtering

### Default Hidden Patterns

```typescript
const DEFAULT_HIDDEN_PATTERNS = [
  /^\./,              // dotfiles (.git, .env, .DS_Store)
  /^node_modules$/,
  /^dist$/,
  /^out$/,
  /^build$/,
  /^__pycache__$/,
  /\.pyc$/,
  /^\.next$/,
  /^\.nuxt$/,
  /^coverage$/,
];
```

### Filter Input

Substring match on filename, case-insensitive. Applied in addition to hidden patterns (when hidden files are not shown). Filters the visible tree — non-matching nodes are removed from DOM, but parent folders are kept if they contain matching descendants.

---

## 8. User Settings

Configurable under **Settings > Documents**:

| Setting | Key | Type | Default | Description |
|---------|-----|------|---------|-------------|
| Hidden file patterns | `documents.hiddenPatterns` | `string[]` | see above | Glob/regex patterns for files hidden by default |
| Show hidden files | `documents.showHidden` | `boolean` | `false` | Whether to show hidden files (also togglable in panel header) |
| Sort by | `documents.sortBy` | `'name' \| 'modified'` | `'name'` | Sort order for files within each directory |
| Directories first | `documents.directoriesFirst` | `boolean` | `true` | Whether directories sort before files |

Settings are read from the existing settings service and applied reactively (changing a setting updates the panel immediately).

---

## 9. Chat Attachments

Modifications to the existing `ChatPanel` in `packages/ui/src/browser/chatPanel.ts`. Note: there is no separate `ChatInput` widget — the input area is part of `ChatPanel` (which already has `_inputEl`, `_attachmentListEl`, and `_attachments`).

### New Public Methods on ChatPanel

```typescript
addAttachment(file: FileEntry): void;      // adds chip, fires event
removeAttachment(path: string): void;      // removes chip, fires event
clearAttachments(): void;                  // clears all after send
```

### New Event

```typescript
onDidChangeAttachments: Event<FileAttachment[]>;
```

### UI

- Attachment chips render in the existing `_attachmentListEl` flex-wrap container above the text input
- Each chip: file-type icon + filename + remove (×) button
- Chips styled as pills with subtle border (matches dark theme)
- Container hidden when no attachments
- Chips cleared after message is sent

### Message Payload

Update `SendMessageRequestSchema` in `packages/platform/src/ipc/common/ipc.ts` to include attachments:

```typescript
const SendMessageRequestSchema = z.object({
  conversationId: z.string(),
  content: z.string(),
  model: z.string().optional(),
  attachments: z.array(z.object({       // new field
    name: z.string(),
    path: z.string(),
    size: z.number(),
  })).optional(),
});
```

### Agent-Side Handling

When `AgentServiceImpl.executeTask()` receives a message with attachments, it prepends the file paths to the user message as context references. The agent then uses SDK file read tools to access the content on demand — file contents are NOT eagerly loaded into the message payload (avoids memory issues with large files). Example prepended context:

```
[Attached files: /path/to/report.md, /path/to/data.xlsx]
```

The agent's existing `readFile` tool handles the actual content access.

---

## 10. Wiring & Integration

### Activity Bar → Sidebar

The Documents icon already exists in `activityBar.ts`. Currently a stub. Wire it to show `DocumentsPanel`:

```typescript
// In workbench.ts render()
const documentsPanel = new DocumentsPanel(workspacePath, ipc);
this.sidebar.addPanel('documents', documentsPanel.getDomNode());
```

### Workspace Path

The workspace path is determined at app startup. A new IPC channel `workspace:getRoot` returns the current workspace root path (defaults to `process.cwd()` or the path passed via CLI argument). This channel is added to `IPC_CHANNELS` and the preload whitelist. The renderer fetches it during workbench initialization and passes it to `DocumentsPanel`.

If no workspace is set (e.g., fresh install), the Documents panel shows an empty state: "No workspace open. Open a folder to browse files."

### Cross-Panel Communication

DocumentsPanel emits `onDidRequestAttach(file: FileEntry)`. Workbench subscribes and forwards to ChatPanel:

```typescript
documentsPanel.onDidRequestAttach(file => {
  chatPanel.addAttachment(file);
});
```

No new service needed — Workbench mediates between panels (existing pattern).

### IPC Registration

In `mainProcess.ts`, register handlers for `files:*` channels:

```typescript
ipcMain.handle('files:readDir', (_, args) => fileService.readDirWithStats(args.path));
ipcMain.handle('files:stat', (_, args) => fileService.stat(args.path));
ipcMain.handle('files:create', (_, args) => { /* createFile or createDir */ });
ipcMain.handle('files:rename', (_, args) => fileService.rename(args.oldPath, args.newPath));
ipcMain.handle('files:delete', (_, args) => fileService.delete(args.path));
ipcMain.handle('files:watch', (_, args) => { /* start watcher, return ID */ });
```

### Preload Whitelist

Add all `files:*` channels to the invoke and on whitelists in `apps/desktop/src/preload/index.ts`.

### File Watcher Lifecycle

- Watcher starts when Documents panel first activates (lazy — not on app start)
- Watches workspace root recursively via `fs.watch`
- File change events sent to renderer via `files:changed` channel
- Renderer calls `treeWidget.refresh(parentPath)` for the affected directory
- `DocumentsPanel.dispose()` sends `files:unwatch` with the stored `watchId` to stop the main-process watcher, preventing resource leaks on panel re-creation

---

## 11. File Layout

New and modified files:

```
packages/platform/src/files/
  common/
    files.ts                    # MODIFY: extend IFileService, add FileEntry, FileChangeEvent
  node/
    fileService.ts              # MODIFY: extend existing NodeFileService with new methods

packages/ui/src/browser/
  treeWidget.ts                 # NEW: reusable TreeWidget<T>
  documentsPanel.ts             # NEW: DocumentsPanel sidebar
  fileIcons.ts                  # NEW: file icon map + SVG icons
  contextMenu.ts                # NEW: lightweight context menu widget
  chatPanel.ts                  # MODIFY: add attachment chips and public attach methods

packages/electron/src/main/
  mainProcess.ts                # MODIFY: register files:* IPC handlers

apps/desktop/src/
  preload/index.ts              # MODIFY: add files:* to whitelist
  renderer/main.ts              # MODIFY: (if needed for wiring)

packages/ui/src/browser/
  workbench.ts                  # MODIFY: create DocumentsPanel, wire events
```

---

## 12. Security

- **Path traversal prevention:** `NodeFileService` validates all paths are within the workspace root before any operation. Reject paths containing `..` that would escape the workspace.
- **Delete confirmation:** UI shows confirmation dialog before deleting files/directories.
- **No arbitrary execution:** The Documents panel only reads/writes/deletes files. It never executes them.
- **Preload whitelist:** Only the specific `files:*` channels are exposed via the preload bridge.
