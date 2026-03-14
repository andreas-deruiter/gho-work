# Documents Panel Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a Documents sidebar panel that lets users browse workspace files and attach them to chat messages for agent context.

**Architecture:** A reusable `TreeWidget<T>` renders the file tree using lazy-loaded data from `IFileService` via IPC. `DocumentsPanel` composes the tree with header actions (new file, toggle hidden, sort, refresh), a filter input, and a footer. Clicking the attach button on a file row calls `ChatPanel.addAttachment()`, mediated by `Workbench`. File watching keeps the tree in sync with disk. All file operations go through `IFileService` in the main process via IPC.

**Tech Stack:** TypeScript, Electron IPC, Zod schemas, fs/promises, fs.watch, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-03-14-documents-panel-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `packages/ui/src/browser/treeWidget.ts` | Reusable generic tree component with lazy loading, keyboard nav, filtering, sorting |
| `packages/ui/src/browser/__tests__/treeWidget.test.ts` | Unit tests for TreeWidget |
| `packages/ui/src/browser/documentsPanel.ts` | Documents sidebar: header, filter, tree, footer, attach action |
| `packages/ui/src/browser/__tests__/documentsPanel.test.ts` | Unit tests for DocumentsPanel |
| `packages/ui/src/browser/fileIcons.ts` | Extension-to-icon map + inline SVG generators |
| `packages/ui/src/browser/__tests__/fileIcons.test.ts` | Unit tests for icon lookup |
| `packages/ui/src/browser/contextMenu.ts` | Lightweight context menu widget |
| `packages/ui/src/browser/__tests__/contextMenu.test.ts` | Unit tests for ContextMenu |
| `apps/desktop/src/renderer/documents.css` | CSS for documents panel, tree, context menu |
| `tests/e2e/documents.spec.ts` | E2E tests for Documents panel |

### Modified Files

| File | Change |
|------|--------|
| `packages/platform/src/ipc/common/ipc.ts` | Add `FILES_*` channels + Zod schemas |
| `packages/platform/src/files/common/files.ts` | Add `FileEntry`, `FileChangeEvent` types; extend `IFileService` |
| `packages/platform/src/files/node/fileService.ts` | Implement new methods: `readDirWithStats`, `stat`, `createFile`, `createDir`, `rename`, `delete`, `watch` |
| `packages/ui/src/browser/chatPanel.ts` | Add public `addAttachment()`, `removeAttachment()`, `onDidChangeAttachments` |
| `packages/ui/src/browser/workbench.ts` | Create DocumentsPanel, wire to sidebar, mediate attach events |
| `packages/ui/src/index.ts` | Export DocumentsPanel |
| `packages/electron/src/main/mainProcess.ts` | Register `files:*` IPC handlers |
| `apps/desktop/src/preload/index.ts` | Add `files:*` channels to whitelists |
| `apps/desktop/src/renderer/main.ts` | Import `documents.css` |
| `packages/platform/src/ipc/common/ipc.ts` | Add `attachments` field to `SendMessageRequestSchema` |

---

## Chunk 1: IPC Channels, Schemas & File Service Types

### Task 1: Add file IPC channels and Zod schemas

**Files:**
- Modify: `packages/platform/src/ipc/common/ipc.ts:6-45` (IPC_CHANNELS) and append schemas

- [x] **Step 1: Add file channels to IPC_CHANNELS**

Add after the skill channels block in `packages/platform/src/ipc/common/ipc.ts`:

```typescript
  // File channels
  FILES_READ_DIR: 'files:read-dir',
  FILES_STAT: 'files:stat',
  FILES_CREATE: 'files:create',
  FILES_RENAME: 'files:rename',
  FILES_DELETE: 'files:delete',
  FILES_WATCH: 'files:watch',
  FILES_UNWATCH: 'files:unwatch',
  FILES_CHANGED: 'files:changed',
  WORKSPACE_GET_ROOT: 'workspace:get-root',
```

- [x] **Step 2: Add Zod schemas and DTO types**

Append after the skill schemas in `packages/platform/src/ipc/common/ipc.ts`:

```typescript
// --- File schemas ---

export const FileEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(['file', 'directory', 'symlink']),
  size: z.number(),
  mtime: z.number(),
  isHidden: z.boolean(),
});
export type FileEntry = z.infer<typeof FileEntrySchema>;

export const FileChangeEventSchema = z.object({
  type: z.enum(['created', 'changed', 'deleted']),
  path: z.string(),
});
export type FileChangeEvent = z.infer<typeof FileChangeEventSchema>;

export const FilesReadDirRequestSchema = z.object({ path: z.string() });
export type FilesReadDirRequest = z.infer<typeof FilesReadDirRequestSchema>;

export const FilesStatRequestSchema = z.object({ path: z.string() });
export type FilesStatRequest = z.infer<typeof FilesStatRequestSchema>;

export const FilesCreateRequestSchema = z.object({
  path: z.string(),
  type: z.enum(['file', 'directory']),
  content: z.string().optional(),
});
export type FilesCreateRequest = z.infer<typeof FilesCreateRequestSchema>;

export const FilesRenameRequestSchema = z.object({
  oldPath: z.string(),
  newPath: z.string(),
});
export type FilesRenameRequest = z.infer<typeof FilesRenameRequestSchema>;

export const FilesDeleteRequestSchema = z.object({ path: z.string() });
export type FilesDeleteRequest = z.infer<typeof FilesDeleteRequestSchema>;

export const FilesWatchRequestSchema = z.object({ path: z.string() });
export type FilesWatchRequest = z.infer<typeof FilesWatchRequestSchema>;

export const FilesWatchResponseSchema = z.object({ watchId: z.string() });
export type FilesWatchResponse = z.infer<typeof FilesWatchResponseSchema>;

export const FilesUnwatchRequestSchema = z.object({ watchId: z.string() });
export type FilesUnwatchRequest = z.infer<typeof FilesUnwatchRequestSchema>;

export const WorkspaceGetRootResponseSchema = z.object({
  path: z.string().nullable(),
});
export type WorkspaceGetRootResponse = z.infer<typeof WorkspaceGetRootResponseSchema>;

export const FileAttachmentSchema = z.object({
  name: z.string(),
  path: z.string(),
  size: z.number(),
});
export type FileAttachment = z.infer<typeof FileAttachmentSchema>;
```

- [x] **Step 3: Add attachments field to SendMessageRequestSchema**

Find the existing `SendMessageRequestSchema` and add the optional `attachments` field:

```typescript
  attachments: z.array(FileAttachmentSchema).optional(),
```

- [x] **Step 4: Verify build**

Run: `npx turbo build --filter=@gho-work/platform`
Expected: Clean build, no errors

- [x] **Step 5: Commit**

```bash
git add packages/platform/src/ipc/common/ipc.ts
git commit -m "feat: add file IPC channels, schemas, and attachment support for Documents panel"
```

---

### Task 2: Extend IFileService interface with new types and methods

**Files:**
- Modify: `packages/platform/src/files/common/files.ts`

- [x] **Step 1: Add FileEntry and FileChangeEvent types**

Import or re-export the Zod-inferred types from the IPC module. Add at the top of `packages/platform/src/files/common/files.ts`:

```typescript
import type { FileEntry, FileChangeEvent } from '../../ipc/common/ipc.js';
import type { Event } from '@gho-work/base';
import type { IDisposable } from '@gho-work/base';

export type { FileEntry, FileChangeEvent };
```

- [x] **Step 2: Extend IFileService interface**

Add new methods to the existing `IFileService` interface:

```typescript
  // Documents panel methods
  readDirWithStats(path: string): Promise<FileEntry[]>;
  stat(path: string): Promise<FileEntry>;
  createFile(path: string, content?: string): Promise<void>;
  createDir(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  delete(path: string): Promise<void>;
  watch(path: string): Promise<IDisposable>;
  readonly onDidChangeFile: Event<FileChangeEvent>;
```

- [x] **Step 3: Verify build**

Run: `npx turbo build --filter=@gho-work/platform`
Expected: Build failure in `fileService.ts` (missing implementation) — that's expected, we implement in the next task.

- [x] **Step 4: Commit**

```bash
git add packages/platform/src/files/common/files.ts
git commit -m "feat: extend IFileService interface for Documents panel"
```

---

### Task 3: Implement NodeFileService extensions

**Files:**
- Modify: `packages/platform/src/files/node/fileService.ts`
- Test: `packages/platform/src/files/node/__tests__/fileService.test.ts` (new)

- [x] **Step 1: Write failing tests for new file service methods**

Create `packages/platform/src/files/node/__tests__/fileService.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeFileService } from '../fileService.js';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('NodeFileService', () => {
  let service: NodeFileService;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'gho-test-'));
    service = new NodeFileService();
  });

  afterEach(async () => {
    service.dispose();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('readDirWithStats', () => {
    it('returns FileEntry array with stats for each entry', async () => {
      await writeFile(join(tempDir, 'hello.txt'), 'world');
      await mkdir(join(tempDir, 'subdir'));

      const entries = await service.readDirWithStats(tempDir);
      expect(entries).toHaveLength(2);

      const file = entries.find(e => e.name === 'hello.txt');
      expect(file).toBeDefined();
      expect(file!.type).toBe('file');
      expect(file!.size).toBeGreaterThan(0);
      expect(file!.isHidden).toBe(false);

      const dir = entries.find(e => e.name === 'subdir');
      expect(dir).toBeDefined();
      expect(dir!.type).toBe('directory');
    });

    it('marks dotfiles as hidden', async () => {
      await writeFile(join(tempDir, '.hidden'), '');
      const entries = await service.readDirWithStats(tempDir);
      expect(entries[0].isHidden).toBe(true);
    });
  });

  describe('stat', () => {
    it('returns FileEntry for a file', async () => {
      const filePath = join(tempDir, 'test.txt');
      await writeFile(filePath, 'content');
      const entry = await service.stat(filePath);
      expect(entry.name).toBe('test.txt');
      expect(entry.type).toBe('file');
      expect(entry.path).toBe(filePath);
    });

    it('returns FileEntry for a directory', async () => {
      const entry = await service.stat(tempDir);
      expect(entry.type).toBe('directory');
    });
  });

  describe('createFile', () => {
    it('creates a new file with optional content', async () => {
      const filePath = join(tempDir, 'new.txt');
      await service.createFile(filePath, 'hello');
      const exists = await service.exists(filePath);
      expect(exists).toBe(true);
      const content = await service.readFile(filePath);
      expect(content).toBe('hello');
    });

    it('creates an empty file when no content provided', async () => {
      const filePath = join(tempDir, 'empty.txt');
      await service.createFile(filePath);
      const content = await service.readFile(filePath);
      expect(content).toBe('');
    });
  });

  describe('createDir', () => {
    it('creates a new directory', async () => {
      const dirPath = join(tempDir, 'newdir');
      await service.createDir(dirPath);
      const entry = await service.stat(dirPath);
      expect(entry.type).toBe('directory');
    });
  });

  describe('rename', () => {
    it('renames a file', async () => {
      const oldPath = join(tempDir, 'old.txt');
      const newPath = join(tempDir, 'new.txt');
      await writeFile(oldPath, 'data');
      await service.rename(oldPath, newPath);
      expect(await service.exists(oldPath)).toBe(false);
      expect(await service.exists(newPath)).toBe(true);
    });
  });

  describe('delete', () => {
    it('deletes a file', async () => {
      const filePath = join(tempDir, 'doomed.txt');
      await writeFile(filePath, '');
      await service.delete(filePath);
      expect(await service.exists(filePath)).toBe(false);
    });

    it('deletes a directory recursively', async () => {
      const dirPath = join(tempDir, 'doomed');
      await mkdir(dirPath);
      await writeFile(join(dirPath, 'child.txt'), '');
      await service.delete(dirPath);
      expect(await service.exists(dirPath)).toBe(false);
    });
  });

  describe('watch', () => {
    it('emits FileChangeEvent when a file is created', async () => {
      const events: Array<{ type: string; path: string }> = [];
      const listener = service.onDidChangeFile(e => events.push(e));

      const watcher = await service.watch(tempDir);
      // Give fs.watch time to start
      await new Promise(r => setTimeout(r, 100));

      await writeFile(join(tempDir, 'watched.txt'), 'hello');
      // Give fs.watch time to fire
      await new Promise(r => setTimeout(r, 500));

      expect(events.length).toBeGreaterThan(0);
      const createEvent = events.find(e => e.path.includes('watched.txt'));
      expect(createEvent).toBeDefined();

      watcher.dispose();
      listener.dispose();
    });
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/platform/src/files/node/__tests__/fileService.test.ts`
Expected: Multiple failures (methods not defined)

- [x] **Step 3: Implement new methods in NodeFileService**

Extend `packages/platform/src/files/node/fileService.ts`. The class needs to import `Emitter` and `Disposable` from `@gho-work/base`, and extend `Disposable`:

```typescript
import { readdir, stat as fsStat, writeFile, mkdir, rename as fsRename, rm } from 'node:fs/promises';
import { watch as fsWatch, type FSWatcher } from 'node:fs';
import { join, basename } from 'node:path';
import { Disposable, Emitter } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import type { IFileService, FileEntry, FileChangeEvent } from '../common/files.js';

export class NodeFileService extends Disposable implements IFileService {
  private readonly _onDidChangeFile = this._register(new Emitter<FileChangeEvent>());
  readonly onDidChangeFile: Event<FileChangeEvent> = this._onDidChangeFile.event;

  private readonly _watchers = new Map<string, FSWatcher>();
  private _nextWatchId = 0;

  // ... existing methods (readFile, writeFile, exists, readDir, mkdir) ...

  async readDirWithStats(dirPath: string): Promise<FileEntry[]> {
    const names = await readdir(dirPath);
    const entries: FileEntry[] = [];
    for (const name of names) {
      try {
        const fullPath = join(dirPath, name);
        const s = await fsStat(fullPath);
        entries.push({
          name,
          path: fullPath,
          type: s.isDirectory() ? 'directory' : s.isSymbolicLink() ? 'symlink' : 'file',
          size: s.size,
          mtime: s.mtimeMs,
          isHidden: name.startsWith('.'),
        });
      } catch {
        // Skip entries that can't be stat'd (e.g., broken symlinks)
      }
    }
    return entries;
  }

  async stat(filePath: string): Promise<FileEntry> {
    const s = await fsStat(filePath);
    return {
      name: basename(filePath),
      path: filePath,
      type: s.isDirectory() ? 'directory' : s.isSymbolicLink() ? 'symlink' : 'file',
      size: s.size,
      mtime: s.mtimeMs,
      isHidden: basename(filePath).startsWith('.'),
    };
  }

  async createFile(filePath: string, content?: string): Promise<void> {
    await writeFile(filePath, content ?? '', 'utf-8');
  }

  async createDir(dirPath: string): Promise<void> {
    await mkdir(dirPath, { recursive: true });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await fsRename(oldPath, newPath);
  }

  async delete(targetPath: string): Promise<void> {
    await rm(targetPath, { recursive: true, force: true });
  }

  async watch(dirPath: string): Promise<{ dispose: () => void }> {
    const id = String(this._nextWatchId++);
    const watcher = fsWatch(dirPath, { recursive: true }, (eventType, filename) => {
      if (!filename) { return; }
      const fullPath = join(dirPath, filename);
      this._onDidChangeFile.fire({
        type: eventType === 'rename' ? 'created' : 'changed',
        path: fullPath,
      });
    });
    this._watchers.set(id, watcher);
    return {
      dispose: () => {
        watcher.close();
        this._watchers.delete(id);
      },
    };
  }

  override dispose(): void {
    for (const watcher of this._watchers.values()) {
      watcher.close();
    }
    this._watchers.clear();
    super.dispose();
  }
}
```

**Important:** The existing `NodeFileService` may not extend `Disposable`. If it doesn't, change the class declaration to `extends Disposable` and add the `super()` call in the constructor. Preserve all existing methods unchanged.

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/platform/src/files/node/__tests__/fileService.test.ts`
Expected: All tests pass

- [x] **Step 5: Verify full build**

Run: `npx turbo build --filter=@gho-work/platform`
Expected: Clean build

- [x] **Step 6: Commit**

```bash
git add packages/platform/src/files/
git commit -m "feat: implement NodeFileService extensions for Documents panel"
```

---

## Chunk 2: TreeWidget

### Task 4: Implement TreeWidget

A generic, reusable tree component. This is the most complex new widget (~300-400 lines) so it gets its own task.

**Files:**
- Create: `packages/ui/src/browser/treeWidget.ts`
- Test: `packages/ui/src/browser/__tests__/treeWidget.test.ts`

- [x] **Step 1: Write failing tests for TreeWidget**

Create `packages/ui/src/browser/__tests__/treeWidget.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TreeWidget, type ITreeDataSource, type ITreeRenderer } from '../treeWidget.js';

interface TestNode {
  id: string;
  label: string;
  children?: TestNode[];
}

function createTestDataSource(roots: TestNode[]): ITreeDataSource<TestNode> {
  return {
    getRoots: vi.fn().mockResolvedValue(roots),
    hasChildren: (node: TestNode) => !!node.children && node.children.length > 0,
    getChildren: vi.fn().mockImplementation(async (node: TestNode) => node.children ?? []),
  };
}

function createTestRenderer(): ITreeRenderer<TestNode> {
  return {
    renderNode: vi.fn().mockImplementation((node: TestNode, _depth: number, container: HTMLElement) => {
      const span = document.createElement('span');
      span.textContent = node.label;
      span.dataset.id = node.id;
      container.appendChild(span);
      return { dispose: () => span.remove() };
    }),
  };
}

const ROOTS: TestNode[] = [
  {
    id: 'a',
    label: 'Folder A',
    children: [
      { id: 'a1', label: 'File A1' },
      { id: 'a2', label: 'File A2' },
    ],
  },
  { id: 'b', label: 'File B' },
];

describe('TreeWidget', () => {
  let tree: TreeWidget<TestNode>;
  let dataSource: ITreeDataSource<TestNode>;
  let renderer: ITreeRenderer<TestNode>;

  beforeEach(async () => {
    dataSource = createTestDataSource(ROOTS);
    renderer = createTestRenderer();
    tree = new TreeWidget({ dataSource, renderer });
    document.body.appendChild(tree.getDomNode());
    await tree.refresh();
  });

  afterEach(() => {
    tree.dispose();
    document.body.textContent = '';
  });

  it('renders root nodes', () => {
    const nodes = tree.getDomNode().querySelectorAll('[data-tree-depth="0"]');
    expect(nodes.length).toBe(2);
  });

  it('shows chevron for expandable nodes', () => {
    const rows = tree.getDomNode().querySelectorAll('.tree-row');
    const folderRow = Array.from(rows).find(r => r.querySelector('[data-id="a"]'));
    expect(folderRow?.querySelector('.tree-chevron')).toBeTruthy();
  });

  it('does not show chevron for leaf nodes', () => {
    const rows = tree.getDomNode().querySelectorAll('.tree-row');
    const fileRow = Array.from(rows).find(r => r.querySelector('[data-id="b"]'));
    const chevron = fileRow?.querySelector('.tree-chevron');
    // Chevron element exists but should be invisible (placeholder for alignment)
    expect(chevron?.classList.contains('tree-chevron-hidden')).toBe(true);
  });

  it('expands a node on click and shows children', async () => {
    const chevron = tree.getDomNode().querySelector('.tree-chevron:not(.tree-chevron-hidden)') as HTMLElement;
    chevron.click();
    // Wait for async children fetch
    await vi.waitFor(() => {
      const children = tree.getDomNode().querySelectorAll('[data-tree-depth="1"]');
      expect(children.length).toBe(2);
    });
  });

  it('collapses an expanded node on second click', async () => {
    const chevron = tree.getDomNode().querySelector('.tree-chevron:not(.tree-chevron-hidden)') as HTMLElement;
    chevron.click();
    await vi.waitFor(() => {
      expect(tree.getDomNode().querySelectorAll('[data-tree-depth="1"]').length).toBe(2);
    });
    // After re-render, get the chevron again
    const chevronAfter = tree.getDomNode().querySelector('.tree-chevron:not(.tree-chevron-hidden)') as HTMLElement;
    chevronAfter.click();
    await vi.waitFor(() => {
      expect(tree.getDomNode().querySelectorAll('[data-tree-depth="1"]').length).toBe(0);
    });
  });

  it('fires onDidSelect when a row is clicked', () => {
    const selected: TestNode[] = [];
    tree.onDidSelect(node => selected.push(node));
    const row = tree.getDomNode().querySelector('.tree-row') as HTMLElement;
    row.click();
    expect(selected.length).toBe(1);
    expect(selected[0].id).toBe('a');
  });

  it('fires onContextMenu on right-click', () => {
    const events: Array<{ element: TestNode }> = [];
    tree.onContextMenu(e => events.push(e));
    const row = tree.getDomNode().querySelector('.tree-row') as HTMLElement;
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    expect(events.length).toBe(1);
  });

  it('applies filter to hide nodes', async () => {
    tree.setFilter((node: TestNode) => node.id !== 'b');
    await tree.refresh();
    const nodes = tree.getDomNode().querySelectorAll('[data-tree-depth="0"]');
    expect(nodes.length).toBe(1);
  });

  it('applies sorter to reorder nodes', async () => {
    tree.setSorter((a: TestNode, b: TestNode) => b.label.localeCompare(a.label));
    await tree.refresh();
    const spans = tree.getDomNode().querySelectorAll('[data-tree-depth="0"] span[data-id]');
    expect(spans[0].getAttribute('data-id')).toBe('b');
  });

  describe('keyboard navigation', () => {
    it('moves focus down with ArrowDown', () => {
      const firstRow = tree.getDomNode().querySelector('.tree-row') as HTMLElement;
      firstRow.focus();
      firstRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      const focused = tree.getDomNode().querySelector('.tree-row:focus');
      expect(focused?.querySelector('[data-id="b"]')).toBeTruthy();
    });

    it('moves focus up with ArrowUp', () => {
      const rows = tree.getDomNode().querySelectorAll('.tree-row');
      const secondRow = rows[1] as HTMLElement;
      secondRow.focus();
      secondRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      const focused = tree.getDomNode().querySelector('.tree-row:focus');
      expect(focused?.querySelector('[data-id="a"]')).toBeTruthy();
    });

    it('expands node with ArrowRight', async () => {
      const firstRow = tree.getDomNode().querySelector('.tree-row') as HTMLElement;
      firstRow.focus();
      firstRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await vi.waitFor(() => {
        expect(tree.getDomNode().querySelectorAll('[data-tree-depth="1"]').length).toBe(2);
      });
    });

    it('collapses node with ArrowLeft', async () => {
      // First expand
      const firstRow = tree.getDomNode().querySelector('.tree-row') as HTMLElement;
      firstRow.focus();
      firstRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await vi.waitFor(() => {
        expect(tree.getDomNode().querySelectorAll('[data-tree-depth="1"]').length).toBe(2);
      });
      // Then collapse — get fresh reference after re-render
      const firstRowAfter = tree.getDomNode().querySelector('.tree-row') as HTMLElement;
      firstRowAfter.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await vi.waitFor(() => {
        expect(tree.getDomNode().querySelectorAll('[data-tree-depth="1"]').length).toBe(0);
      });
    });

    it('selects node with Enter', () => {
      const selected: TestNode[] = [];
      tree.onDidSelect(node => selected.push(node));
      const firstRow = tree.getDomNode().querySelector('.tree-row') as HTMLElement;
      firstRow.focus();
      firstRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(selected.length).toBe(1);
    });
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/ui/src/browser/__tests__/treeWidget.test.ts`
Expected: FAIL (module not found)

- [x] **Step 3: Implement TreeWidget**

Create `packages/ui/src/browser/treeWidget.ts`:

```typescript
import { Disposable, Emitter, DisposableStore } from '@gho-work/base';
import type { Event, IDisposable } from '@gho-work/base';
import { h } from './dom.js';

export interface ITreeDataSource<T> {
  getRoots(): Promise<T[]>;
  hasChildren(element: T): boolean;
  getChildren(element: T): Promise<T[]>;
}

export interface ITreeRenderer<T> {
  renderNode(element: T, depth: number, container: HTMLElement): IDisposable;
  updateNode?(element: T, container: HTMLElement): void;
}

export interface ITreeOptions<T> {
  dataSource: ITreeDataSource<T>;
  renderer: ITreeRenderer<T>;
  filter?: (element: T) => boolean;
  sorter?: (a: T, b: T) => number;
}

interface TreeNode<T> {
  element: T;
  depth: number;
  expanded: boolean;
  children: TreeNode<T>[] | null; // null = not yet loaded
  row: HTMLElement | null;
  disposables: DisposableStore;
}

export class TreeWidget<T> extends Disposable {
  private readonly _container: HTMLElement;
  private readonly _dataSource: ITreeDataSource<T>;
  private readonly _renderer: ITreeRenderer<T>;
  private _filter: ((element: T) => boolean) | undefined;
  private _sorter: ((a: T, b: T) => number) | undefined;
  private _roots: TreeNode<T>[] = [];

  private readonly _onDidSelect = this._register(new Emitter<T>());
  readonly onDidSelect: Event<T> = this._onDidSelect.event;

  private readonly _onDidToggle = this._register(new Emitter<{ element: T; expanded: boolean }>());
  readonly onDidToggle: Event<{ element: T; expanded: boolean }> = this._onDidToggle.event;

  private readonly _onContextMenu = this._register(new Emitter<{ element: T; event: MouseEvent }>());
  readonly onContextMenu: Event<{ element: T; event: MouseEvent }> = this._onContextMenu.event;

  constructor(options: ITreeOptions<T>) {
    super();
    this._dataSource = options.dataSource;
    this._renderer = options.renderer;
    this._filter = options.filter;
    this._sorter = options.sorter;

    const { root } = h('div.tree-widget', []);
    this._container = root;
    this._container.setAttribute('role', 'tree');
  }

  getDomNode(): HTMLElement {
    return this._container;
  }

  setFilter(filter: ((element: T) => boolean) | undefined): void {
    this._filter = filter;
  }

  setSorter(sorter: ((a: T, b: T) => number) | undefined): void {
    this._sorter = sorter;
  }

  async refresh(element?: T): Promise<void> {
    if (element) {
      const node = this._findNode(this._roots, element);
      if (node) {
        node.children = null;
        if (node.expanded) {
          await this._expandNode(node);
        }
      }
      return;
    }
    // Full refresh
    this._clearAll();
    const roots = await this._dataSource.getRoots();
    this._roots = this._toNodes(roots, 0);
    this._renderNodes(this._roots, this._container);
  }

  private _toNodes(elements: T[], depth: number): TreeNode<T>[] {
    let filtered = this._filter ? elements.filter(this._filter) : elements;
    if (this._sorter) {
      filtered = [...filtered].sort(this._sorter);
    }
    return filtered.map(element => ({
      element,
      depth,
      expanded: false,
      children: null,
      row: null,
      disposables: new DisposableStore(),
    }));
  }

  private _renderNodes(nodes: TreeNode<T>[], container: HTMLElement): void {
    for (const node of nodes) {
      this._renderRow(node, container);
    }
  }

  private _renderRow(node: TreeNode<T>, container: HTMLElement): void {
    const hasChildren = this._dataSource.hasChildren(node.element);

    const row = document.createElement('div');
    row.classList.add('tree-row');
    row.setAttribute('role', 'treeitem');
    row.setAttribute('tabindex', '0');
    row.setAttribute('data-tree-depth', String(node.depth));
    row.style.paddingLeft = `${node.depth * 16}px`;

    // Chevron
    const chevron = document.createElement('span');
    chevron.classList.add('tree-chevron');
    if (!hasChildren) {
      chevron.classList.add('tree-chevron-hidden');
    } else {
      chevron.textContent = node.expanded ? '\u25BC' : '\u25B6';
      chevron.addEventListener('click', (e) => {
        e.stopPropagation();
        void this._toggleNode(node);
      });
    }
    row.appendChild(chevron);

    // Content area for renderer
    const content = document.createElement('span');
    content.classList.add('tree-content');
    const renderDisposable = this._renderer.renderNode(node.element, node.depth, content);
    node.disposables.add(renderDisposable);
    row.appendChild(content);

    // Row click -> select
    row.addEventListener('click', () => {
      this._onDidSelect.fire(node.element);
    });

    // Right-click -> context menu
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this._onContextMenu.fire({ element: node.element, event: e });
    });

    // Keyboard navigation
    row.addEventListener('keydown', (e) => this._handleKeyDown(e, node));

    node.row = row;
    container.appendChild(row);

    // Children (only if expanded)
    if (node.expanded && node.children) {
      this._renderNodes(node.children, container);
    }
  }

  private async _toggleNode(node: TreeNode<T>): Promise<void> {
    if (node.expanded) {
      this._collapseNode(node);
    } else {
      await this._expandNode(node);
    }
  }

  private async _expandNode(node: TreeNode<T>): Promise<void> {
    if (!this._dataSource.hasChildren(node.element)) { return; }

    if (!node.children) {
      const children = await this._dataSource.getChildren(node.element);
      node.children = this._toNodes(children, node.depth + 1);
    }

    node.expanded = true;
    this._onDidToggle.fire({ element: node.element, expanded: true });
    this._rerender();
  }

  private _collapseNode(node: TreeNode<T>): void {
    node.expanded = false;
    this._onDidToggle.fire({ element: node.element, expanded: false });
    this._rerender();
  }

  private _rerender(): void {
    this._disposeRows(this._roots);
    while (this._container.firstChild) {
      this._container.removeChild(this._container.firstChild);
    }
    this._renderNodes(this._roots, this._container);
  }

  private _handleKeyDown(e: KeyboardEvent, node: TreeNode<T>): void {
    const rows = Array.from(this._container.querySelectorAll('.tree-row')) as HTMLElement[];
    const currentIndex = rows.indexOf(node.row!);

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        if (currentIndex < rows.length - 1) {
          rows[currentIndex + 1].focus();
        }
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        if (currentIndex > 0) {
          rows[currentIndex - 1].focus();
        }
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        if (this._dataSource.hasChildren(node.element) && !node.expanded) {
          void this._expandNode(node);
        } else if (node.expanded && node.children?.length) {
          // Move focus to first child
          const nextRow = rows[currentIndex + 1];
          if (nextRow) { nextRow.focus(); }
        }
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        if (node.expanded) {
          this._collapseNode(node);
        } else if (node.depth > 0) {
          // Move to parent
          const parentRow = this._findParentRow(node);
          if (parentRow) { parentRow.focus(); }
        }
        break;
      }
      case 'Enter': {
        e.preventDefault();
        this._onDidSelect.fire(node.element);
        break;
      }
      case ' ': {
        e.preventDefault();
        if (this._dataSource.hasChildren(node.element)) {
          void this._toggleNode(node);
        }
        break;
      }
    }
  }

  private _findParentRow(node: TreeNode<T>): HTMLElement | null {
    const rows = Array.from(this._container.querySelectorAll('.tree-row')) as HTMLElement[];
    const currentIndex = rows.indexOf(node.row!);
    for (let i = currentIndex - 1; i >= 0; i--) {
      const depth = Number(rows[i].getAttribute('data-tree-depth'));
      if (depth < node.depth) {
        return rows[i];
      }
    }
    return null;
  }

  private _findNode(nodes: TreeNode<T>[], element: T): TreeNode<T> | null {
    for (const node of nodes) {
      if (node.element === element) { return node; }
      if (node.children) {
        const found = this._findNode(node.children, element);
        if (found) { return found; }
      }
    }
    return null;
  }

  private _disposeRows(nodes: TreeNode<T>[]): void {
    for (const node of nodes) {
      node.disposables.clear();
      node.row = null;
      if (node.children) {
        this._disposeRows(node.children);
      }
    }
  }

  private _clearAll(): void {
    this._disposeRows(this._roots);
    while (this._container.firstChild) {
      this._container.removeChild(this._container.firstChild);
    }
    this._roots = [];
  }

  override dispose(): void {
    this._clearAll();
    super.dispose();
  }
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/ui/src/browser/__tests__/treeWidget.test.ts`
Expected: All tests pass

- [x] **Step 5: Verify build**

Run: `npx turbo build --filter=@gho-work/ui`
Expected: Clean build

- [x] **Step 6: Commit**

```bash
git add packages/ui/src/browser/treeWidget.ts packages/ui/src/browser/__tests__/treeWidget.test.ts
git commit -m "feat: add reusable TreeWidget with lazy loading and keyboard navigation"
```

---

## Chunk 3: File Icons & Context Menu

### Task 5: Implement file icon mapping

**Files:**
- Create: `packages/ui/src/browser/fileIcons.ts`
- Test: `packages/ui/src/browser/__tests__/fileIcons.test.ts`

- [x] **Step 1: Write failing tests**

Create `packages/ui/src/browser/__tests__/fileIcons.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getFileIcon, createFileIconSVG, getFolderIconSVG } from '../fileIcons.js';

describe('getFileIcon', () => {
  it('returns correct icon for known extensions', () => {
    expect(getFileIcon('report.md')).toEqual({ icon: 'markdown', color: '#6b9ff4' });
    expect(getFileIcon('data.xlsx')).toEqual({ icon: 'excel', color: '#0f9d58' });
    expect(getFileIcon('photo.png')).toEqual({ icon: 'image', color: '#c678dd' });
  });

  it('returns default icon for unknown extensions', () => {
    expect(getFileIcon('mystery.xyz')).toEqual({ icon: 'file', color: '#888' });
  });

  it('handles files with no extension', () => {
    expect(getFileIcon('Makefile')).toEqual({ icon: 'file', color: '#888' });
  });

  it('is case-insensitive for extensions', () => {
    expect(getFileIcon('README.MD')).toEqual({ icon: 'markdown', color: '#6b9ff4' });
  });
});

describe('createFileIconSVG', () => {
  it('returns an SVG element', () => {
    const svg = createFileIconSVG('test.ts');
    expect(svg.tagName.toLowerCase()).toBe('svg');
  });
});

describe('getFolderIconSVG', () => {
  it('returns an SVG element with folder color', () => {
    const svg = getFolderIconSVG(false);
    expect(svg.tagName.toLowerCase()).toBe('svg');
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/ui/src/browser/__tests__/fileIcons.test.ts`
Expected: FAIL

- [x] **Step 3: Implement file icons**

Create `packages/ui/src/browser/fileIcons.ts`:

```typescript
interface FileIconInfo {
  icon: string;
  color: string;
}

const FILE_ICON_MAP: Record<string, FileIconInfo> = {
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
  // Code
  ts:    { icon: 'code',     color: '#3178c6' },
  js:    { icon: 'code',     color: '#f1e05a' },
  py:    { icon: 'code',     color: '#3572a5' },
  // Data
  json:  { icon: 'json',     color: '#febc2e' },
  yaml:  { icon: 'yaml',     color: '#febc2e' },
  yml:   { icon: 'yaml',     color: '#febc2e' },
  xml:   { icon: 'xml',      color: '#febc2e' },
  // Archives
  zip:   { icon: 'archive',  color: '#888' },
  tar:   { icon: 'archive',  color: '#888' },
  gz:    { icon: 'archive',  color: '#888' },
};

const DEFAULT_ICON: FileIconInfo = { icon: 'file', color: '#888' };
const FOLDER_COLOR = '#febc2e';

export function getFileIcon(filename: string): FileIconInfo {
  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : '';
  return FILE_ICON_MAP[ext] ?? DEFAULT_ICON;
}

function createSVG(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  return svg;
}

function makePath(d: string): SVGPathElement {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  return path;
}

function makePolyline(points: string): SVGPolylineElement {
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  poly.setAttribute('points', points);
  return poly;
}

export function createFileIconSVG(filename: string): SVGSVGElement {
  const { color } = getFileIcon(filename);
  const svg = createSVG();
  svg.style.color = color;
  // Generic file icon (Feather: file)
  svg.appendChild(makePath('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'));
  svg.appendChild(makePolyline('14,2 14,8 20,8'));
  return svg;
}

export function getFolderIconSVG(expanded: boolean): SVGSVGElement {
  const svg = createSVG();
  svg.style.color = FOLDER_COLOR;
  if (expanded) {
    // Open folder
    svg.appendChild(makePath('M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'));
  } else {
    // Closed folder
    svg.appendChild(makePath('M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'));
  }
  return svg;
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/ui/src/browser/__tests__/fileIcons.test.ts`
Expected: All pass

- [x] **Step 5: Commit**

```bash
git add packages/ui/src/browser/fileIcons.ts packages/ui/src/browser/__tests__/fileIcons.test.ts
git commit -m "feat: add file icon mapping with SVG generators"
```

---

### Task 6: Implement ContextMenu widget

**Files:**
- Create: `packages/ui/src/browser/contextMenu.ts`
- Test: `packages/ui/src/browser/__tests__/contextMenu.test.ts`

- [x] **Step 1: Write failing tests**

Create `packages/ui/src/browser/__tests__/contextMenu.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ContextMenu, type ContextMenuItem } from '../contextMenu.js';

describe('ContextMenu', () => {
  afterEach(() => {
    document.body.textContent = '';
  });

  it('renders menu items', () => {
    const items: ContextMenuItem[] = [
      { label: 'Attach', action: vi.fn() },
      { label: 'Rename', action: vi.fn() },
      { separator: true },
      { label: 'Delete', action: vi.fn() },
    ];
    const menu = ContextMenu.show(items, 100, 200);
    const menuItems = document.querySelectorAll('.context-menu-item');
    expect(menuItems.length).toBe(3); // excludes separator
    const separators = document.querySelectorAll('.context-menu-separator');
    expect(separators.length).toBe(1);
    menu.dispose();
  });

  it('calls action and closes on item click', () => {
    const action = vi.fn();
    const menu = ContextMenu.show([{ label: 'Do Thing', action }], 0, 0);
    const item = document.querySelector('.context-menu-item') as HTMLElement;
    item.click();
    expect(action).toHaveBeenCalledOnce();
    // Menu should be removed from DOM
    expect(document.querySelector('.context-menu')).toBeNull();
    menu.dispose();
  });

  it('closes on Escape key', () => {
    const menu = ContextMenu.show([{ label: 'Item', action: vi.fn() }], 0, 0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.context-menu')).toBeNull();
    menu.dispose();
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/ui/src/browser/__tests__/contextMenu.test.ts`
Expected: FAIL

- [x] **Step 3: Implement ContextMenu**

Create `packages/ui/src/browser/contextMenu.ts`:

```typescript
import { Disposable, DisposableStore } from '@gho-work/base';

export interface ContextMenuItem {
  label?: string;
  action?: () => void;
  separator?: boolean;
}

export class ContextMenu extends Disposable {
  private readonly _element: HTMLElement;
  private readonly _disposables = this._register(new DisposableStore());

  private constructor(items: ContextMenuItem[], x: number, y: number) {
    super();

    this._element = document.createElement('div');
    this._element.classList.add('context-menu');
    this._element.style.position = 'fixed';
    this._element.style.left = `${x}px`;
    this._element.style.top = `${y}px`;
    this._element.setAttribute('role', 'menu');

    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.classList.add('context-menu-separator');
        this._element.appendChild(sep);
        continue;
      }

      const el = document.createElement('div');
      el.classList.add('context-menu-item');
      el.setAttribute('role', 'menuitem');
      el.setAttribute('tabindex', '0');
      el.textContent = item.label ?? '';
      el.addEventListener('click', () => {
        item.action?.();
        this._close();
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          item.action?.();
          this._close();
        }
      });
      this._element.appendChild(el);
    }

    document.body.appendChild(this._element);

    // Close on outside click
    const onOutsideClick = (e: MouseEvent) => {
      if (!this._element.contains(e.target as Node)) {
        this._close();
      }
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this._close();
      }
    };

    // Listen immediately for Escape, defer click to avoid catching trigger
    document.addEventListener('keydown', onEscape);
    this._disposables.add({ dispose: () => document.removeEventListener('keydown', onEscape) });

    requestAnimationFrame(() => {
      document.addEventListener('click', onOutsideClick);
      this._disposables.add({ dispose: () => document.removeEventListener('click', onOutsideClick) });
    });
  }

  private _close(): void {
    this._element.remove();
    this._disposables.clear();
  }

  static show(items: ContextMenuItem[], x: number, y: number): ContextMenu {
    return new ContextMenu(items, x, y);
  }

  override dispose(): void {
    this._close();
    super.dispose();
  }
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/ui/src/browser/__tests__/contextMenu.test.ts`
Expected: All pass

- [x] **Step 5: Commit**

```bash
git add packages/ui/src/browser/contextMenu.ts packages/ui/src/browser/__tests__/contextMenu.test.ts
git commit -m "feat: add lightweight ContextMenu widget"
```

---

## Chunk 4: DocumentsPanel

### Task 7: Implement DocumentsPanel

**Files:**
- Create: `packages/ui/src/browser/documentsPanel.ts`
- Test: `packages/ui/src/browser/__tests__/documentsPanel.test.ts`

- [x] **Step 1: Write failing tests**

Create `packages/ui/src/browser/__tests__/documentsPanel.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DocumentsPanel } from '../documentsPanel.js';

function createMockIPC() {
  return {
    invoke: vi.fn().mockImplementation(async (channel: string) => {
      if (channel === 'workspace:get-root') { return { path: '/test/workspace' }; }
      if (channel === 'files:stat') {
        return { name: 'workspace', path: '/test/workspace', type: 'directory', size: 0, mtime: Date.now(), isHidden: false };
      }
      if (channel === 'files:read-dir') {
        return [
          { name: 'readme.md', path: '/test/workspace/readme.md', type: 'file', size: 1024, mtime: Date.now(), isHidden: false },
          { name: 'src', path: '/test/workspace/src', type: 'directory', size: 0, mtime: Date.now(), isHidden: false },
          { name: '.git', path: '/test/workspace/.git', type: 'directory', size: 0, mtime: Date.now(), isHidden: true },
        ];
      }
      if (channel === 'files:watch') { return { watchId: 'w1' }; }
      return {};
    }),
    on: vi.fn().mockReturnValue({ dispose: () => {} }),
    removeListener: vi.fn(),
  };
}

describe('DocumentsPanel', () => {
  let panel: DocumentsPanel;
  let ipc: ReturnType<typeof createMockIPC>;

  beforeEach(async () => {
    ipc = createMockIPC();
    panel = new DocumentsPanel('/test/workspace', ipc);
    document.body.appendChild(panel.getDomNode());
    await panel.load();
  });

  afterEach(() => {
    panel.dispose();
    document.body.textContent = '';
  });

  it('renders header with title and action buttons', () => {
    const header = panel.getDomNode().querySelector('.documents-header');
    expect(header).toBeTruthy();
    expect(header!.textContent).toContain('DOCUMENTS');
    const buttons = header!.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });

  it('renders file tree with entries', () => {
    const rows = panel.getDomNode().querySelectorAll('.tree-row');
    // Should show readme.md and src (not .git — hidden by default)
    expect(rows.length).toBe(2);
  });

  it('hides dotfiles by default', () => {
    const allText = panel.getDomNode().textContent;
    expect(allText).not.toContain('.git');
  });

  it('shows dotfiles when toggle hidden is clicked', async () => {
    const toggleBtn = panel.getDomNode().querySelector('[aria-label="Toggle hidden files"]') as HTMLElement;
    toggleBtn.click();
    await vi.waitFor(() => {
      const allText = panel.getDomNode().textContent;
      expect(allText).toContain('.git');
    });
  });

  it('fires onDidRequestAttach when attach button is clicked', () => {
    const attached: unknown[] = [];
    panel.onDidRequestAttach(file => attached.push(file));
    const attachBtn = panel.getDomNode().querySelector('.tree-attach-btn') as HTMLElement;
    attachBtn?.click();
    expect(attached.length).toBe(1);
  });

  it('filters tree when filter input changes', async () => {
    const input = panel.getDomNode().querySelector('.documents-filter-input') as HTMLInputElement;
    input.value = 'readme';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => {
      const rows = panel.getDomNode().querySelectorAll('.tree-row');
      expect(rows.length).toBe(1);
    });
  });

  it('refreshes tree when refresh button is clicked', () => {
    const callCountBefore = ipc.invoke.mock.calls.length;
    const refreshBtn = panel.getDomNode().querySelector('[aria-label="Refresh"]') as HTMLElement;
    refreshBtn.click();
    expect(ipc.invoke.mock.calls.length).toBeGreaterThan(callCountBefore);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/ui/src/browser/__tests__/documentsPanel.test.ts`
Expected: FAIL

- [x] **Step 3: Implement DocumentsPanel**

Create `packages/ui/src/browser/documentsPanel.ts`. Key structure (~250-300 lines):

```typescript
import { Disposable, Emitter } from '@gho-work/base';
import type { Event, IDisposable } from '@gho-work/base';
import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import type { FileEntry } from '@gho-work/platform/common';
import { h } from './dom.js';
import { TreeWidget, type ITreeDataSource, type ITreeRenderer } from './treeWidget.js';
import { createFileIconSVG, getFolderIconSVG } from './fileIcons.js';
import { ContextMenu } from './contextMenu.js';

const DEFAULT_HIDDEN_PATTERNS = [
  /^\./,
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

class FileTreeDataSource implements ITreeDataSource<FileEntry> {
  constructor(
    private readonly _workspacePath: string,
    private readonly _ipc: IIPCRenderer,
  ) {}

  async getRoots(): Promise<FileEntry[]> {
    return this._ipc.invoke(IPC_CHANNELS.FILES_READ_DIR, { path: this._workspacePath });
  }

  hasChildren(entry: FileEntry): boolean {
    return entry.type === 'directory';
  }

  async getChildren(entry: FileEntry): Promise<FileEntry[]> {
    return this._ipc.invoke(IPC_CHANNELS.FILES_READ_DIR, { path: entry.path });
  }
}

class FileTreeRenderer implements ITreeRenderer<FileEntry> {
  private readonly _onAttach: (entry: FileEntry) => void;

  constructor(onAttach: (entry: FileEntry) => void) {
    this._onAttach = onAttach;
  }

  renderNode(entry: FileEntry, _depth: number, container: HTMLElement): IDisposable {
    const icon = entry.type === 'directory'
      ? getFolderIconSVG(false)
      : createFileIconSVG(entry.name);
    icon.classList.add('tree-icon');
    container.appendChild(icon);

    const nameSpan = document.createElement('span');
    nameSpan.classList.add('tree-name');
    nameSpan.textContent = entry.name;
    container.appendChild(nameSpan);

    if (entry.type === 'file') {
      const attachBtn = document.createElement('button');
      attachBtn.classList.add('tree-attach-btn');
      attachBtn.textContent = '\uD83D\uDCCE'; // paperclip emoji
      attachBtn.title = 'Attach to message';
      attachBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._onAttach(entry);
      });
      container.appendChild(attachBtn);
    }

    return { dispose: () => {} };
  }
}

export class DocumentsPanel extends Disposable {
  private readonly _root: HTMLElement;
  private readonly _tree: TreeWidget<FileEntry>;
  private _showHidden = false;
  private _filterText = '';
  private _sortBy: 'name' | 'modified' = 'name';
  private _watcherDisposable: IDisposable | null = null;

  private readonly _onDidRequestAttach = this._register(new Emitter<FileEntry>());
  readonly onDidRequestAttach: Event<FileEntry> = this._onDidRequestAttach.event;

  constructor(
    private readonly _workspacePath: string,
    private readonly _ipc: IIPCRenderer,
  ) {
    super();

    const dataSource = new FileTreeDataSource(_workspacePath, _ipc);
    const renderer = new FileTreeRenderer((entry) => this._onDidRequestAttach.fire(entry));

    this._tree = this._register(new TreeWidget<FileEntry>({
      dataSource,
      renderer,
      filter: (entry) => this._applyFilter(entry),
      sorter: (a, b) => this._applySorter(a, b),
    }));

    this._tree.onContextMenu(({ element, event }) => {
      this._showContextMenu(element, event);
    });

    const layout = h('div.documents-panel', [
      h('div.documents-header@header'),
      h('div.documents-filter@filter'),
      h('div.documents-tree@tree'),
      h('div.documents-footer@footer'),
    ]);
    this._root = layout.root;

    this._buildHeader(layout.header);
    this._buildFilter(layout.filter);
    layout.tree.appendChild(this._tree.getDomNode());
    this._buildFooter(layout.footer);
  }

  getDomNode(): HTMLElement {
    return this._root;
  }

  async load(): Promise<void> {
    await this._tree.refresh();
    this._startWatching();
  }

  private _buildHeader(container: HTMLElement): void {
    const title = document.createElement('span');
    title.classList.add('documents-title');
    title.textContent = 'DOCUMENTS';
    container.appendChild(title);

    const actions = document.createElement('div');
    actions.classList.add('documents-actions');

    const newFileBtn = document.createElement('button');
    newFileBtn.textContent = '+';
    newFileBtn.title = 'New file';
    newFileBtn.setAttribute('aria-label', 'New file');
    newFileBtn.addEventListener('click', () => this._createNewFile());
    actions.appendChild(newFileBtn);

    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = '\uD83D\uDC41\u200D\uD83D\uDDE8'; // eye speech bubble
    toggleBtn.title = 'Toggle hidden files';
    toggleBtn.setAttribute('aria-label', 'Toggle hidden files');
    toggleBtn.addEventListener('click', () => {
      this._showHidden = !this._showHidden;
      toggleBtn.textContent = this._showHidden ? '\uD83D\uDC41' : '\uD83D\uDC41\u200D\uD83D\uDDE8';
      void this._tree.refresh();
    });
    actions.appendChild(toggleBtn);

    const sortBtn = document.createElement('button');
    sortBtn.textContent = 'A\u2193';
    sortBtn.title = 'Sort by';
    sortBtn.setAttribute('aria-label', 'Sort by');
    sortBtn.addEventListener('click', () => {
      this._sortBy = this._sortBy === 'name' ? 'modified' : 'name';
      sortBtn.textContent = this._sortBy === 'name' ? 'A\u2193' : '\uD83D\uDD50';
      void this._tree.refresh();
    });
    actions.appendChild(sortBtn);

    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = '\u21BB';
    refreshBtn.title = 'Refresh';
    refreshBtn.setAttribute('aria-label', 'Refresh');
    refreshBtn.addEventListener('click', () => void this._tree.refresh());
    actions.appendChild(refreshBtn);

    container.appendChild(actions);
  }

  private _buildFilter(container: HTMLElement): void {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Filter files...';
    input.classList.add('documents-filter-input');
    input.addEventListener('input', () => {
      this._filterText = input.value.toLowerCase();
      void this._tree.refresh();
    });
    container.appendChild(input);
  }

  private _buildFooter(container: HTMLElement): void {
    const summary = document.createElement('span');
    summary.classList.add('documents-summary');
    summary.textContent = this._workspacePath;
    container.appendChild(summary);
  }

  private _applyFilter(entry: FileEntry): boolean {
    if (!this._showHidden && DEFAULT_HIDDEN_PATTERNS.some(p => p.test(entry.name))) {
      return false;
    }
    if (this._filterText && !entry.name.toLowerCase().includes(this._filterText)) {
      if (entry.type === 'directory') { return true; }
      return false;
    }
    return true;
  }

  private _applySorter(a: FileEntry, b: FileEntry): number {
    if (a.type === 'directory' && b.type !== 'directory') { return -1; }
    if (a.type !== 'directory' && b.type === 'directory') { return 1; }
    if (this._sortBy === 'modified') {
      return b.mtime - a.mtime;
    }
    return a.name.localeCompare(b.name);
  }

  private _showContextMenu(entry: FileEntry, event: MouseEvent): void {
    const items = [
      ...(entry.type === 'file' ? [{ label: 'Attach to Message', action: () => this._onDidRequestAttach.fire(entry) }] : []),
      { label: 'Rename', action: () => this._renameEntry(entry) },
      { label: 'Delete', action: () => this._deleteEntry(entry) },
      { separator: true as const },
      { label: 'Copy Path', action: () => void navigator.clipboard.writeText(entry.path) },
    ];
    ContextMenu.show(items, event.clientX, event.clientY);
  }

  private async _createNewFile(): Promise<void> {
    const name = window.prompt('New file name:');
    if (!name) { return; }
    const isDir = name.endsWith('/');
    const cleanName = isDir ? name.slice(0, -1) : name;
    const fullPath = `${this._workspacePath}/${cleanName}`;
    await this._ipc.invoke(IPC_CHANNELS.FILES_CREATE, {
      path: fullPath,
      type: isDir ? 'directory' : 'file',
    });
    await this._tree.refresh();
  }

  private async _renameEntry(entry: FileEntry): Promise<void> {
    const newName = window.prompt('New name:', entry.name);
    if (!newName || newName === entry.name) { return; }
    const dir = entry.path.substring(0, entry.path.lastIndexOf('/'));
    await this._ipc.invoke(IPC_CHANNELS.FILES_RENAME, {
      oldPath: entry.path,
      newPath: `${dir}/${newName}`,
    });
    await this._tree.refresh();
  }

  private async _deleteEntry(entry: FileEntry): Promise<void> {
    const confirmed = window.confirm(`Delete "${entry.name}"?`);
    if (!confirmed) { return; }
    await this._ipc.invoke(IPC_CHANNELS.FILES_DELETE, { path: entry.path });
    await this._tree.refresh();
  }

  private async _startWatching(): Promise<void> {
    try {
      const result = await this._ipc.invoke<{ watchId: string }>(IPC_CHANNELS.FILES_WATCH, { path: this._workspacePath });
      const watchId = result.watchId;
      const listener = this._ipc.on(IPC_CHANNELS.FILES_CHANGED, () => {
        void this._tree.refresh();
      });
      this._watcherDisposable = {
        dispose: () => {
          listener.dispose();
          void this._ipc.invoke(IPC_CHANNELS.FILES_UNWATCH, { watchId }).catch((err: unknown) => {
            console.warn('[DocumentsPanel] Failed to unwatch:', err);
          });
        },
      };
      this._register(this._watcherDisposable);
    } catch (err) {
      console.warn('[DocumentsPanel] Failed to start file watcher:', err);
    }
  }

  override dispose(): void {
    this._watcherDisposable?.dispose();
    super.dispose();
  }
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/ui/src/browser/__tests__/documentsPanel.test.ts`
Expected: All pass

- [x] **Step 5: Verify build**

Run: `npx turbo build --filter=@gho-work/ui`
Expected: Clean build

- [x] **Step 6: Commit**

```bash
git add packages/ui/src/browser/documentsPanel.ts packages/ui/src/browser/__tests__/documentsPanel.test.ts
git commit -m "feat: implement DocumentsPanel with file tree, filtering, and context menu"
```

---

## Chunk 5: Chat Attachments & Wiring

### Task 8: Add public attachment API to ChatPanel

**Files:**
- Modify: `packages/ui/src/browser/chatPanel.ts`
- Test: `packages/ui/src/browser/__tests__/chatPanel.test.ts` (add tests)

- [x] **Step 1: Write failing tests for new attachment methods**

Add to the existing chatPanel test file (or create if none exists). Read `chatPanel.ts` first to understand constructor signature and existing attachment internals:

```typescript
describe('ChatPanel attachment public API', () => {
  let chatPanel: ChatPanel;
  let ipc: ReturnType<typeof createMockIPC>;

  beforeEach(() => {
    ipc = createMockIPC();
    chatPanel = new ChatPanel(ipc);
    document.body.appendChild(chatPanel.getDomNode());
  });

  afterEach(() => {
    chatPanel.dispose();
    document.body.textContent = '';
  });

  it('addAttachment adds a chip to the attachment list', () => {
    const entry = { name: 'test.md', path: '/test/test.md', type: 'file' as const, size: 100, mtime: Date.now(), isHidden: false };
    chatPanel.addAttachment(entry);
    const chips = chatPanel.getDomNode().querySelectorAll('.attachment-chip');
    expect(chips.length).toBe(1);
    expect(chips[0].textContent).toContain('test.md');
  });

  it('addAttachment deduplicates by path', () => {
    const entry = { name: 'test.md', path: '/test/test.md', type: 'file' as const, size: 100, mtime: Date.now(), isHidden: false };
    chatPanel.addAttachment(entry);
    chatPanel.addAttachment(entry);
    const chips = chatPanel.getDomNode().querySelectorAll('.attachment-chip');
    expect(chips.length).toBe(1);
  });

  it('removeAttachment removes the chip', () => {
    const entry = { name: 'test.md', path: '/test/test.md', type: 'file' as const, size: 100, mtime: Date.now(), isHidden: false };
    chatPanel.addAttachment(entry);
    chatPanel.removeAttachment('/test/test.md');
    const chips = chatPanel.getDomNode().querySelectorAll('.attachment-chip');
    expect(chips.length).toBe(0);
  });

  it('fires onDidChangeAttachments when attachments change', () => {
    const events: unknown[] = [];
    chatPanel.onDidChangeAttachments(list => events.push(list));
    const entry = { name: 'test.md', path: '/test/test.md', type: 'file' as const, size: 100, mtime: Date.now(), isHidden: false };
    chatPanel.addAttachment(entry);
    expect(events.length).toBe(1);
  });
});
```

**Note:** Read `chatPanel.ts` first to understand the constructor signature and mock IPC setup needed. Adapt the mock to match the actual constructor.

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/ui/src/browser/__tests__/chatPanel.test.ts`
Expected: FAIL (methods not defined)

- [x] **Step 3: Add public attachment methods to ChatPanel**

In `packages/ui/src/browser/chatPanel.ts`, add:

```typescript
// Import FileEntry and FileAttachment types
import type { FileEntry, FileAttachment } from '@gho-work/platform/common';

// New event emitter (add near other emitters)
private readonly _onDidChangeAttachments = this._register(new Emitter<FileAttachment[]>());
readonly onDidChangeAttachments: Event<FileAttachment[]> = this._onDidChangeAttachments.event;

// Public methods
addAttachment(entry: FileEntry): void {
  if (this._attachments.some(a => a.path === entry.path)) { return; }
  this._attachments.push({ type: 'file', path: entry.path, displayName: entry.name });
  this._renderAttachments();
  this._fireAttachmentChange();
}

removeAttachment(path: string): void {
  this._attachments = this._attachments.filter(a => a.path !== path);
  this._renderAttachments();
  this._fireAttachmentChange();
}

private _fireAttachmentChange(): void {
  this._onDidChangeAttachments.fire(
    this._attachments.map(a => ({ name: a.displayName, path: a.path, size: 0 }))
  );
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/ui/src/browser/__tests__/chatPanel.test.ts`
Expected: All pass

- [x] **Step 5: Commit**

```bash
git add packages/ui/src/browser/chatPanel.ts packages/ui/src/browser/__tests__/chatPanel.test.ts
git commit -m "feat: add public attachment API to ChatPanel for Documents panel"
```

---

### Task 9: Wire DocumentsPanel into Workbench

**Files:**
- Modify: `packages/ui/src/browser/workbench.ts`
- Modify: `packages/ui/src/index.ts`

- [x] **Step 1: Add DocumentsPanel to workbench**

In `packages/ui/src/browser/workbench.ts`, find the `render()` method where panels are created. Add:

```typescript
import { DocumentsPanel } from './documentsPanel.js';

// Inside render(), after existing panel setup:
// Fetch workspace root
const workspaceResult = await ipc.invoke<{ path: string | null }>(IPC_CHANNELS.WORKSPACE_GET_ROOT, {});
const workspacePath = workspaceResult.path ?? '';

// Create documents panel
if (workspacePath) {
  const documentsPanel = this._register(new DocumentsPanel(workspacePath, ipc));
  this.sidebar.addPanel('documents', documentsPanel.getDomNode());

  // Wire attach event to chat
  documentsPanel.onDidRequestAttach(file => {
    chatPanel.addAttachment(file);
  });

  // Load documents panel data lazily (on first activation)
  let documentsLoaded = false;
  activityBar.onDidSelectItem(item => {
    if (item === 'documents' && !documentsLoaded) {
      documentsLoaded = true;
      void documentsPanel.load();
    }
  });
}
```

- [x] **Step 2: Export DocumentsPanel from packages/ui**

Add to `packages/ui/src/index.ts`:

```typescript
export { DocumentsPanel } from './browser/documentsPanel.js';
```

- [x] **Step 3: Verify build**

Run: `npx turbo build`
Expected: Clean build

- [x] **Step 4: Commit**

```bash
git add packages/ui/src/browser/workbench.ts packages/ui/src/index.ts
git commit -m "feat: wire DocumentsPanel into workbench with lazy loading and attach events"
```

---

## Chunk 6: Main Process Handlers & Preload

### Task 10: Register file IPC handlers in main process

**Files:**
- Modify: `packages/electron/src/main/mainProcess.ts`

- [x] **Step 1: Add workspace:get-root handler**

In `packages/electron/src/main/mainProcess.ts`, add:

```typescript
ipcMainAdapter.handle(IPC_CHANNELS.WORKSPACE_GET_ROOT, async () => {
  return { path: process.cwd() };
});
```

- [x] **Step 2: Add files:* IPC handlers with path traversal prevention**

```typescript
import { resolve } from 'node:path';

function validatePath(targetPath: string, workspaceRoot: string): void {
  const resolved = resolve(targetPath);
  if (!resolved.startsWith(resolve(workspaceRoot))) {
    throw new Error('Path traversal detected: path is outside workspace');
  }
}

const workspaceRoot = process.cwd();

ipcMainAdapter.handle(IPC_CHANNELS.FILES_READ_DIR, async (...args: unknown[]) => {
  const { path: dirPath } = args[0] as { path: string };
  validatePath(dirPath, workspaceRoot);
  return fileService.readDirWithStats(dirPath);
});

ipcMainAdapter.handle(IPC_CHANNELS.FILES_STAT, async (...args: unknown[]) => {
  const { path: filePath } = args[0] as { path: string };
  validatePath(filePath, workspaceRoot);
  return fileService.stat(filePath);
});

ipcMainAdapter.handle(IPC_CHANNELS.FILES_CREATE, async (...args: unknown[]) => {
  const { path: filePath, type, content } = args[0] as { path: string; type: 'file' | 'directory'; content?: string };
  validatePath(filePath, workspaceRoot);
  if (type === 'directory') {
    await fileService.createDir(filePath);
  } else {
    await fileService.createFile(filePath, content);
  }
});

ipcMainAdapter.handle(IPC_CHANNELS.FILES_RENAME, async (...args: unknown[]) => {
  const { oldPath, newPath } = args[0] as { oldPath: string; newPath: string };
  validatePath(oldPath, workspaceRoot);
  validatePath(newPath, workspaceRoot);
  await fileService.rename(oldPath, newPath);
});

ipcMainAdapter.handle(IPC_CHANNELS.FILES_DELETE, async (...args: unknown[]) => {
  const { path: filePath } = args[0] as { path: string };
  validatePath(filePath, workspaceRoot);
  await fileService.delete(filePath);
});

const watchers = new Map<string, { dispose: () => void }>();
let nextWatchId = 0;

ipcMainAdapter.handle(IPC_CHANNELS.FILES_WATCH, async (...args: unknown[]) => {
  const { path: dirPath } = args[0] as { path: string };
  validatePath(dirPath, workspaceRoot);
  const watchId = String(nextWatchId++);
  const watcher = await fileService.watch(dirPath);
  const listener = fileService.onDidChangeFile((event) => {
    ipcMainAdapter.sendToRenderer(IPC_CHANNELS.FILES_CHANGED, event);
  });
  watchers.set(watchId, {
    dispose: () => {
      watcher.dispose();
      listener.dispose();
    },
  });
  return { watchId };
});

ipcMainAdapter.handle(IPC_CHANNELS.FILES_UNWATCH, async (...args: unknown[]) => {
  const { watchId } = args[0] as { watchId: string };
  const watcher = watchers.get(watchId);
  if (watcher) {
    watcher.dispose();
    watchers.delete(watchId);
  }
});
```

- [x] **Step 3: Verify build**

Run: `npx turbo build --filter=@gho-work/electron`
Expected: Clean build

- [x] **Step 4: Commit**

```bash
git add packages/electron/src/main/mainProcess.ts
git commit -m "feat: register file IPC handlers with path traversal prevention"
```

---

### Task 11: Update preload whitelist

**Files:**
- Modify: `apps/desktop/src/preload/index.ts`

- [x] **Step 1: Add file channels to invoke whitelist**

In `apps/desktop/src/preload/index.ts`, add to `ALLOWED_INVOKE_CHANNELS`:

```typescript
  IPC_CHANNELS.FILES_READ_DIR,
  IPC_CHANNELS.FILES_STAT,
  IPC_CHANNELS.FILES_CREATE,
  IPC_CHANNELS.FILES_RENAME,
  IPC_CHANNELS.FILES_DELETE,
  IPC_CHANNELS.FILES_WATCH,
  IPC_CHANNELS.FILES_UNWATCH,
  IPC_CHANNELS.WORKSPACE_GET_ROOT,
```

- [x] **Step 2: Add file changed channel to listen whitelist**

Add to `ALLOWED_LISTEN_CHANNELS`:

```typescript
  IPC_CHANNELS.FILES_CHANGED,
```

- [x] **Step 3: Verify build**

Run: `npx turbo build`
Expected: Clean build

- [x] **Step 4: Commit**

```bash
git add apps/desktop/src/preload/index.ts
git commit -m "feat: add file IPC channels to preload whitelist"
```

---

## Chunk 7: CSS & E2E Tests

### Task 12: Add Documents panel CSS

**Files:**
- Create: `apps/desktop/src/renderer/documents.css`
- Modify: `apps/desktop/src/renderer/main.ts`

- [x] **Step 1: Create documents.css**

Create `apps/desktop/src/renderer/documents.css` with styles for documents panel, tree widget, and context menu. All colors use CSS custom properties from the theme system. Follow patterns from `settings.css`. See spec section 4-5 and the CSS block in this task's code for the full content:

```css
/* Documents panel layout */
.documents-panel { display: flex; flex-direction: column; height: 100%; }

.documents-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-primary);
}
.documents-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.documents-actions { display: flex; gap: 4px; }
.documents-actions button {
  background: transparent;
  border: none;
  color: var(--fg-muted);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
}
.documents-actions button:hover { background: var(--bg-hover); color: var(--fg-primary); }

.documents-filter { padding: 4px 12px; }
.documents-filter-input {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  padding: 4px 8px;
  color: var(--fg-primary);
  font-size: var(--font-size-sm);
  font-family: var(--font-family);
}
.documents-filter-input::placeholder { color: var(--fg-muted); }
.documents-filter-input:focus { outline: 1px solid var(--brand-primary); border-color: var(--brand-primary); }

.documents-tree { flex: 1; overflow-y: auto; }

.documents-footer {
  padding: 4px 12px;
  font-size: var(--font-size-sm);
  color: var(--fg-muted);
  border-top: 1px solid var(--border-primary);
}
.documents-summary { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Tree widget */
.tree-widget { outline: none; }
.tree-row {
  display: flex;
  align-items: center;
  padding: 2px 8px;
  cursor: pointer;
  white-space: nowrap;
}
.tree-row:hover { background: var(--bg-hover); }
.tree-row:focus { outline: 1px solid var(--brand-primary); outline-offset: -1px; }
.tree-row:focus-visible { outline: 1px solid var(--brand-primary); outline-offset: -1px; }

.tree-chevron {
  width: 16px;
  flex-shrink: 0;
  text-align: center;
  font-size: 10px;
  color: var(--fg-muted);
  cursor: pointer;
  user-select: none;
}
.tree-chevron-hidden { visibility: hidden; }

.tree-content {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}
.tree-icon { flex-shrink: 0; width: 16px; height: 16px; }
.tree-name {
  font-size: var(--font-size-sm);
  color: var(--fg-primary);
  overflow: hidden;
  text-overflow: ellipsis;
}

.tree-attach-btn {
  opacity: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 12px;
  padding: 0 4px;
  margin-left: auto;
  flex-shrink: 0;
}
.tree-row:hover .tree-attach-btn { opacity: 1; }

/* Context menu */
.context-menu {
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  min-width: 160px;
  padding: 4px 0;
  z-index: 1000;
}
.context-menu-item {
  padding: 6px 12px;
  font-size: var(--font-size-sm);
  color: var(--fg-primary);
  cursor: pointer;
}
.context-menu-item:hover { background: var(--bg-hover); }
.context-menu-item:focus { background: var(--bg-hover); outline: none; }
.context-menu-separator {
  height: 1px;
  background: var(--border-primary);
  margin: 4px 0;
}
```

- [x] **Step 2: Import documents.css in renderer entry**

In `apps/desktop/src/renderer/main.ts`, add:

```typescript
import './documents.css';
```

- [x] **Step 3: Verify build**

Run: `npx turbo build`
Expected: Clean build

- [x] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/documents.css apps/desktop/src/renderer/main.ts
git commit -m "feat: add CSS for Documents panel, tree widget, and context menu"
```

---

### Task 13: Add E2E tests

**Files:**
- Create: `tests/e2e/documents.spec.ts`

- [x] **Step 1: Create E2E test**

Create `tests/e2e/documents.spec.ts` following patterns from `tests/e2e/settings.spec.ts`. The test must create a temp workspace directory with test files, launch the app with `cwd` set to that workspace, and exercise the Documents panel:

```typescript
import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { resolve } from 'path';
import { writeFileSync, mkdirSync, rmSync } from 'fs';

const appPath = resolve(__dirname, '../../apps/desktop');
const userDataDir = resolve(__dirname, '../../.e2e-userdata-documents');
const workspaceDir = resolve(__dirname, '../../.e2e-workspace-documents');

// Set up user data and workspace
mkdirSync(userDataDir, { recursive: true });
writeFileSync(resolve(userDataDir, 'onboarding-complete.json'), '{"complete":true}');
mkdirSync(resolve(workspaceDir, 'src'), { recursive: true });
writeFileSync(resolve(workspaceDir, 'readme.md'), '# Test');
writeFileSync(resolve(workspaceDir, 'data.csv'), 'a,b,c');
writeFileSync(resolve(workspaceDir, 'src/index.ts'), 'console.log("hello")');
writeFileSync(resolve(workspaceDir, '.hidden'), 'secret');

let electronApp: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [resolve(appPath, 'out/main/index.js')],
    cwd: workspaceDir,
    env: { ...process.env, GHO_USER_DATA_DIR: userDataDir },
  });
  page = await electronApp.firstWindow();
  await expect(page.locator('.workbench-activity-bar')).toBeVisible({ timeout: 10000 });
});

test.afterAll(async () => {
  await electronApp.close();
  rmSync(workspaceDir, { recursive: true, force: true });
});

async function openDocuments(): Promise<void> {
  const btn = page.locator('[aria-label="Documents"]');
  await btn.click();
  await expect(page.locator('.documents-panel')).toBeVisible({ timeout: 5000 });
}

test.describe('Documents panel', () => {
  test('clicking Documents icon shows the documents panel', async () => {
    await openDocuments();
    await expect(page.locator('.documents-header')).toBeVisible();
    await expect(page.locator('.documents-header')).toContainText('DOCUMENTS');
  });

  test('file tree shows workspace files (hidden excluded)', async () => {
    await openDocuments();
    await expect(page.locator('.tree-row')).toHaveCount(3, { timeout: 5000 });
    const allText = await page.locator('.documents-tree').textContent();
    expect(allText).not.toContain('.hidden');
  });

  test('toggle hidden shows dotfiles', async () => {
    await openDocuments();
    await page.locator('[aria-label="Toggle hidden files"]').click();
    await expect(page.locator('.tree-name', { hasText: '.hidden' })).toBeVisible({ timeout: 3000 });
    // Toggle back
    await page.locator('[aria-label="Toggle hidden files"]').click();
  });

  test('filter input narrows visible files', async () => {
    await openDocuments();
    await page.locator('.documents-filter-input').fill('readme');
    await expect(page.locator('.tree-row')).toHaveCount(1, { timeout: 3000 });
    await page.locator('.documents-filter-input').fill('');
  });

  test('expanding a folder shows children', async () => {
    await openDocuments();
    const srcRow = page.locator('.tree-row', { hasText: 'src' });
    await srcRow.locator('.tree-chevron').click();
    await expect(page.locator('.tree-name', { hasText: 'index.ts' })).toBeVisible({ timeout: 3000 });
  });

  test('clicking chat icon returns to chat view', async () => {
    await openDocuments();
    await page.locator('[aria-label="Chat"]').click();
    await expect(page.locator('.chat-input')).toBeVisible({ timeout: 5000 });
  });
});
```

- [x] **Step 2: Run E2E tests**

Run: `npx playwright test tests/e2e/documents.spec.ts`
Expected: All tests pass

- [x] **Step 3: Commit**

```bash
git add tests/e2e/documents.spec.ts
git commit -m "test: add Playwright E2E tests for Documents panel"
```

---

## Chunk 8: Verification (HARD GATE)

### Task 14: Launch app and verify complete flow

- [x] **Step 1: Build the app**

Run: `npx turbo build`

- [x] **Step 2: Launch the app**

Run: `npm run desktop:dev`

- [x] **Step 3: Verify the complete flow**

Exercise every user-facing feature:
1. Click Documents icon in activity bar -> panel appears with file tree
2. Verify files are listed (not hidden files)
3. Click toggle hidden -> dotfiles appear
4. Type in filter input -> tree narrows
5. Expand a folder -> children appear
6. Click attach button on a file -> chip appears in chat input
7. Right-click a file -> context menu appears with actions
8. Click Chat -> returns to chat, documents panel hidden
9. Re-open Documents -> panel state preserved

- [x] **Step 4: Self-verify with Playwright screenshot script**

Write a temp script using `_electron.launch()` + `page.screenshot()` to capture each checkpoint. View screenshots with the Read tool. Clean up the temp script after.

- [x] **Step 5: Run full test suite**

Run: `npx turbo lint && npx turbo build && npx vitest run && npx playwright test`
Expected: All pass

- [x] **Step 6: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address verification findings from Documents panel HARD GATE"
```
