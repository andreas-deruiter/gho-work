/**
 * ContextSection widget — shows loaded instruction sources, registered agents,
 * available skills, and MCP servers in the info panel for transparency/troubleshooting.
 */
import { CollapsibleSection } from './collapsibleSection.js';

export interface ContextSource {
  path: string;
  origin: 'user' | 'project' | string;
  format: string;
}

export interface RegisteredAgent {
  name: string;
  plugin: string;
}

export interface ContextSkill {
  name: string;
  source: string;
}

type ServerStatus = 'connected' | 'disconnected' | 'error' | 'initializing';

interface ServerEntry {
  name: string;
  status: ServerStatus;
  type: string;
  error?: string;
  el: HTMLElement;
}

/** Remove all child nodes from an element. */
function clearChildren(el: HTMLElement): void {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

export class ContextSection extends CollapsibleSection {
  private readonly _sourcesHeader: HTMLElement;
  private readonly _sourceList: HTMLElement;
  private readonly _agentsHeader: HTMLElement;
  private readonly _agentList: HTMLElement;
  private readonly _skillsHeader: HTMLElement;
  private readonly _skillList: HTMLElement;
  private readonly _serversHeader: HTMLElement;
  private readonly _serverList: HTMLElement;

  // MCP server state is GLOBAL — persists across conversation switches
  private readonly _servers = new Map<string, ServerEntry>();

  private _sourceCount = 0;
  private _agentCount = 0;
  private _skillCount = 0;

  constructor() {
    super('Context', { defaultCollapsed: true });
    this.setVisible(false);

    this._sourcesHeader = document.createElement('h4');
    this._sourcesHeader.className = 'info-subsection-header';
    this._sourcesHeader.textContent = 'Instructions';
    this._sourcesHeader.style.display = 'none';

    this._sourceList = document.createElement('ul');
    this._sourceList.className = 'info-context-source-list';
    this._sourceList.setAttribute('role', 'list');

    this._agentsHeader = document.createElement('h4');
    this._agentsHeader.className = 'info-subsection-header';
    this._agentsHeader.textContent = 'Agents';
    this._agentsHeader.style.display = 'none';

    this._agentList = document.createElement('ul');
    this._agentList.className = 'info-context-agent-list';
    this._agentList.setAttribute('role', 'list');

    this._skillsHeader = document.createElement('h4');
    this._skillsHeader.className = 'info-subsection-header';
    this._skillsHeader.textContent = 'Skills';
    this._skillsHeader.style.display = 'none';

    this._skillList = document.createElement('ul');
    this._skillList.className = 'info-context-skill-list';
    this._skillList.setAttribute('role', 'list');

    this._serversHeader = document.createElement('h4');
    this._serversHeader.className = 'info-subsection-header';
    this._serversHeader.textContent = 'MCP Servers';
    this._serversHeader.style.display = 'none';

    this._serverList = document.createElement('ul');
    this._serverList.className = 'info-context-server-list';
    this._serverList.setAttribute('role', 'list');

    this.bodyElement.appendChild(this._sourcesHeader);
    this.bodyElement.appendChild(this._sourceList);
    this.bodyElement.appendChild(this._agentsHeader);
    this.bodyElement.appendChild(this._agentList);
    this.bodyElement.appendChild(this._skillsHeader);
    this.bodyElement.appendChild(this._skillList);
    this.bodyElement.appendChild(this._serversHeader);
    this.bodyElement.appendChild(this._serverList);
  }

  /** Set instruction sources and re-render. */
  setSources(sources: ContextSource[]): void {
    clearChildren(this._sourceList);
    this._sourceCount = sources.length;

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
    this._agentCount = agents.length;

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

  /** Set available skills and re-render. */
  setSkills(skills: ContextSkill[]): void {
    clearChildren(this._skillList);
    this._skillCount = skills.length;

    for (const skill of skills) {
      const li = document.createElement('li');
      li.className = 'info-context-skill';
      li.setAttribute('role', 'listitem');

      const nameEl = document.createElement('span');
      nameEl.className = 'info-context-skill-name';
      nameEl.textContent = skill.name;

      const sourceEl = document.createElement('span');
      sourceEl.className = 'info-context-badge';
      sourceEl.textContent = skill.source;

      li.appendChild(nameEl);
      li.appendChild(sourceEl);
      this._skillList.appendChild(li);
    }

    this._skillsHeader.style.display = skills.length > 0 ? '' : 'none';
    this._updateVisibility();
  }

  /**
   * Update or add an MCP server entry.
   * Server state is global and persists across conversation switches.
   */
  updateServer(name: string, status: string, type: string, error?: string): void {
    const existing = this._servers.get(name);
    if (existing) {
      existing.status = status as ServerStatus;
      existing.type = type;
      existing.error = error;
      this._renderServerContent(existing);
    } else {
      const li = document.createElement('li');
      li.className = 'info-context-server';
      li.setAttribute('role', 'listitem');
      li.setAttribute('data-server', name);

      const entry: ServerEntry = { name, status: status as ServerStatus, type, error, el: li };
      this._servers.set(name, entry);
      this._renderServerContent(entry);
      this._serverList.appendChild(li);
    }

    this._serversHeader.style.display = this._servers.size > 0 ? '' : 'none';
    this._updateVisibility();
  }

  /** Replace all server entries at once. */
  setServers(servers: Array<{ name: string; status: string; type: string; error?: string }>): void {
    this._servers.clear();
    clearChildren(this._serverList);
    for (const s of servers) {
      this.updateServer(s.name, s.status, s.type, s.error);
    }
  }

  private _renderServerContent(entry: ServerEntry): void {
    clearChildren(entry.el);

    const dotEl = document.createElement('span');
    dotEl.className = `info-context-server-dot info-context-server-dot--${entry.status}`;

    const nameEl = document.createElement('span');
    nameEl.className = 'info-context-server-name';
    nameEl.textContent = entry.name;

    const typeEl = document.createElement('span');
    typeEl.className = 'info-context-badge';
    typeEl.textContent = entry.type;

    entry.el.appendChild(dotEl);
    entry.el.appendChild(nameEl);
    entry.el.appendChild(typeEl);

    if (entry.error) {
      const errorEl = document.createElement('div');
      errorEl.className = 'info-context-server-error';
      errorEl.textContent = entry.error;
      entry.el.appendChild(errorEl);
    }
  }

  private _updateVisibility(): void {
    const total = this._sourceCount + this._agentCount + this._skillCount + this._servers.size;
    this.setVisible(total > 0);
    this.setBadge(total > 0 ? String(total) : '');
  }
}
