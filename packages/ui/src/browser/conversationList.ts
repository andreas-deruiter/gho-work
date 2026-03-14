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

    // Group conversations by time bucket
    const groups = this._groupByTime(this._conversations);

    for (const group of groups) {
      const heading = document.createElement('div');
      heading.className = 'conversation-group-heading';
      heading.textContent = group.label;
      list.appendChild(heading);

      for (const conv of group.items) {
        const item = document.createElement('div');
        item.className = 'conversation-list-item';
        item.dataset.id = conv.id;

        const title = document.createElement('span');
        title.className = 'conversation-item-title';
        title.textContent = conv.title;
        item.appendChild(title);

        item.addEventListener('click', () => this._onDidSelect.fire(conv.id));
        list.appendChild(item);
      }
    }
  }

  private _groupByTime(conversations: ConversationSummary[]): Array<{ label: string; items: ConversationSummary[] }> {
    const now = Date.now();
    const HOUR = 60 * 60 * 1000;
    const DAY = 24 * HOUR;

    const buckets: Array<{ label: string; maxAge: number; items: ConversationSummary[] }> = [
      { label: 'Last hour', maxAge: HOUR, items: [] },
      { label: 'Today', maxAge: DAY, items: [] },
      { label: 'Yesterday', maxAge: 2 * DAY, items: [] },
      { label: 'Last 7 days', maxAge: 7 * DAY, items: [] },
      { label: 'Last 30 days', maxAge: 30 * DAY, items: [] },
      { label: 'Older', maxAge: Infinity, items: [] },
    ];

    for (const conv of conversations) {
      const age = now - conv.updatedAt;
      for (const bucket of buckets) {
        if (age < bucket.maxAge) {
          bucket.items.push(conv);
          break;
        }
      }
    }

    return buckets.filter(b => b.items.length > 0);
  }
}
