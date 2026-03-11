/**
 * Conversation list — sidebar panel showing conversation history.
 */
import { Disposable, Emitter } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: number;
}

export class ConversationListPanel extends Disposable {
  private _container!: HTMLElement;
  private _conversations: ConversationSummary[] = [];

  private readonly _onDidSelect = this._register(new Emitter<string>());
  readonly onDidSelectConversation: Event<string> = this._onDidSelect.event;

  private readonly _onDidRequestNew = this._register(new Emitter<void>());
  readonly onDidRequestNewConversation: Event<void> = this._onDidRequestNew.event;

  constructor(private readonly _ipc: IIPCRenderer) {
    super();
  }

  render(container: HTMLElement): void {
    this._container = container;
    this._container.className = 'conversation-list-panel';

    const newBtn = document.createElement('button');
    newBtn.className = 'conversation-new-btn';
    newBtn.textContent = '+ New Conversation';
    newBtn.addEventListener('click', () => this._onDidRequestNew.fire());
    this._container.appendChild(newBtn);

    const list = document.createElement('div');
    list.className = 'conversation-list';
    this._container.appendChild(list);

    this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      const response = await this._ipc.invoke<{ conversations: ConversationSummary[] }>(
        IPC_CHANNELS.CONVERSATION_LIST,
      );
      this._conversations = response.conversations;
      this._renderList();
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  }

  private _clearElement(el: Element): void {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  private _renderList(): void {
    const list = this._container?.querySelector('.conversation-list');
    if (!list) { return; }
    this._clearElement(list);

    if (this._conversations.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'conversation-list-empty';
      empty.textContent = 'No conversations yet';
      list.appendChild(empty);
      return;
    }

    for (const conv of this._conversations) {
      const item = document.createElement('div');
      item.className = 'conversation-list-item';
      item.dataset.id = conv.id;

      const title = document.createElement('span');
      title.className = 'conversation-item-title';
      title.textContent = conv.title;
      item.appendChild(title);

      const date = document.createElement('span');
      date.className = 'conversation-item-date';
      date.textContent = new Date(conv.updatedAt).toLocaleDateString();
      item.appendChild(date);

      item.addEventListener('click', () => this._onDidSelect.fire(conv.id));
      list.appendChild(item);
    }
  }
}
