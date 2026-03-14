import { Emitter } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import { Widget } from '../widget.js';
import { h } from '../dom.js';
import { WorkspaceItem } from './workspaceItem.js';
import type { WorkspaceData } from './workspaceItem.js';
import { ConnectorStatusItem } from './connectorStatusItem.js';
import type { ConnectorStatusData } from './connectorStatusItem.js';
import { ModelItem } from './modelItem.js';
import type { ModelData } from './modelItem.js';
import { AgentStateItem } from './agentStateItem.js';
import type { AgentStateData } from './agentStateItem.js';
import { UsageMeterItem } from './usageMeterItem.js';
import type { UsageMeterData } from './usageMeterItem.js';
import { UserAvatarItem } from './userAvatarItem.js';
import type { UserAvatarData } from './userAvatarItem.js';

export type StatusBarItemId = 'workspace' | 'connectors' | 'model' | 'usage' | 'user';

export class StatusBar extends Widget {
  private readonly _workspace: WorkspaceItem;
  private readonly _connectors: ConnectorStatusItem;
  private readonly _model: ModelItem;
  private readonly _agentState: AgentStateItem;
  private readonly _usage: UsageMeterItem;
  private readonly _userAvatar: UserAvatarItem;

  private readonly _onDidClickItem = this._register(new Emitter<StatusBarItemId>());
  readonly onDidClickItem: Event<StatusBarItemId> = this._onDidClickItem.event;

  constructor() {
    const els = h('div.status-bar', [
      h('div.status-bar-left@left'),
      h('div.status-bar-right@right'),
    ]);
    super(els.root);

    els.root.setAttribute('role', 'status');
    els.root.setAttribute('aria-label', 'Status bar');

    // Left items
    this._workspace = this._register(new WorkspaceItem());
    this._connectors = this._register(new ConnectorStatusItem());
    els.left.appendChild(this._workspace.element);
    els.left.appendChild(this._connectors.element);

    // Right items
    this._model = this._register(new ModelItem());
    this._agentState = this._register(new AgentStateItem());
    this._usage = this._register(new UsageMeterItem());
    this._userAvatar = this._register(new UserAvatarItem());
    els.right.appendChild(this._model.element);
    els.right.appendChild(this._agentState.element);
    els.right.appendChild(this._usage.element);
    els.right.appendChild(this._userAvatar.element);

    // Route click events
    this._register(this._workspace.onDidClick(() => this._onDidClickItem.fire('workspace')));
    this._register(this._connectors.onDidClick(() => this._onDidClickItem.fire('connectors')));
    this._register(this._model.onDidClick(() => this._onDidClickItem.fire('model')));
    this._register(this._usage.onDidClick(() => this._onDidClickItem.fire('usage')));
    this._register(this._userAvatar.onDidClick(() => this._onDidClickItem.fire('user')));
  }

  updateWorkspace(data: WorkspaceData): void { this._workspace.update(data); }
  updateConnectors(data: ConnectorStatusData): void { this._connectors.update(data); }
  updateModel(data: ModelData): void { this._model.update(data); }
  updateAgentState(data: AgentStateData): void { this._agentState.update(data); }
  updateUsage(data: UsageMeterData): void { this._usage.update(data); }
  updateUser(data: UserAvatarData): void { this._userAvatar.update(data); }
}
