import { Disposable } from '@gho-work/base';
import { h } from './dom.js';
import { getToolIconClass, getInProgressMessage, getPastTenseMessage } from './chatProgressIcons.js';

type ToolCallDisplayState = 'executing' | 'completed' | 'failed' | 'cancelled';

export class ChatToolCallItem extends Disposable {
  private readonly _root: HTMLElement;
  private readonly _statusIcon: HTMLElement;
  private readonly _typeIcon: HTMLElement;
  private readonly _label: HTMLElement;
  private _state: ToolCallDisplayState;

  readonly toolCallId: string;
  readonly toolName: string;

  constructor(toolCallId: string, toolName: string, initialState: ToolCallDisplayState) {
    super();
    this.toolCallId = toolCallId;
    this.toolName = toolName;
    this._state = initialState;

    const { root, statusIcon, typeIcon, label } = h('div.chat-tool-call-item@root', [
      h('span.tool-call-status-icon@statusIcon'),
      h('span.tool-call-type-icon@typeIcon'),
      h('span.tool-call-label@label'),
    ]);

    this._root = root;
    this._statusIcon = statusIcon;
    this._typeIcon = typeIcon;
    this._label = label;

    // Add dynamic icon class after creation
    const iconClass = getToolIconClass(toolName);
    this._typeIcon.classList.add(iconClass);

    this._applyState();
  }

  setState(state: ToolCallDisplayState): void {
    this._state = state;
    this._applyState();
  }

  getDomNode(): HTMLElement {
    return this._root;
  }

  private _applyState(): void {
    this._root.classList.remove(
      'tool-call-executing',
      'tool-call-completed',
      'tool-call-failed',
      'tool-call-cancelled',
    );
    this._root.classList.add(`tool-call-${this._state}`);

    if (this._state === 'executing') {
      this._label.textContent = getInProgressMessage(this.toolName);
      this._label.classList.add('shimmer');
      this._statusIcon.className = 'tool-call-status-icon icon-spinner';
    } else {
      this._label.textContent = getPastTenseMessage(this.toolName, this._state);
      this._label.classList.remove('shimmer');
      if (this._state === 'completed') {
        this._statusIcon.className = 'tool-call-status-icon icon-check';
      } else if (this._state === 'failed') {
        this._statusIcon.className = 'tool-call-status-icon icon-error';
      } else {
        this._statusIcon.className = 'tool-call-status-icon icon-cancelled';
      }
    }
  }
}
