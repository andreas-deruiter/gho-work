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
    expect(chevron?.classList.contains('tree-chevron-hidden')).toBe(true);
  });

  it('expands a node on click and shows children', async () => {
    const chevron = tree.getDomNode().querySelector('.tree-chevron:not(.tree-chevron-hidden)') as HTMLElement;
    chevron.click();
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
    // Sort ascending by label: "File B" < "Folder A", so "File B" (id=b) comes first
    tree.setSorter((a: TestNode, b: TestNode) => a.label.localeCompare(b.label));
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
      const firstRow = tree.getDomNode().querySelector('.tree-row') as HTMLElement;
      firstRow.focus();
      firstRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await vi.waitFor(() => {
        expect(tree.getDomNode().querySelectorAll('[data-tree-depth="1"]').length).toBe(2);
      });
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
