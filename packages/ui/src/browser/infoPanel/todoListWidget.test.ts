import { describe, it, expect } from 'vitest';
import { TodoListWidget } from './todoListWidget.js';

describe('TodoListWidget (timeline)', () => {
  it('starts hidden', () => {
    const widget = new TodoListWidget();
    expect(widget.getDomNode().style.display).toBe('none');
  });

  it('shows when todos arrive', () => {
    const widget = new TodoListWidget();
    widget.setTodos([{ id: 1, title: 'Step 1', status: 'not-started' }]);
    expect(widget.getDomNode().style.display).not.toBe('none');
  });

  it('renders progress ring with correct count', () => {
    const widget = new TodoListWidget();
    widget.setTodos([
      { id: 1, title: 'Done', status: 'completed' },
      { id: 2, title: 'Active', status: 'in-progress' },
      { id: 3, title: 'Pending', status: 'not-started' },
    ]);
    const counter = widget.getDomNode().querySelector('.info-progress-counter');
    expect(counter?.textContent).toContain('1');
    expect(counter?.textContent).toContain('3');
  });

  it('renders completed step with checkmark class', () => {
    const widget = new TodoListWidget();
    widget.setTodos([{ id: 1, title: 'Done', status: 'completed' }]);
    expect(widget.getDomNode().querySelector('.info-timeline-node--completed')).toBeTruthy();
  });

  it('renders active step with active class', () => {
    const widget = new TodoListWidget();
    widget.setTodos([{ id: 1, title: 'Active', status: 'in-progress' }]);
    expect(widget.getDomNode().querySelector('.info-timeline-node--in-progress')).toBeTruthy();
  });

  it('renders pending step with pending class', () => {
    const widget = new TodoListWidget();
    widget.setTodos([{ id: 1, title: 'Pending', status: 'not-started' }]);
    expect(widget.getDomNode().querySelector('.info-timeline-node--not-started')).toBeTruthy();
  });

  it('sets badge to N / M', () => {
    const widget = new TodoListWidget();
    widget.setTodos([
      { id: 1, title: 'Done', status: 'completed' },
      { id: 2, title: 'Pending', status: 'not-started' },
    ]);
    const badge = widget.getDomNode().querySelector('.info-section-badge');
    expect(badge?.textContent).toBe('1 / 2');
  });

  it('starts expanded by default', () => {
    const widget = new TodoListWidget();
    expect(widget.isCollapsed).toBe(false);
  });
});
