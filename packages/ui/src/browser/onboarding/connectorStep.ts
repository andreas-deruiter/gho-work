/**
 * Connector step — shows popular MCP connectors grid, "Start Using GHO Work" CTA.
 */
import { Emitter } from '@gho-work/base';
import { Widget } from '../widget.js';
import { h } from '../dom.js';

interface ConnectorDef {
  id: string;
  label: string;
  type: string;
}

const CONNECTORS: ConnectorDef[] = [
  { id: 'gdrive', label: 'Google Drive', type: 'MCP Registry' },
  { id: 'slack', label: 'Slack', type: 'Remote MCP' },
  { id: 'gmail', label: 'Gmail', type: 'MCP Registry' },
  { id: 'gcal', label: 'Google Calendar', type: 'MCP Registry' },
  { id: 'jira', label: 'Jira', type: 'Remote MCP' },
  { id: 'notion', label: 'Notion', type: 'MCP Registry' },
];

export class ConnectorStep extends Widget {
  private readonly _onDidComplete = this._register(new Emitter<void>());
  readonly onDidComplete = this._onDidComplete.event;

  constructor(container: HTMLElement) {
    super(container);
    this._render();
  }

  private _render(): void {
    const wrapper = h('.onboarding-connectors', [
      h('.onb-connectors-content', [
        h('h3@heading'),
        h('p@desc'),
        h('.onb-connector-grid@grid'),
        h('.onb-connector-actions', [
          h('button.btn-text@browseBtn'),
          h('button.btn-primary@startBtn'),
        ]),
      ]),
    ]);

    wrapper.heading.textContent = 'Connect Your Services';
    wrapper.desc.textContent = 'Add MCP servers to let the agent access your favorite services. You can always add more later.';

    for (const connector of CONNECTORS) {
      const card = h('.onb-connector-card', [
        h(`.connector-icon.${connector.id}`),
        h('span.connector-label@label'),
        h('span.connector-type@type'),
        h('button.btn-small.btn-outline@addBtn'),
      ]);
      card.label.textContent = connector.label;
      card.type.textContent = connector.type;
      card.addBtn.textContent = 'Add';
      wrapper.grid.appendChild(card.root);
    }

    wrapper.browseBtn.textContent = 'Browse MCP Registry';
    wrapper.startBtn.textContent = 'Start Using GHO Work';
    this.listen(wrapper.startBtn, 'click', () => this._onDidComplete.fire());

    this.element.appendChild(wrapper.root);
  }
}
