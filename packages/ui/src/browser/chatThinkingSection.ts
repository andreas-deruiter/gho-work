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
  private _activityListEl: HTMLElement | null = null;
  private _isActive = false;
  private _thinkingContent = '';
  private _skillCount = 0;
  private _subagentCount = 0;
  private readonly _subagents = new Map<string, HTMLElement>();

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

  addSkillInvocation(skillName: string, state: 'running' | 'completed' | 'failed'): void {
    if (state === 'running') {
      this._skillCount++;
    }
    const item = this._createActivityItem(
      state === 'running' ? 'icon-spinner' : state === 'completed' ? 'icon-check' : 'icon-error',
      state === 'running' ? `Using skill: ${skillName}` : `Used skill: ${skillName}`,
      state === 'running' ? 'shimmer' : '',
    );
    // Replace running item with completed
    if (state !== 'running') {
      const existing = this._activityListEl?.querySelector(`[data-skill="${skillName}"]`);
      if (existing) { existing.replaceWith(item); }
      else { this._activityListEl?.appendChild(item); }
    } else {
      item.dataset.skill = skillName;
      this._activityListEl?.appendChild(item);
    }
    if (!this._isActive) { this._updateCompletedTitle(); }
  }

  addSubagent(subagentId: string, subagentName: string): void {
    this._subagentCount++;
    const item = this._createActivityItem('icon-spinner', `Subagent: ${subagentName}`, 'shimmer');
    this._subagents.set(subagentId, item);
    this._activityListEl?.appendChild(item);
  }

  updateSubagent(subagentId: string, state: 'completed' | 'failed'): void {
    const item = this._subagents.get(subagentId);
    if (!item) { return; }
    const label = item.querySelector('.thinking-activity-label');
    const icon = item.querySelector('.thinking-activity-icon');
    if (label) {
      label.textContent = label.textContent?.replace('Subagent:', state === 'completed' ? 'Subagent done:' : 'Subagent failed:') ?? '';
      label.classList.remove('shimmer');
    }
    if (icon) {
      icon.className = `thinking-activity-icon ${state === 'completed' ? 'icon-check' : 'icon-error'}`;
    }
    if (!this._isActive) { this._updateCompletedTitle(); }
  }

  appendThinkingText(text: string): void {
    this._thinkingContent += text;
    if (this._thinkingTextEl) {
      this._thinkingTextEl.textContent = this._thinkingContent;
      // Auto-scroll to bottom so user sees latest thoughts
      this._thinkingTextEl.scrollTop = this._thinkingTextEl.scrollHeight;
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

    // Activity list (skills, subagents)
    const { root: activityList } = h('div.thinking-activity-list');
    this._activityListEl = activityList;
    el.appendChild(activityList);

    // Tool call list
    const { root: toolCallList } = h('div.thinking-tool-list');
    this._toolCallListEl = toolCallList;

    // Add any tool calls that were added before content was created (lazy init)
    for (const item of this._toolCalls.values()) {
      toolCallList.appendChild(item.getDomNode());
    }

    el.appendChild(toolCallList);
  }

  private _createActivityItem(iconClass: string, text: string, labelExtra: string): HTMLElement {
    const { root } = h('div.thinking-activity-item');
    const icon = h(`span.thinking-activity-icon.${iconClass}`);
    root.appendChild(icon.root);
    const label = h('span.thinking-activity-label');
    label.root.textContent = text;
    if (labelExtra) { label.root.classList.add(labelExtra); }
    root.appendChild(label.root);
    return root;
  }

  private _updateCompletedTitle(): void {
    const parts: string[] = [];
    if (this._toolCalls.size > 0) {
      parts.push(`${this._toolCalls.size} tool${this._toolCalls.size !== 1 ? 's' : ''}`);
    }
    if (this._skillCount > 0) {
      parts.push(`${this._skillCount} skill${this._skillCount !== 1 ? 's' : ''}`);
    }
    if (this._subagentCount > 0) {
      parts.push(`${this._subagentCount} subagent${this._subagentCount !== 1 ? 's' : ''}`);
    }
    if (parts.length === 0) {
      this.setTitle('Worked');
    } else {
      this.setTitle(`Worked — ${parts.join(', ')} used`);
    }
  }
}
