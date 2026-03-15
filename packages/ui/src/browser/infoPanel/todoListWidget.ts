/**
 * TodoListWidget — collapsible todo list driven by manage_todo_list tool calls.
 * Shows status icons (circle/filled/check) and a counter header (N/M).
 */
import { Widget } from '../widget.js';
import { h, addDisposableListener } from '../dom.js';
import type { TodoItem } from './infoPanelState.js';

function clearChildren(el: HTMLElement): void {
  while (el.firstChild) { el.removeChild(el.firstChild); }
}

export class TodoListWidget extends Widget {
  private readonly _headerEl: HTMLElement;
  private readonly _listEl: HTMLElement;
  private readonly _chevronEl: HTMLElement;
  private _isExpanded = true;
  private _todos: TodoItem[] = [];

  constructor() {
    const root = h('section.info-todo-section@root', [
      h('div.info-section-header@header', [
        h('span.info-todo-chevron@chevron'),
        h('span.info-todo-header-text@headerText'),
      ]),
      h('div.info-todo-list@list'),
    ]);

    super(root.root);

    this._headerEl = root['header'];
    this._listEl = root['list'];
    this._chevronEl = root['chevron'];

    // ARIA
    this._listEl.setAttribute('role', 'list');
    this._listEl.setAttribute('aria-label', 'Todo items');

    // Collapse toggle
    this._register(addDisposableListener(this._headerEl, 'click', () => {
      this._isExpanded = !this._isExpanded;
      this._listEl.style.display = this._isExpanded ? '' : 'none';
      this._updateChevron();
    }));
    this._headerEl.style.cursor = 'pointer';

    // Hidden until todos arrive
    this.element.style.display = 'none';
  }

  setTodos(todos: TodoItem[]): void {
    this._todos = todos;
    this.element.style.display = todos.length > 0 ? '' : 'none';
    this._render();
  }

  private _render(): void {
    clearChildren(this._listEl);
    this._updateHeader();
    this._updateChevron();

    for (const todo of this._todos) {
      this._listEl.appendChild(this._makeTodoEl(todo));
    }
  }

  private _updateHeader(): void {
    const completed = this._todos.filter(t => t.status === 'completed').length;
    const total = this._todos.length;
    const headerText = this._headerEl.querySelector('.info-todo-header-text');
    if (headerText) {
      headerText.textContent = `Todos (${completed}/${total})`;
    }
  }

  private _updateChevron(): void {
    this._chevronEl.textContent = this._isExpanded ? '\u25BC' : '\u25B6';
  }

  private _makeTodoEl(todo: TodoItem): HTMLElement {
    const el = document.createElement('div');
    el.className = `info-todo-item info-todo-item--${todo.status}`;
    el.setAttribute('role', 'listitem');

    const icon = document.createElement('span');
    icon.className = `info-todo-icon info-todo-icon--${todo.status}`;
    icon.setAttribute('aria-hidden', 'true');
    if (todo.status === 'completed') {
      icon.textContent = '\u2713';
    } else if (todo.status === 'in-progress') {
      icon.textContent = '\u25CF';
    } else {
      icon.textContent = '\u25CB';
    }

    const label = document.createElement('span');
    label.className = 'info-todo-label';
    label.textContent = todo.title;

    el.appendChild(icon);
    el.appendChild(label);
    return el;
  }
}
