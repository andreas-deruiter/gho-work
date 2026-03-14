import { Disposable, Emitter, DisposableStore } from '@gho-work/base';
import type { Event, IDisposable } from '@gho-work/base';

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
  getKey?: (element: T) => string;
}

interface TreeNode<T> {
  element: T;
  depth: number;
  expanded: boolean;
  children: TreeNode<T>[] | null;
  row: HTMLElement | null;
  disposables: DisposableStore;
  error: boolean;
}

export class TreeWidget<T> extends Disposable {
  private readonly _container: HTMLElement;
  private readonly _dataSource: ITreeDataSource<T>;
  private readonly _renderer: ITreeRenderer<T>;
  private readonly _getKey: ((element: T) => string) | undefined;
  private _filter: ((element: T) => boolean) | undefined;
  private _sorter: ((a: T, b: T) => number) | undefined;
  private _roots: TreeNode<T>[] = [];
  private _refreshSeq = 0;

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
    this._getKey = options.getKey;
    this._filter = options.filter;
    this._sorter = options.sorter;

    this._container = document.createElement('div');
    this._container.classList.add('tree-widget');
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
    const expandedKeys = this._getKey ? this._collectExpandedKeys(this._roots) : new Set<string>();
    this._clearAll();
    const seq = ++this._refreshSeq;
    const roots = await this._dataSource.getRoots();
    if (seq !== this._refreshSeq) { return; }
    this._roots = this._toNodes(roots, 0);
    if (expandedKeys.size > 0) {
      await this._restoreExpanded(this._roots, expandedKeys);
    }
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
      error: false,
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

    // Row click -> toggle if has children, otherwise select
    row.addEventListener('click', () => {
      if (this._dataSource.hasChildren(node.element)) {
        void this._toggleNode(node);
      } else {
        this._onDidSelect.fire(node.element);
      }
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
      if (node.error) {
        const errorRow = document.createElement('div');
        errorRow.classList.add('tree-row', 'tree-error-row');
        errorRow.style.paddingLeft = `${(node.depth + 1) * 16}px`;
        errorRow.textContent = '(access denied)';
        container.appendChild(errorRow);
      } else {
        this._renderNodes(node.children, container);
      }
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
      try {
        const children = await this._dataSource.getChildren(node.element);
        node.children = this._toNodes(children, node.depth + 1);
      } catch (err) {
        console.warn('[TreeWidget] Failed to fetch children:', err);
        node.children = [];
        node.error = true;
      }
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

  private _collectExpandedKeys(nodes: TreeNode<T>[]): Set<string> {
    const keys = new Set<string>();
    for (const node of nodes) {
      if (node.expanded && this._getKey) {
        keys.add(this._getKey(node.element));
      }
      if (node.children) {
        for (const key of this._collectExpandedKeys(node.children)) {
          keys.add(key);
        }
      }
    }
    return keys;
  }

  private async _restoreExpanded(nodes: TreeNode<T>[], keys: Set<string>): Promise<void> {
    for (const node of nodes) {
      if (this._getKey && keys.has(this._getKey(node.element)) && this._dataSource.hasChildren(node.element)) {
        try {
          const children = await this._dataSource.getChildren(node.element);
          node.children = this._toNodes(children, node.depth + 1);
          node.expanded = true;
          await this._restoreExpanded(node.children, keys);
        } catch (err) {
          console.warn('[TreeWidget] Failed to restore expanded node:', err);
          node.children = [];
          node.expanded = true;
          node.error = true;
        }
      }
    }
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
