import { DisposableStore } from '@gho-work/base';
import { ChatCollapsible } from './chatCollapsible.js';
import { ChatToolCallItem } from './chatToolCallItem.js';
import { h } from './dom.js';

const THINKING_VERBS = ['Working', 'Thinking', 'Reasoning', 'Analyzing', 'Considering'];

export class ChatThinkingSection extends ChatCollapsible {
  private readonly _toolCalls = new Map<string, ChatToolCallItem>();
  private readonly _toolCallDisposables = this._register(new DisposableStore());
  private _thinkingTextEl: HTMLElement | null = null;
  private _toolCallListEl: HTMLElement | null = null;
  private _isActive = false;
  private _thinkingContent = '';

  constructor() {
    super(THINKING_VERBS[0], {
      createContent: (el) => this._buildContent(el),
    });
    this.getDomNode().classList.add('chat-thinking-section');
  }

  setActive(active: boolean): void {
    this._isActive = active;
    if (active) {
      this.getDomNode().classList.add('thinking-active');
      const verb = THINKING_VERBS[Math.floor(Math.random() * THINKING_VERBS.length)];
      this.setTitle(verb);
      // Auto-expand so thinking text and tool calls are visible while streaming
      if (!this.isExpanded) {
        this.toggle();
      }
    } else {
      this.getDomNode().classList.remove('thinking-active');
      this._updateCompletedTitle();
    }
  }

  addToolCall(toolCallId: string, toolName: string): void {
    const item = new ChatToolCallItem(toolCallId, toolName, 'executing');
    this._toolCallDisposables.add(item);
    this._toolCalls.set(toolCallId, item);

    if (this._toolCallListEl) {
      this._toolCallListEl.appendChild(item.getDomNode());
    }
  }

  updateToolCall(toolCallId: string, state: 'completed' | 'failed' | 'cancelled'): void {
    const item = this._toolCalls.get(toolCallId);
    if (item) {
      item.setState(state);
    }
    if (!this._isActive) {
      this._updateCompletedTitle();
    }
  }

  appendThinkingText(text: string): void {
    this._thinkingContent += text;
    if (this._thinkingTextEl) {
      this._thinkingTextEl.textContent = this._thinkingContent;
    }
  }

  getDomNode(): HTMLElement {
    return super.getDomNode();
  }

  private _buildContent(el: HTMLElement): void {
    // Thinking text area
    const { root: thinkingText } = h('div.thinking-text');
    thinkingText.textContent = this._thinkingContent;
    this._thinkingTextEl = thinkingText;
    el.appendChild(thinkingText);

    // Tool call list
    const { root: toolCallList } = h('div.thinking-tool-list');
    this._toolCallListEl = toolCallList;

    // Add any tool calls that were added before content was created (lazy init)
    for (const item of this._toolCalls.values()) {
      toolCallList.appendChild(item.getDomNode());
    }

    el.appendChild(toolCallList);
  }

  private _updateCompletedTitle(): void {
    const count = this._toolCalls.size;
    if (count === 0) {
      this.setTitle('Worked');
    } else {
      this.setTitle(`Worked — ${count} tool${count !== 1 ? 's' : ''} used`);
    }
  }
}
