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

const SVG_NS = 'http://www.w3.org/2000/svg';

function createSVGButton(paths: string[], size = 16): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  const STROKE_ATTRS: Record<string, string> = { stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    for (const [k, v] of Object.entries(STROKE_ATTRS)) { path.setAttribute(k, v); }
    svg.appendChild(path);
  }
  return svg;
}

function createEyeIcon(): SVGElement {
  const svg = createSVGButton(['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z']);
  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '3');
  circle.setAttribute('stroke', 'currentColor');
  circle.setAttribute('stroke-width', '2');
  svg.appendChild(circle);
  return svg;
}

function createEyeOffIcon(): SVGElement {
  return createSVGButton([
    'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94',
    'M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19',
    'M14.12 14.12a3 3 0 1 1-4.24-4.24',
    'M1 1l22 22',
  ]);
}

function createRefreshIcon(): SVGElement {
  const svg = createSVGButton(['M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15']);
  const STROKE_ATTRS: Record<string, string> = { stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' };
  for (const points of ['23,4 23,10 17,10', '1,20 1,14 7,14']) {
    const poly = document.createElementNS(SVG_NS, 'polyline');
    poly.setAttribute('points', points);
    for (const [k, v] of Object.entries(STROKE_ATTRS)) { poly.setAttribute(k, v); }
    svg.appendChild(poly);
  }
  return svg;
}

function createSortIcon(): SVGElement {
  return createSVGButton(['M12 5v14', 'M19 12l-7 7-7-7']);
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
    nameSpan.classList.add('tree-name');
    nameSpan.textContent = entry.name;
    nameSpan.setAttribute('title', entry.name);
    container.appendChild(nameSpan);

    // Attach button (files and folders)
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

    return { dispose: () => {} };
  }
}

export class FilesPanel extends Disposable {
  private readonly _container: HTMLElement;
  private readonly _treeContainer: HTMLElement;
  private readonly _tree: TreeWidget<FileEntry>;
  private readonly _dataSource: FileTreeDataSource;
  private _showHidden = false;
  private _filterText = '';
  private _watchDisposable: IDisposable | null = null;
  private _refreshTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly _onDidRequestAttachEmitter = this._register(new Emitter<FileEntry>());
  readonly onDidRequestAttach: Event<FileEntry> = this._onDidRequestAttachEmitter.event;

  constructor(
    private readonly _workspacePath: string,
    private readonly _ipc: IIPC,
  ) {
    super();

    this._container = document.createElement('div');
    this._container.classList.add('files-panel');

    // Header
    const header = this._buildHeader();
    this._container.appendChild(header);

    // Filter input
    const filterRow = this._buildFilterInput();
    this._container.appendChild(filterRow);

    // Tree container
    this._treeContainer = document.createElement('div');
    this._treeContainer.classList.add('files-tree');
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
      getKey: (entry) => entry.path,
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
  }

  private _buildHeader(): HTMLElement {
    const header = document.createElement('div');
    header.classList.add('files-header');

    const title = document.createElement('span');
    title.classList.add('files-title');
    title.textContent = 'FILES';
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.classList.add('files-actions');

    // Toggle hidden button
    const toggleHiddenBtn = document.createElement('button');
    toggleHiddenBtn.setAttribute('aria-label', 'Toggle hidden files');
    toggleHiddenBtn.setAttribute('title', 'Toggle hidden files');
    toggleHiddenBtn.appendChild(this._showHidden ? createEyeIcon() : createEyeOffIcon());
    toggleHiddenBtn.addEventListener('click', () => {
      this._showHidden = !this._showHidden;
      while (toggleHiddenBtn.firstChild) { toggleHiddenBtn.removeChild(toggleHiddenBtn.firstChild); }
      toggleHiddenBtn.appendChild(this._showHidden ? createEyeIcon() : createEyeOffIcon());
      this._tree.setFilter((entry) => this._applyFilter(entry));
      void this._tree.refresh();
    });
    actions.appendChild(toggleHiddenBtn);

    // Sort button
    const sortBtn = document.createElement('button');
    sortBtn.setAttribute('aria-label', 'Sort');
    sortBtn.setAttribute('title', 'Sort');
    sortBtn.appendChild(createSortIcon());
    actions.appendChild(sortBtn);

    // Refresh button
    const refreshBtn = document.createElement('button');
    refreshBtn.setAttribute('aria-label', 'Refresh');
    refreshBtn.setAttribute('title', 'Refresh');
    refreshBtn.appendChild(createRefreshIcon());
    refreshBtn.addEventListener('click', () => {
      void this._tree.refresh();
    });
    actions.appendChild(refreshBtn);

    header.appendChild(actions);
    return header;
  }

  private _buildFilterInput(): HTMLElement {
    const filterRow = document.createElement('div');
    filterRow.classList.add('files-filter');

    const input = document.createElement('input');
    input.type = 'text';
    input.classList.add('files-filter-input');
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
    footer.classList.add('files-footer');

    const pathSpan = document.createElement('span');
    pathSpan.classList.add('files-workspace-path');
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
        if (this._refreshTimer) { clearTimeout(this._refreshTimer); }
        this._refreshTimer = setTimeout(() => {
          this._refreshTimer = null;
          void this._tree.refresh();
        }, 1000);
      });
      this._watchDisposable = {
        dispose: () => {
          disposable.dispose();
          void this._ipc.invoke(IPC_CHANNELS.FILES_UNWATCH, { watchId });
        },
      };
    }).catch((err) => {
      console.warn('[FilesPanel] Failed to start file watching:', err);
    });
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
      console.error('[FilesPanel] Failed to rename:', err);
    }
  }

  private async _handleDelete(entry: FileEntry): Promise<void> {
    const confirmed = window.confirm(`Delete ${entry.name}?`);
    if (!confirmed) { return; }
    try {
      await this._ipc.invoke(IPC_CHANNELS.FILES_DELETE, { path: entry.path });
      await this._tree.refresh();
    } catch (err) {
      console.error('[FilesPanel] Failed to delete:', err);
    }
  }

  override dispose(): void {
    if (this._refreshTimer) { clearTimeout(this._refreshTimer); }
    this._watchDisposable?.dispose();
    super.dispose();
  }
}
