import { Emitter } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import { Widget } from '../widget.js';
import { h } from '../dom.js';

export interface ToolInfo {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  enabled: boolean;
}

export interface ToolGroup {
  connectorId: string;
  connectorName: string;
  tools: ToolInfo[];
}

export interface ToolToggleEvent {
  connectorId: string;
  toolName: string;
  enabled: boolean;
}

export class ToolListSectionWidget extends Widget {
  private readonly _bodyEl: HTMLElement;
  private readonly _searchInput: HTMLInputElement;

  private readonly _onDidToggleTool = this._register(new Emitter<ToolToggleEvent>());
  readonly onDidToggleTool: Event<ToolToggleEvent> = this._onDidToggleTool.event;

  constructor() {
    const layout = h('div.tool-list-section', [
      h('div.tool-list-header@header'),
      h('div.tool-list-body@body'),
    ]);
    super(layout.root);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tool-search-input';
    input.placeholder = 'Filter tools...';
    input.setAttribute('aria-label', 'Filter tools');
    layout.header.appendChild(input);
    this._searchInput = input;
    this._bodyEl = layout.body;

    this.listen(input, 'input', () => this._applyFilter());
  }

  setTools(groups: ToolGroup[], focusConnectorId?: string): void {
    while (this._bodyEl.firstChild) { this._bodyEl.removeChild(this._bodyEl.firstChild); }

    if (groups.length === 0 || groups.every(g => g.tools.length === 0)) {
      const empty = document.createElement('div');
      empty.className = 'tool-list-empty';
      empty.textContent = 'No tools available \u2014 connect a connector to see its tools';
      this._bodyEl.appendChild(empty);
      return;
    }

    for (const group of groups) {
      const groupEl = document.createElement('div');
      groupEl.className = 'tool-group';
      groupEl.dataset.connectorId = group.connectorId;

      const headerBtn = document.createElement('button');
      headerBtn.className = 'tool-group-header';
      headerBtn.textContent = `${group.connectorName} (${group.tools.length})`;
      const expanded = focusConnectorId ? group.connectorId === focusConnectorId : true;
      headerBtn.setAttribute('aria-expanded', String(expanded));

      const bodyEl = document.createElement('div');
      bodyEl.className = 'tool-group-body';
      bodyEl.style.display = expanded ? 'block' : 'none';

      this.listen(headerBtn, 'click', () => {
        const isExp = headerBtn.getAttribute('aria-expanded') === 'true';
        headerBtn.setAttribute('aria-expanded', String(!isExp));
        bodyEl.style.display = isExp ? 'none' : 'block';
      });
      groupEl.appendChild(headerBtn);

      for (const tool of group.tools) {
        const row = document.createElement('div');
        row.className = 'tool-row';
        row.dataset.toolName = tool.name;
        row.dataset.searchText = `${tool.name} ${tool.description}`.toLowerCase();

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = tool.enabled;
        cb.id = `tool-${group.connectorId}-${tool.name}`;

        const label = document.createElement('label');
        label.htmlFor = cb.id;
        const nameSpan = document.createElement('span');
        nameSpan.className = 'tool-name';
        nameSpan.textContent = tool.name;
        label.appendChild(nameSpan);
        const descSpan = document.createElement('span');
        descSpan.className = 'tool-description';
        descSpan.textContent = tool.description;
        descSpan.title = tool.description;
        label.appendChild(descSpan);

        this.listen(cb, 'change', () => {
          this._onDidToggleTool.fire({ connectorId: group.connectorId, toolName: tool.name, enabled: cb.checked });
        });

        row.appendChild(cb);
        row.appendChild(label);
        bodyEl.appendChild(row);
      }
      groupEl.appendChild(bodyEl);
      this._bodyEl.appendChild(groupEl);
    }
  }

  revertToolToggle(connectorId: string, toolName: string, enabled: boolean): void {
    const row = this._bodyEl.querySelector(
      `.tool-group[data-connector-id="${connectorId}"] .tool-row[data-tool-name="${toolName}"]`
    ) as HTMLElement | null;
    const cb = row?.querySelector('input') as HTMLInputElement | null;
    if (cb) { cb.checked = enabled; }
    // Show brief inline error
    if (row) {
      const err = document.createElement('span');
      err.className = 'tool-toggle-error';
      err.textContent = 'Failed to update';
      row.appendChild(err);
      setTimeout(() => err.remove(), 3000);
    }
  }

  private _applyFilter(): void {
    const q = this._searchInput.value.toLowerCase().trim();
    for (const row of this._bodyEl.querySelectorAll('.tool-row') as NodeListOf<HTMLElement>) {
      row.style.display = !q || (row.dataset.searchText ?? '').includes(q) ? '' : 'none';
    }
  }
}
