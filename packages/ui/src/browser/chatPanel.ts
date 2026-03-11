/**
 * Chat panel — the primary interaction UI.
 * VS Code-style direct DOM manipulation with event-driven updates.
 * Uses marked for markdown rendering and DOMPurify for XSS prevention.
 */
import { Disposable, Emitter, generateUUID } from '@gho-work/base';
import type { Event, AgentEvent } from '@gho-work/base';
import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{ id: string; name: string; status: string }>;
  isStreaming?: boolean;
}

export interface SendMessageEvent {
  conversationId: string;
  content: string;
  model: string;
}

export class ChatPanel extends Disposable {
  private _messages: ChatMessage[] = [];
  private _messageListEl!: HTMLElement;
  private _inputEl!: HTMLTextAreaElement;
  private _sendBtnEl!: HTMLButtonElement;
  private _cancelBtnEl!: HTMLButtonElement;
  private _isProcessing = false;
  private _currentAssistantMessage: ChatMessage | null = null;

  private _conversationId: string = generateUUID();
  private _model: string = 'gpt-4o';

  private readonly _onDidSendMessage = this._register(new Emitter<SendMessageEvent>());
  readonly onDidSendMessage: Event<SendMessageEvent> = this._onDidSendMessage.event;

  get conversationId(): string {
    return this._conversationId;
  }

  set conversationId(value: string) {
    this._conversationId = value;
  }

  get model(): string {
    return this._model;
  }

  set model(value: string) {
    this._model = value;
  }

  constructor(private readonly _ipc: IIPCRenderer) {
    super();
    // Listen for agent events from main process
    this._ipc.on(IPC_CHANNELS.AGENT_EVENT, (...args: unknown[]) => {
      const event = args[0] as AgentEvent;
      this._handleAgentEvent(event);
    });
  }

  render(container: HTMLElement): void {
    this._clearElement(container);

    // Panel wrapper
    const panel = document.createElement('div');
    panel.className = 'chat-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'chat-header';

    const headerTitle = document.createElement('h2');
    headerTitle.textContent = 'New Conversation';
    header.appendChild(headerTitle);

    const modelBadge = document.createElement('span');
    modelBadge.className = 'chat-model-badge';
    modelBadge.textContent = this._model;
    header.appendChild(modelBadge);

    panel.appendChild(header);

    // Message list
    this._messageListEl = document.createElement('div');
    this._messageListEl.className = 'chat-messages';
    this._renderWelcome();
    panel.appendChild(this._messageListEl);

    // Input area
    const inputArea = document.createElement('div');
    inputArea.className = 'chat-input-area';

    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'chat-input-wrapper';

    this._inputEl = document.createElement('textarea');
    this._inputEl.className = 'chat-input';
    this._inputEl.placeholder =
      'Ask GHO Work anything... (try "draft an email" or "analyze my data")';
    this._inputEl.rows = 1;
    this._inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._sendMessage();
      }
    });
    this._inputEl.addEventListener('input', () => {
      // Auto-resize
      this._inputEl.style.height = 'auto';
      this._inputEl.style.height = Math.min(this._inputEl.scrollHeight, 150) + 'px';
    });
    inputWrapper.appendChild(this._inputEl);

    this._sendBtnEl = document.createElement('button');
    this._sendBtnEl.className = 'chat-send-btn';
    const sendSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    sendSvg.setAttribute('width', '18');
    sendSvg.setAttribute('height', '18');
    sendSvg.setAttribute('viewBox', '0 0 24 24');
    sendSvg.setAttribute('fill', 'none');
    sendSvg.setAttribute('stroke', 'currentColor');
    sendSvg.setAttribute('stroke-width', '2');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '22');
    line.setAttribute('y1', '2');
    line.setAttribute('x2', '11');
    line.setAttribute('y2', '13');
    sendSvg.appendChild(line);
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '22 2 15 22 11 13 2 9 22 2');
    sendSvg.appendChild(polygon);
    this._sendBtnEl.appendChild(sendSvg);
    this._sendBtnEl.addEventListener('click', () => this._sendMessage());
    inputWrapper.appendChild(this._sendBtnEl);

    // Cancel button (hidden by default)
    this._cancelBtnEl = document.createElement('button');
    this._cancelBtnEl.className = 'chat-cancel-btn';
    this._cancelBtnEl.textContent = 'Stop';
    this._cancelBtnEl.style.display = 'none';
    this._cancelBtnEl.addEventListener('click', () => this._cancelRequest());
    inputWrapper.appendChild(this._cancelBtnEl);

    inputArea.appendChild(inputWrapper);

    const hint = document.createElement('div');
    hint.className = 'chat-hint';
    hint.textContent = 'Press Enter to send, Shift+Enter for new line';
    inputArea.appendChild(hint);

    panel.appendChild(inputArea);
    container.appendChild(panel);
  }

  async loadConversation(conversationId: string): Promise<void> {
    this._conversationId = conversationId;
    this._messages = [];
    this._currentAssistantMessage = null;
    this._isProcessing = false;

    try {
      const response = await this._ipc.invoke<{
        conversation: { id: string; title: string };
        messages: Array<{ id: string; role: string; content: string }>;
      }>(IPC_CHANNELS.CONVERSATION_GET, { conversationId });

      // Update header title
      const headerTitle = this._messageListEl?.parentElement?.querySelector('.chat-header h2');
      if (headerTitle) {
        headerTitle.textContent = response.conversation.title;
      }

      // Clear and re-render messages
      this._clearElement(this._messageListEl);

      for (const msg of response.messages) {
        const chatMsg: ChatMessage = {
          id: msg.id,
          role: msg.role as 'user' | 'assistant',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        };
        this._messages.push(chatMsg);
        this._renderMessage(chatMsg);
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
    }
  }

  private _renderWelcome(): void {
    this._clearElement(this._messageListEl);

    const welcome = document.createElement('div');
    welcome.className = 'chat-welcome';

    const heading = document.createElement('h1');
    heading.textContent = 'GHO Work';
    welcome.appendChild(heading);

    const desc = document.createElement('p');
    desc.textContent = 'Your AI-powered office assistant. This is a spike/proof of concept demonstrating the core architecture.';
    welcome.appendChild(desc);

    const suggestions = document.createElement('div');
    suggestions.className = 'chat-welcome-suggestions';

    const prompts = [
      { label: 'Draft an email', prompt: 'Draft an email to the team about the Q1 results' },
      { label: 'Analyze data', prompt: 'Analyze the sales data and find trends' },
      { label: 'Check meetings', prompt: 'What meetings do I have today?' },
      { label: 'Search files', prompt: 'Search for the project roadmap file' },
    ];

    for (const { label, prompt } of prompts) {
      const btn = document.createElement('button');
      btn.className = 'suggestion-btn';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        this._inputEl.value = prompt;
        this._sendMessage();
      });
      suggestions.appendChild(btn);
    }

    welcome.appendChild(suggestions);
    this._messageListEl.appendChild(welcome);
  }

  private async _sendMessage(): Promise<void> {
    const content = this._inputEl.value.trim();
    if (!content || this._isProcessing) {
      return;
    }

    this._isProcessing = true;
    this._sendBtnEl.disabled = true;
    this._sendBtnEl.style.display = 'none';
    this._cancelBtnEl.style.display = '';
    this._inputEl.value = '';
    this._inputEl.style.height = 'auto';

    // Clear welcome on first message
    const welcome = this._messageListEl.querySelector('.chat-welcome');
    if (welcome) {
      welcome.remove();
    }

    // Add user message
    const userMsg: ChatMessage = { id: generateUUID(), role: 'user', content };
    this._messages.push(userMsg);
    this._renderMessage(userMsg);

    // Create a placeholder assistant message for streaming
    this._currentAssistantMessage = {
      id: generateUUID(),
      role: 'assistant',
      content: '',
      toolCalls: [],
      isStreaming: true,
    };
    this._messages.push(this._currentAssistantMessage);
    this._renderMessage(this._currentAssistantMessage);

    // Fire the event
    this._onDidSendMessage.fire({
      conversationId: this._conversationId,
      content,
      model: this._model,
    });

    // Send to main process
    try {
      await this._ipc.invoke(IPC_CHANNELS.AGENT_SEND_MESSAGE, {
        conversationId: this._conversationId,
        content,
        model: this._model,
      });
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  }

  private async _cancelRequest(): Promise<void> {
    try {
      await this._ipc.invoke(IPC_CHANNELS.AGENT_CANCEL, {
        conversationId: this._conversationId,
      });
    } catch (err) {
      console.error('Failed to cancel request:', err);
    }
    this._finishStreaming();
  }

  private _handleAgentEvent(event: AgentEvent): void {
    if (!this._currentAssistantMessage) {
      return;
    }

    switch (event.type) {
      case 'thinking': {
        this._updateAssistantStatus('Thinking...');
        break;
      }
      case 'text_delta': {
        this._currentAssistantMessage.content += event.content;
        this._updateAssistantContent();
        break;
      }
      case 'tool_call_start': {
        this._currentAssistantMessage.toolCalls = this._currentAssistantMessage.toolCalls || [];
        this._currentAssistantMessage.toolCalls.push({
          id: event.toolCall.id,
          name: event.toolCall.toolName,
          status: 'running',
        });
        this._updateAssistantToolCalls();
        break;
      }
      case 'tool_call_result': {
        if (this._currentAssistantMessage.toolCalls?.length) {
          // Match tool call by ID, not just last in array
          const toolCall = this._currentAssistantMessage.toolCalls.find(
            (tc) => tc.id === event.toolCallId,
          );
          if (toolCall) {
            toolCall.status = event.result.success ? 'completed' : 'failed';
          }
          this._updateAssistantToolCalls();
        }
        break;
      }
      case 'error': {
        this._currentAssistantMessage.content += `\n\n**Error:** ${event.error}`;
        this._updateAssistantContent();
        this._finishStreaming();
        break;
      }
      case 'done': {
        this._finishStreaming();
        break;
      }
    }
  }

  private _finishStreaming(): void {
    if (this._currentAssistantMessage) {
      this._currentAssistantMessage.isStreaming = false;
      this._updateAssistantContent();
      this._updateAssistantStatus('');
    }
    this._currentAssistantMessage = null;
    this._isProcessing = false;
    this._sendBtnEl.disabled = false;
    this._sendBtnEl.style.display = '';
    this._cancelBtnEl.style.display = 'none';
    this._inputEl.focus();
  }

  private _renderMessage(msg: ChatMessage): void {
    const el = document.createElement('div');
    el.className = `chat-message chat-message-${msg.role}`;
    el.id = `msg-${msg.id}`;

    const avatar = document.createElement('div');
    avatar.className = 'chat-avatar';
    avatar.textContent = msg.role === 'user' ? 'U' : 'A';
    el.appendChild(avatar);

    const body = document.createElement('div');
    body.className = 'chat-message-body';

    const roleLabel = document.createElement('div');
    roleLabel.className = 'chat-role-label';
    roleLabel.textContent = msg.role === 'user' ? 'You' : 'GHO Work';
    body.appendChild(roleLabel);

    // Tool calls section
    const toolCallsEl = document.createElement('div');
    toolCallsEl.className = 'chat-tool-calls';
    body.appendChild(toolCallsEl);

    // Content
    const contentEl = document.createElement('div');
    contentEl.className = 'chat-message-content';
    if (msg.role === 'user') {
      // User messages rendered as plain text (safe)
      contentEl.textContent = msg.content;
    } else if (msg.content) {
      // Assistant messages rendered as sanitized markdown
      // DOMPurify.sanitize() removes all XSS vectors before DOM insertion
      this._setSanitizedMarkdown(contentEl, msg.content);
    }
    if (msg.isStreaming && !msg.content) {
      const indicator = document.createElement('span');
      indicator.className = 'chat-typing-indicator';
      contentEl.appendChild(indicator);
    }
    body.appendChild(contentEl);

    // Status
    const statusEl = document.createElement('div');
    statusEl.className = 'chat-message-status';
    body.appendChild(statusEl);

    el.appendChild(body);
    this._messageListEl.appendChild(el);
    this._scrollToBottom();
  }

  /**
   * Renders markdown content into an element using marked + DOMPurify.
   * All output is sanitized to prevent XSS attacks.
   */
  private _setSanitizedMarkdown(el: Element, markdownText: string): void {
    const rawHtml = marked.parse(markdownText) as string;
    const cleanHtml = DOMPurify.sanitize(rawHtml);
    // Safe: DOMPurify.sanitize() strips all dangerous content
    el.innerHTML = cleanHtml;
  }

  private _updateAssistantContent(): void {
    if (!this._currentAssistantMessage) {
      return;
    }
    const el = document.getElementById(`msg-${this._currentAssistantMessage.id}`);
    if (!el) {
      return;
    }
    const contentEl = el.querySelector('.chat-message-content');
    if (contentEl) {
      // Sanitize markdown output with DOMPurify
      this._setSanitizedMarkdown(contentEl, this._currentAssistantMessage.content);
      if (this._currentAssistantMessage.isStreaming) {
        const cursor = document.createElement('span');
        cursor.className = 'chat-cursor';
        contentEl.appendChild(cursor);
      }
    }
    this._scrollToBottom();
  }

  private _updateAssistantStatus(status: string): void {
    if (!this._currentAssistantMessage) {
      return;
    }
    const el = document.getElementById(`msg-${this._currentAssistantMessage.id}`);
    if (!el) {
      return;
    }
    const statusEl = el.querySelector('.chat-message-status');
    if (statusEl) {
      statusEl.textContent = status;
    }
  }

  private _updateAssistantToolCalls(): void {
    if (!this._currentAssistantMessage) {
      return;
    }
    const el = document.getElementById(`msg-${this._currentAssistantMessage.id}`);
    if (!el) {
      return;
    }
    const toolCallsEl = el.querySelector('.chat-tool-calls');
    if (toolCallsEl && this._currentAssistantMessage.toolCalls?.length) {
      this._clearElement(toolCallsEl);
      for (const tc of this._currentAssistantMessage.toolCalls) {
        const item = document.createElement('div');
        item.className = `tool-call-item tool-call-${tc.status}`;

        const icon = document.createElement('span');
        icon.className = 'tool-call-icon';
        icon.textContent = tc.status === 'running' ? '...' : tc.status === 'failed' ? 'x' : '+';
        item.appendChild(icon);

        const name = document.createElement('span');
        name.className = 'tool-call-name';
        name.textContent = tc.name;
        item.appendChild(name);

        const statusSpan = document.createElement('span');
        statusSpan.className = 'tool-call-status';
        statusSpan.textContent = tc.status;
        item.appendChild(statusSpan);

        toolCallsEl.appendChild(item);
      }
    }
  }

  private _clearElement(el: Element): void {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  private _scrollToBottom(): void {
    this._messageListEl.scrollTop = this._messageListEl.scrollHeight;
  }
}
