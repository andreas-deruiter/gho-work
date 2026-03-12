import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolListSectionWidget } from './toolListSection.js';

const TOOLS_A = [
  { name: 'echo', description: 'Echo a message', enabled: true },
  { name: 'add', description: 'Add two numbers', enabled: false },
];
const TOOLS_B = [
  { name: 'search', description: 'Search files', enabled: true },
];

describe('ToolListSectionWidget', () => {
  beforeEach(() => { document.body.textContent = ''; });

  it('renders tools grouped by connector', () => {
    const w = new ToolListSectionWidget();
    document.body.appendChild(w.getDomNode());
    w.setTools([
      { connectorId: 'c1', connectorName: 'A', tools: TOOLS_A },
      { connectorId: 'c2', connectorName: 'B', tools: TOOLS_B },
    ]);
    expect(w.getDomNode().querySelectorAll('.tool-group').length).toBe(2);
    expect(w.getDomNode().querySelectorAll('input[type="checkbox"]').length).toBe(3);
    w.dispose();
  });

  it('checkbox state matches enabled', () => {
    const w = new ToolListSectionWidget();
    document.body.appendChild(w.getDomNode());
    w.setTools([{ connectorId: 'c1', connectorName: 'A', tools: TOOLS_A }]);
    const cbs = w.getDomNode().querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
    expect(cbs[0].checked).toBe(true);
    expect(cbs[1].checked).toBe(false);
    w.dispose();
  });

  it('fires onDidToggleTool on checkbox change', () => {
    const w = new ToolListSectionWidget();
    document.body.appendChild(w.getDomNode());
    w.setTools([{ connectorId: 'c1', connectorName: 'A', tools: TOOLS_A }]);
    const fn = vi.fn();
    w.onDidToggleTool(fn);
    (w.getDomNode().querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    expect(fn).toHaveBeenCalledWith({ connectorId: 'c1', toolName: 'echo', enabled: false });
    w.dispose();
  });

  it('filters by search text', () => {
    const w = new ToolListSectionWidget();
    document.body.appendChild(w.getDomNode());
    w.setTools([{ connectorId: 'c1', connectorName: 'A', tools: TOOLS_A }]);
    const input = w.getDomNode().querySelector('.tool-search-input') as HTMLInputElement;
    input.value = 'echo';
    input.dispatchEvent(new Event('input'));
    const visible = w.getDomNode().querySelectorAll('.tool-row:not([style*="display: none"])');
    expect(visible.length).toBe(1);
    w.dispose();
  });

  it('focuses connector group, collapses others', () => {
    const w = new ToolListSectionWidget();
    document.body.appendChild(w.getDomNode());
    w.setTools([
      { connectorId: 'c1', connectorName: 'A', tools: TOOLS_A },
      { connectorId: 'c2', connectorName: 'B', tools: TOOLS_B },
    ], 'c1');
    const groups = w.getDomNode().querySelectorAll('.tool-group');
    expect(groups[0].querySelector('.tool-group-body')?.getAttribute('style')).not.toContain('display: none');
    expect(groups[1].querySelector('.tool-group-body')?.getAttribute('style')).toContain('display: none');
    w.dispose();
  });

  it('shows empty state when no tools', () => {
    const w = new ToolListSectionWidget();
    document.body.appendChild(w.getDomNode());
    w.setTools([]);
    expect(w.getDomNode().textContent).toContain('No tools available');
    w.dispose();
  });
});
