import { Disposable, Emitter } from '@gho-work/base';
import type { Event, IDisposable } from '@gho-work/base';
import type { FileEntry } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import { TreeWidget, type ITreeDataSource, type ITreeRenderer } from './treeWidget.js';
import { createFileIconSVG, getFolderIconSVG } from './fileIcons.js';
import { ContextMenu } from './contextMenu.js';

interface IIPC {
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>;
  on(channel: string, callback: (...args: unknown[]) => void): IDisposable;
}

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

function isHiddenByDefault(entry: FileEntry): boolean {
  return DEFAULT_HIDDEN_PATTERNS.some(pattern => pattern.test(entry.name));
}

class FileTreeDataSource implements ITreeDataSource<FileEntry> {
  constructor(
    private readonly _workspacePath: string,
    private readonly _ipc: IIPC,
  ) {}

  async getRoots(): Promise<FileEntry[]> {
    return this._ipc.invoke<FileEntry[]>(IPC_CHANNELS.FILES_READ_DIR, { path: this._workspacePath });
  }

  hasChildren(entry: FileEntry): boolean {
    return entry.type === 'directory';
  }

  async getChildren(entry: FileEntry): Promise<FileEntry[]> {
    return this._ipc.invoke<FileEntry[]>(IPC_CHANNELS.FILES_READ_DIR, { path: entry.path });
  }
}

class FileTreeRenderer implements ITreeRenderer<FileEntry> {
  constructor(private readonly _onAttach: (entry: FileEntry) => void) {}

  renderNode(entry: FileEntry, _depth: number, container: HTMLElement): IDisposable {
    // Icon
    const icon = entry.type === 'directory'
      ? getFolderIconSVG(false)
      : createFileIconSVG(entry.name);
    icon.classList.add('tree-icon');
    container.appendChild(icon);

    // Name
    const nameSpan = document.createElement('span');
    nameSpan.classList.add('tree-label');
    nameSpan.textContent = entry.name;
    container.appendChild(nameSpan);

    // Attach button (files only)
    if (entry.type === 'file') {
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
    }

    return { dispose: () => {} };
  }
}

export class DocumentsPanel extends Disposable {
  private readonly _container: HTMLElement;
  private readonly _treeContainer: HTMLElement;
  private readonly _tree: TreeWidget<FileEntry>;
  private readonly _dataSource: FileTreeDataSource;
  private _showHidden = false;
  private _filterText = '';
  private _watchDisposable: IDisposable | null = null;

  private readonly _onDidRequestAttachEmitter = this._register(new Emitter<FileEntry>());
  readonly onDidRequestAttach: Event<FileEntry> = this._onDidRequestAttachEmitter.event;

  constructor(
    private readonly _workspacePath: string,
    private readonly _ipc: IIPC,
  ) {
    super();

    this._container = document.createElement('div');
    this._container.classList.add('documents-panel');

    // Header
    const header = this._buildHeader();
    this._container.appendChild(header);

    // Filter input
    const filterRow = this._buildFilterInput();
    this._container.appendChild(filterRow);

    // Tree container
    this._treeContainer = document.createElement('div');
    this._treeContainer.classList.add('documents-tree');
    this._container.appendChild(this._treeContainer);

    // Footer
    const footer = this._buildFooter();
    this._container.appendChild(footer);

    // Data source and renderer
    this._dataSource = new FileTreeDataSource(_workspacePath, _ipc);
    const renderer = new FileTreeRenderer((entry) => {
      this._onDidRequestAttachEmitter.fire(entry);
    });

    this._tree = this._register(new TreeWidget<FileEntry>({
      dataSource: this._dataSource,
      renderer,
      filter: (entry) => this._applyFilter(entry),
      sorter: (a, b) => this._sortEntries(a, b),
    }));

    this._treeContainer.appendChild(this._tree.getDomNode());

    // Context menu
    this._register(this._tree.onContextMenu(({ element, event }) => {
      this._showContextMenu(element, event);
    }));
  }

  getDomNode(): HTMLElement {
    return this._container;
  }

  async load(): Promise<void> {
    await this._tree.refresh();
    this._startWatching();
  }

  private _buildHeader(): HTMLElement {
    const header = document.createElement('div');
    header.classList.add('documents-header');

    const title = document.createElement('span');
    title.classList.add('documents-title');
    title.textContent = 'DOCUMENTS';
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.classList.add('documents-actions');

    // New file button
    const newFileBtn = document.createElement('button');
    newFileBtn.setAttribute('aria-label', 'New file');
    newFileBtn.setAttribute('title', 'New file');
    newFileBtn.textContent = '+';
    newFileBtn.addEventListener('click', () => {
      void this._handleNewFile();
    });
    actions.appendChild(newFileBtn);

    // Toggle hidden button
    const toggleHiddenBtn = document.createElement('button');
    toggleHiddenBtn.setAttribute('aria-label', 'Toggle hidden files');
    toggleHiddenBtn.setAttribute('title', 'Toggle hidden files');
    toggleHiddenBtn.textContent = 'H';
    toggleHiddenBtn.addEventListener('click', () => {
      this._showHidden = !this._showHidden;
      this._tree.setFilter((entry) => this._applyFilter(entry));
      void this._tree.refresh();
    });
    actions.appendChild(toggleHiddenBtn);

    // Sort button
    const sortBtn = document.createElement('button');
    sortBtn.setAttribute('aria-label', 'Sort');
    sortBtn.setAttribute('title', 'Sort');
    sortBtn.textContent = 'A\u2193';
    actions.appendChild(sortBtn);

    // Refresh button
    const refreshBtn = document.createElement('button');
    refreshBtn.setAttribute('aria-label', 'Refresh');
    refreshBtn.setAttribute('title', 'Refresh');
    refreshBtn.textContent = '\u21BB';
    refreshBtn.addEventListener('click', () => {
      void this._tree.refresh();
    });
    actions.appendChild(refreshBtn);

    header.appendChild(actions);
    return header;
  }

  private _buildFilterInput(): HTMLElement {
    const filterRow = document.createElement('div');
    filterRow.classList.add('documents-filter');

    const input = document.createElement('input');
    input.type = 'text';
    input.classList.add('documents-filter-input');
    input.setAttribute('placeholder', 'Filter files...');
    input.setAttribute('aria-label', 'Filter files');
    input.addEventListener('input', () => {
      this._filterText = input.value;
      this._tree.setFilter((entry) => this._applyFilter(entry));
      void this._tree.refresh();
    });
    filterRow.appendChild(input);

    return filterRow;
  }

  private _buildFooter(): HTMLElement {
    const footer = document.createElement('div');
    footer.classList.add('documents-footer');

    const pathSpan = document.createElement('span');
    pathSpan.classList.add('documents-workspace-path');
    pathSpan.textContent = this._workspacePath;
    pathSpan.setAttribute('title', this._workspacePath);
    footer.appendChild(pathSpan);

    return footer;
  }

  private _applyFilter(entry: FileEntry): boolean {
    // Hidden files filter
    if (!this._showHidden && isHiddenByDefault(entry)) {
      return false;
    }

    // Text filter — all entries (including directories) must match when filter is active
    if (this._filterText) {
      return entry.name.toLowerCase().includes(this._filterText.toLowerCase());
    }

    return true;
  }

  private _sortEntries(a: FileEntry, b: FileEntry): number {
    // Directories first
    if (a.type === 'directory' && b.type !== 'directory') { return -1; }
    if (a.type !== 'directory' && b.type === 'directory') { return 1; }
    // Then alphabetical
    return a.name.localeCompare(b.name);
  }

  private _startWatching(): void {
    void this._ipc.invoke<{ watchId: string }>(IPC_CHANNELS.FILES_WATCH, { path: this._workspacePath }).then((result) => {
      const watchId = result.watchId;
      const disposable = this._ipc.on(IPC_CHANNELS.FILES_CHANGED, () => {
        void this._tree.refresh();
      });
      this._watchDisposable = {
        dispose: () => {
          disposable.dispose();
          void this._ipc.invoke(IPC_CHANNELS.FILES_UNWATCH, { watchId });
        },
      };
    }).catch((err) => {
      console.warn('[DocumentsPanel] Failed to start file watching:', err);
    });
  }

  private async _handleNewFile(): Promise<void> {
    const name = window.prompt('New file name:');
    if (!name) { return; }
    const filePath = `${this._workspacePath}/${name}`;
    try {
      await this._ipc.invoke(IPC_CHANNELS.FILES_CREATE, { path: filePath, type: 'file' });
      await this._tree.refresh();
    } catch (err) {
      console.error('[DocumentsPanel] Failed to create file:', err);
    }
  }

  private _showContextMenu(entry: FileEntry, event: MouseEvent): void {
    ContextMenu.show([
      {
        label: 'Attach to chat',
        action: () => { this._onDidRequestAttachEmitter.fire(entry); },
      },
      { separator: true },
      {
        label: 'Rename',
        action: () => { void this._handleRename(entry); },
      },
      {
        label: 'Delete',
        action: () => { void this._handleDelete(entry); },
      },
      { separator: true },
      {
        label: 'Copy Path',
        action: () => { void navigator.clipboard.writeText(entry.path); },
      },
    ], event.clientX, event.clientY);
  }

  private async _handleRename(entry: FileEntry): Promise<void> {
    const newName = window.prompt('New name:', entry.name);
    if (!newName || newName === entry.name) { return; }
    const parent = entry.path.substring(0, entry.path.lastIndexOf('/'));
    const newPath = `${parent}/${newName}`;
    try {
      await this._ipc.invoke(IPC_CHANNELS.FILES_RENAME, { oldPath: entry.path, newPath });
      await this._tree.refresh();
    } catch (err) {
      console.error('[DocumentsPanel] Failed to rename:', err);
    }
  }

  private async _handleDelete(entry: FileEntry): Promise<void> {
    const confirmed = window.confirm(`Delete ${entry.name}?`);
    if (!confirmed) { return; }
    try {
      await this._ipc.invoke(IPC_CHANNELS.FILES_DELETE, { path: entry.path });
      await this._tree.refresh();
    } catch (err) {
      console.error('[DocumentsPanel] Failed to delete:', err);
    }
  }

  override dispose(): void {
    this._watchDisposable?.dispose();
    super.dispose();
  }
}
