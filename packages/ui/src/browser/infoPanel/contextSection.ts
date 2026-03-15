/**
 * ContextSection widget — shows loaded instruction sources and registered agents
 * in the info panel for transparency/troubleshooting.
 */
import { Widget } from '../widget.js';
import { h } from '../dom.js';

export interface ContextSource {
  path: string;
  origin: 'user' | 'project' | string;
  format: string;
}

export interface RegisteredAgent {
  name: string;
  plugin: string;
}

/** Remove all child nodes from an element. */
function clearChildren(el: HTMLElement): void {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

export class ContextSection extends Widget {
  private readonly _sourceList: HTMLElement;
  private readonly _agentList: HTMLElement;
  private readonly _sourcesHeader: HTMLElement;
  private readonly _agentsHeader: HTMLElement;

  constructor() {
    const root = h('section.info-context-section@root', [
      h('h3.info-section-header@header'),
      h('h4.info-subsection-header@sourcesHeader'),
      h('ul.info-context-source-list@sourceList'),
      h('h4.info-subsection-header@agentsHeader'),
      h('ul.info-context-agent-list@agentList'),
    ]);

    super(root.root);

    const header = root['header'];
    header.textContent = 'Context';

    this._sourcesHeader = root['sourcesHeader'];
    this._sourcesHeader.textContent = 'Instructions';

    this._agentsHeader = root['agentsHeader'];
    this._agentsHeader.textContent = 'Agents';

    this._sourceList = root['sourceList'];
    this._sourceList.setAttribute('role', 'list');

    this._agentList = root['agentList'];
    this._agentList.setAttribute('role', 'list');

    // Hidden until data is set
    this.element.style.display = 'none';
  }

  /** Set instruction sources and re-render. */
  setSources(sources: ContextSource[]): void {
    clearChildren(this._sourceList);

    for (const source of sources) {
      const li = document.createElement('li');
      li.className = 'info-context-source';
      li.setAttribute('role', 'listitem');

      const badge = document.createElement('span');
      badge.className = `info-context-badge info-context-badge--${source.origin}`;
      badge.textContent = source.origin;

      const pathEl = document.createElement('span');
      pathEl.className = 'info-context-path';
      pathEl.textContent = source.path;
      pathEl.title = source.path;

      li.appendChild(badge);
      li.appendChild(pathEl);
      this._sourceList.appendChild(li);
    }

    this._sourcesHeader.style.display = sources.length > 0 ? '' : 'none';
    this._updateVisibility();
  }

  /** Set registered agents and re-render. */
  setAgents(agents: RegisteredAgent[]): void {
    clearChildren(this._agentList);

    for (const agent of agents) {
      const li = document.createElement('li');
      li.className = 'info-context-agent';
      li.setAttribute('role', 'listitem');

      const nameEl = document.createElement('span');
      nameEl.className = 'info-context-agent-name';
      nameEl.textContent = agent.name;

      const pluginEl = document.createElement('span');
      pluginEl.className = 'info-context-badge info-context-badge--plugin';
      pluginEl.textContent = agent.plugin;

      li.appendChild(nameEl);
      li.appendChild(pluginEl);
      this._agentList.appendChild(li);
    }

    this._agentsHeader.style.display = agents.length > 0 ? '' : 'none';
    this._updateVisibility();
  }

  private _updateVisibility(): void {
    const hasSources = this._sourceList.childNodes.length > 0;
    const hasAgents = this._agentList.childNodes.length > 0;
    this.element.style.display = (hasSources || hasAgents) ? '' : 'none';
  }
}
