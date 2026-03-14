import { Disposable } from '@gho-work/base';
import { h } from '../dom.js';

export type AgentState = 'idle' | 'working' | 'error';

export interface AgentStateData {
  state: AgentState;
}

interface StateConfig {
  dotClass: string;
  pulse: boolean;
  label: string;
}

const STATE_CONFIG: Record<AgentState, StateConfig> = {
  idle: { dotClass: 'green', pulse: false, label: 'Agent idle' },
  working: { dotClass: 'yellow', pulse: true, label: 'Agent working' },
  error: { dotClass: 'red', pulse: false, label: 'Agent error' },
};

export class AgentStateItem extends Disposable {
  private readonly _dotEl: HTMLElement;
  private readonly _labelEl: HTMLElement;
  readonly element: HTMLElement;

  constructor() {
    super();

    const { root, dot, label } = h('span.status-bar-item.sb-agent-state', [
      h('span.sb-dot@dot'),
      h('span.sb-agent-label@label'),
    ]);

    this.element = root;
    this._dotEl = dot;
    this._labelEl = label;

    root.setAttribute('aria-live', 'polite');

    // Apply default idle state
    this.update({ state: 'idle' });
  }

  update(data: AgentStateData): void {
    const config = STATE_CONFIG[data.state];

    this._dotEl.className = `sb-dot ${config.dotClass}`;
    if (config.pulse) {
      this._dotEl.classList.add('pulse');
    }

    this._labelEl.textContent = config.label;
  }
}
