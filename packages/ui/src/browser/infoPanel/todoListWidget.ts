/**
 * TodoListWidget — connected timeline with SVG progress ring driven by manage_todo_list tool calls.
 */
import { CollapsibleSection } from './collapsibleSection.js';
import { h } from '../dom.js';
import type { TodoItem } from './infoPanelState.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const RING_RADIUS = 20;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export class TodoListWidget extends CollapsibleSection {
  private readonly _ringContainer: HTMLElement;
  private readonly _timelineEl: HTMLElement;
  private _todos: TodoItem[] = [];

  constructor() {
    super('Progress', { defaultCollapsed: false });
    this.setVisible(false);

    const ringLayout = h('div.info-progress-ring-container@ring');
    this._ringContainer = ringLayout.root;

    const timelineLayout = h('div.info-timeline@timeline');
    this._timelineEl = timelineLayout.root;

    this.bodyElement.appendChild(this._ringContainer);
    this.bodyElement.appendChild(this._timelineEl);
  }

  setTodos(todos: TodoItem[]): void {
    this._todos = todos;
    this.setVisible(todos.length > 0);
    this._render();
  }

  private _render(): void {
    const completed = this._todos.filter(t => t.status === 'completed').length;
    const total = this._todos.length;
    this.setBadge(`${completed} / ${total}`);
    this._renderRing(completed, total);
    this._renderTimeline();
  }

  private _renderRing(completed: number, total: number): void {
    this._ringContainer.textContent = '';
    const fraction = total > 0 ? completed / total : 0;
    const offset = RING_CIRCUMFERENCE * (1 - fraction);

    // Create SVG using createElementNS
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'info-progress-ring');
    svg.setAttribute('width', '56');
    svg.setAttribute('height', '56');
    svg.setAttribute('viewBox', '0 0 56 56');

    // Gradient definition (green to purple)
    const defs = document.createElementNS(SVG_NS, 'defs');
    const gradient = document.createElementNS(SVG_NS, 'linearGradient');
    gradient.setAttribute('id', 'ring-gradient');
    gradient.setAttribute('x1', '0%');
    gradient.setAttribute('y1', '0%');
    gradient.setAttribute('x2', '100%');
    gradient.setAttribute('y2', '100%');
    const stop1 = document.createElementNS(SVG_NS, 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', '#00b894');
    const stop2 = document.createElementNS(SVG_NS, 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', '#6c5ce7');
    gradient.appendChild(stop1);
    gradient.appendChild(stop2);
    defs.appendChild(gradient);

    // Background circle
    const bgCircle = document.createElementNS(SVG_NS, 'circle');
    bgCircle.setAttribute('cx', '28');
    bgCircle.setAttribute('cy', '28');
    bgCircle.setAttribute('r', String(RING_RADIUS));
    bgCircle.setAttribute('fill', 'none');
    bgCircle.setAttribute('stroke', 'rgba(255,255,255,0.06)');
    bgCircle.setAttribute('stroke-width', '3.5');

    // Progress circle with gradient stroke
    const progressCircle = document.createElementNS(SVG_NS, 'circle');
    progressCircle.setAttribute('cx', '28');
    progressCircle.setAttribute('cy', '28');
    progressCircle.setAttribute('r', String(RING_RADIUS));
    progressCircle.setAttribute('fill', 'none');
    progressCircle.setAttribute('stroke', 'url(#ring-gradient)');
    progressCircle.setAttribute('stroke-width', '3.5');
    progressCircle.setAttribute('stroke-dasharray', String(RING_CIRCUMFERENCE));
    progressCircle.setAttribute('stroke-dashoffset', String(offset));
    progressCircle.setAttribute('stroke-linecap', 'round');
    progressCircle.setAttribute('transform', 'rotate(-90 28 28)');

    svg.appendChild(defs);
    svg.appendChild(bgCircle);
    svg.appendChild(progressCircle);

    // Counter overlay
    const counterLayout = h('div.info-progress-counter@counter');
    counterLayout.root.textContent = `${completed} / ${total}`;

    this._ringContainer.appendChild(svg);
    this._ringContainer.appendChild(counterLayout.root);
  }

  private _renderTimeline(): void {
    this._timelineEl.textContent = '';
    this._todos.forEach((todo, i) => {
      const isLast = i === this._todos.length - 1;
      const node = this._makeNode(todo, isLast);
      this._timelineEl.appendChild(node);
    });
  }

  private _makeNode(todo: TodoItem, isLast: boolean): HTMLElement {
    const nodeLayout = h(`div.info-timeline-node.info-timeline-node--${todo.status}@node`);
    const node = nodeLayout.root;
    node.setAttribute('role', 'listitem');

    // Circle indicator
    const circleLayout = h('div.info-timeline-circle@circle');
    const circle = circleLayout.root;

    if (todo.status === 'completed') {
      // Green checkmark SVG
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('width', '8');
      svg.setAttribute('height', '8');
      svg.setAttribute('viewBox', '0 0 12 12');
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', 'M2 6l3 3 5-5');
      path.setAttribute('stroke', '#fff');
      path.setAttribute('stroke-width', '2.2');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('fill', 'none');
      svg.appendChild(path);
      circle.appendChild(svg);
    } else if (todo.status === 'in-progress') {
      const dotLayout = h('div.info-timeline-inner-dot@dot');
      circle.appendChild(dotLayout.root);
    }

    node.appendChild(circle);

    // Connector line (not on last node)
    if (!isLast) {
      const connectorLayout = h('div.info-timeline-connector@connector');
      node.appendChild(connectorLayout.root);
    }

    // Label
    const labelLayout = h('div.info-timeline-label@label');
    const label = labelLayout.root;

    if (todo.status === 'in-progress') {
      const cardLayout = h('div.info-timeline-active-card@card', [
        h('div.info-timeline-active-title@title'),
        h('div.info-timeline-active-subtitle@subtitle'),
      ]);
      cardLayout['title'].textContent = todo.title;
      cardLayout['subtitle'].textContent = 'Working on it...';
      label.appendChild(cardLayout.root);
    } else {
      label.textContent = todo.title;
    }

    node.appendChild(label);
    return node;
  }
}
