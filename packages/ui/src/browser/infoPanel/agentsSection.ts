import { CollapsibleSection } from './collapsibleSection.js';
import { h } from '../dom.js';

type AgentState = 'running' | 'completed' | 'failed';

interface AgentEntry {
  id: string;
  name: string;
  displayName: string;
  state: AgentState;
  el: HTMLElement;
  statusEl: HTMLElement;
  dotEl: HTMLElement;
}

export class AgentsSection extends CollapsibleSection {
  private readonly _agents = new Map<string, AgentEntry>();

  constructor() {
    super('Agents', { defaultCollapsed: true });
    this.setVisible(false);
  }

  addAgent(id: string, name: string, displayName: string): void {
    if (this._agents.has(id)) return;

    const layout = h('div.info-agent-card@root', [
      h('span.info-agent-dot.info-agent-dot--running@dot'),
      h('span.info-agent-name@name'),
      h('span.info-agent-status.info-agent-status--running@status'),
    ]);

    layout['name'].textContent = displayName || name;
    layout['status'].textContent = 'RUNNING';
    layout.root.setAttribute('data-agent-id', id);

    this._agents.set(id, {
      id, name, displayName, state: 'running',
      el: layout.root, statusEl: layout['status'], dotEl: layout['dot'],
    });
    this.bodyElement.appendChild(layout.root);
    this.setVisible(true);
    this._updateBadge();
  }

  updateAgent(id: string, state: 'completed' | 'failed', error?: string): void {
    const entry = this._agents.get(id);
    if (!entry) return;

    entry.state = state;
    entry.dotEl.className = `info-agent-dot info-agent-dot--${state}`;
    entry.statusEl.className = `info-agent-status info-agent-status--${state}`;
    entry.statusEl.textContent = state === 'completed' ? 'DONE' : 'FAILED';

    if (state === 'completed') {
      entry.el.classList.add('info-agent-card--dimmed');
    }

    this._updateBadge();
  }

  setAgents(agents: Array<{ id: string; name: string; displayName: string; state: AgentState }>): void {
    this._agents.clear();
    this.bodyElement.textContent = '';
    for (const a of agents) {
      this.addAgent(a.id, a.name, a.displayName);
      if (a.state !== 'running') {
        this.updateAgent(a.id, a.state);
      }
    }
    this.setVisible(agents.length > 0);
  }

  getAgentEntries(): Array<{ id: string; name: string; displayName: string; state: AgentState }> {
    return [...this._agents.values()].map(a => ({
      id: a.id, name: a.name, displayName: a.displayName, state: a.state,
    }));
  }

  private _updateBadge(): void {
    const running = [...this._agents.values()].filter(a => a.state === 'running').length;
    this.setBadge(running > 0 ? `${running} running` : 'all done');
  }
}
