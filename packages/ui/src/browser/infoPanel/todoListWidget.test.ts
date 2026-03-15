import { describe, it, expect } from 'vitest';
import { TodoListWidget } from './todoListWidget.js';

describe('TodoListWidget', () => {
  it('is hidden when no todos', () => {
    const widget = new TodoListWidget();
    expect(widget.getDomNode().style.display).toBe('none');
  });

  it('becomes visible after setTodos', () => {
    const widget = new TodoListWidget();
    widget.setTodos([
      { id: 1, title: 'Step one', status: 'not-started' },
    ]);
    expect(widget.getDomNode().style.display).toBe('');
  });

  it('renders correct number of items', () => {
    const widget = new TodoListWidget();
    widget.setTodos([
      { id: 1, title: 'A', status: 'completed' },
      { id: 2, title: 'B', status: 'in-progress' },
      { id: 3, title: 'C', status: 'not-started' },
    ]);
    const items = widget.getDomNode().querySelectorAll('.info-todo-item');
    expect(items.length).toBe(3);
  });

  it('shows correct header counter', () => {
    const widget = new TodoListWidget();
    widget.setTodos([
      { id: 1, title: 'A', status: 'completed' },
      { id: 2, title: 'B', status: 'completed' },
      { id: 3, title: 'C', status: 'in-progress' },
      { id: 4, title: 'D', status: 'not-started' },
      { id: 5, title: 'E', status: 'not-started' },
    ]);
    const header = widget.getDomNode().querySelector('.info-section-header');
    expect(header!.textContent).toContain('2/5');
  });

  it('applies correct status classes', () => {
    const widget = new TodoListWidget();
    widget.setTodos([
      { id: 1, title: 'Done', status: 'completed' },
      { id: 2, title: 'Working', status: 'in-progress' },
      { id: 3, title: 'Waiting', status: 'not-started' },
    ]);
    const items = widget.getDomNode().querySelectorAll('.info-todo-item');
    expect(items[0].classList.contains('info-todo-item--completed')).toBe(true);
    expect(items[1].classList.contains('info-todo-item--in-progress')).toBe(true);
    expect(items[2].classList.contains('info-todo-item--not-started')).toBe(true);
  });

  it('toggles collapse on header click', () => {
    const widget = new TodoListWidget();
    widget.setTodos([{ id: 1, title: 'A', status: 'not-started' }]);
    const header = widget.getDomNode().querySelector('.info-section-header') as HTMLElement;
    const list = widget.getDomNode().querySelector('.info-todo-list') as HTMLElement;

    // Initially expanded
    expect(list.style.display).not.toBe('none');

    // Click to collapse
    header.click();
    expect(list.style.display).toBe('none');

    // Click to expand
    header.click();
    expect(list.style.display).not.toBe('none');
  });

  it('has correct ARIA attributes', () => {
    const widget = new TodoListWidget();
    widget.setTodos([{ id: 1, title: 'A', status: 'not-started' }]);
    const list = widget.getDomNode().querySelector('.info-todo-list');
    expect(list!.getAttribute('role')).toBe('list');
    expect(list!.getAttribute('aria-label')).toBe('Todo items');
  });
});
