/**
 * Chat panel — the primary interaction UI.
 * VS Code-style direct DOM manipulation with event-driven updates.
 * Uses marked for markdown rendering and DOMPurify for XSS prevention.
 */
import { Disposable, Emitter, generateUUID, MutableDisposable } from '@gho-work/base';
import type { Event, AgentEvent } from '@gho-work/base';
import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import { ModelSelector } from './modelSelector.js';
import { ChatThinkingSection } from './chatThinkingSection.js';
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
  private readonly _currentThinkingSection = this._register(new MutableDisposable<ChatThinkingSection>());

  private _modelSelector!: ModelSelector;
  private _conversationId: string = generateUUID();
  private _model: string = 'gpt-4o';

  private _attachments: Array<{ type: 'file'; path: string; displayName: string }> = [];
  private _attachmentListEl!: HTMLElement;
  private _slashDropdownEl!: HTMLElement;

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

    const modelSelectorContainer = document.createElement('div');
    this._modelSelector = this._register(new ModelSelector());
    this._modelSelector.render(modelSelectorContainer);
    this._modelSelector.onDidSelectModel((modelId) => {
      this._model = modelId;
      void this._ipc.invoke(IPC_CHANNELS.MODEL_SELECT, { modelId });
    });
    header.appendChild(modelSelectorContainer);

    // Load models from main process
    void this._loadModels();

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

    // File drag-and-drop
    this._attachments = [];
    this._attachmentListEl = document.createElement('div');
    this._attachmentListEl.className = 'chat-attachments';
    inputArea.appendChild(this._attachmentListEl);

    inputWrapper.addEventListener('dragover', (e) => {
      e.preventDefault();
      inputWrapper.classList.add('drag-over');
    });

    inputWrapper.addEventListener('dragleave', () => {
      inputWrapper.classList.remove('drag-over');
    });

    inputWrapper.addEventListener('drop', (e) => {
      e.preventDefault();
      inputWrapper.classList.remove('drag-over');
      if (e.dataTransfer?.files) {
        for (const file of Array.from(e.dataTransfer.files)) {
          this._addAttachment(file);
        }
      }
    });

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
    this._inputEl.addEventListener('input', () => {
      this._updateSlashDropdown();
    });
    inputWrapper.appendChild(this._inputEl);

    this._slashDropdownEl = document.createElement('div');
    this._slashDropdownEl.className = 'slash-dropdown';
    this._slashDropdownEl.style.display = 'none';
    inputWrapper.appendChild(this._slashDropdownEl);

    this._sendBtnEl = document.createElement('button');
    this._sendBtnEl.className = 'chat-send-btn';
    const sendSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    sendSvg.setAttribute('width', '14');
    sendSvg.setAttribute('height', '14');
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

    // Cancel button — same position/size as send button, swap via display
    this._cancelBtnEl = document.createElement('button');
    this._cancelBtnEl.className = 'chat-cancel-btn';
    this._cancelBtnEl.title = 'Stop';
    const stopSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    stopSvg.setAttribute('width', '14');
    stopSvg.setAttribute('height', '14');
    stopSvg.setAttribute('viewBox', '0 0 24 24');
    stopSvg.setAttribute('fill', 'currentColor');
    const stopRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    stopRect.setAttribute('x', '6');
    stopRect.setAttribute('y', '6');
    stopRect.setAttribute('width', '12');
    stopRect.setAttribute('height', '12');
    stopRect.setAttribute('rx', '2');
    stopSvg.appendChild(stopRect);
    this._cancelBtnEl.appendChild(stopSvg);
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

  private async _loadModels(): Promise<void> {
    try {
      const response = await this._ipc.invoke<{
        models: Array<{ id: string; name: string; provider: string }>;
      }>(IPC_CHANNELS.MODEL_LIST);
      this._modelSelector.setModels(response.models);
    } catch (err) {
      console.error('Failed to load models:', err);
    }
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

    // Create thinking section for this message
    const thinkingSection = new ChatThinkingSection();
    this._currentThinkingSection.value = thinkingSection; // auto-disposes previous
    const msgEl = document.getElementById(`msg-${this._currentAssistantMessage.id}`);
    const toolCallsEl = msgEl?.querySelector('.chat-tool-calls');
    if (toolCallsEl) {
      toolCallsEl.appendChild(thinkingSection.getDomNode());
    }
    thinkingSection.setActive(true);

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
        attachments: this._attachments.length > 0 ? this._attachments : undefined,
      });
      // Clear attachments after send
      this._attachments = [];
      this._renderAttachments();
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
        this._currentThinkingSection.value?.setActive(true);
        break;
      }
      case 'thinking_delta': {
        this._currentThinkingSection.value?.appendThinkingText(event.content);
        break;
      }
      case 'text_delta': {
        this._currentAssistantMessage.content += event.content;
        this._updateAssistantContent();
        break;
      }
      case 'tool_call_start': {
        this._currentThinkingSection.value?.addToolCall(
          event.toolCall.id,
          event.toolCall.toolName,
        );
        break;
      }
      case 'tool_call_result': {
        const state = event.result.success ? 'completed' : 'failed';
        this._currentThinkingSection.value?.updateToolCall(event.toolCallId, state);
        break;
      }
      case 'error': {
        this._showErrorBanner(event.error);
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
    }
    this._currentThinkingSection.value?.setActive(false);
    // Don't clear the MutableDisposable — the section stays in the DOM for scrollback.
    // It will be disposed when the next message creates a new section.
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

  private _showErrorBanner(message: string): void {
    this._dismissErrorBanner();

    const banner = document.createElement('div');
    banner.className = 'chat-error-banner';

    const text = document.createElement('span');
    text.textContent = message;
    banner.appendChild(text);

    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'chat-error-dismiss';
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.addEventListener('click', () => this._dismissErrorBanner());
    banner.appendChild(dismissBtn);

    const panel = this._messageListEl?.parentElement;
    const inputArea = panel?.querySelector('.chat-input-area');
    if (panel && inputArea) {
      panel.insertBefore(banner, inputArea);
    }
  }

  private _dismissErrorBanner(): void {
    const existing = this._messageListEl?.parentElement?.querySelector('.chat-error-banner');
    if (existing) { existing.remove(); }
  }

  private _addAttachment(file: File): void {
    const attachment = {
      type: 'file' as const,
      path: (file as any).path ?? file.name,
      displayName: file.name,
    };
    this._attachments.push(attachment);
    this._renderAttachments();
  }

  private _renderAttachments(): void {
    while (this._attachmentListEl.firstChild) {
      this._attachmentListEl.removeChild(this._attachmentListEl.firstChild);
    }
    for (let i = 0; i < this._attachments.length; i++) {
      const pill = document.createElement('span');
      pill.className = 'attachment-pill';

      const name = document.createElement('span');
      name.textContent = this._attachments[i].displayName;
      pill.appendChild(name);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'attachment-remove';
      removeBtn.textContent = 'x';
      const index = i;
      removeBtn.addEventListener('click', () => {
        this._attachments.splice(index, 1);
        this._renderAttachments();
      });
      pill.appendChild(removeBtn);

      this._attachmentListEl.appendChild(pill);
    }
  }

  private _updateSlashDropdown(): void {
    const value = this._inputEl.value;
    if (value.startsWith('/') && !value.includes(' ')) {
      const query = value.substring(1).toLowerCase();
      const commands = [
        { name: '/model', description: 'Switch model' },
        { name: '/clear', description: 'Clear conversation' },
        { name: '/help', description: 'Show help' },
      ].filter((c) => c.name.includes(query) || query === '');

      if (commands.length > 0) {
        while (this._slashDropdownEl.firstChild) {
          this._slashDropdownEl.removeChild(this._slashDropdownEl.firstChild);
        }
        for (const cmd of commands) {
          const item = document.createElement('div');
          item.className = 'slash-dropdown-item';

          const nameEl = document.createElement('span');
          nameEl.className = 'slash-command-name';
          nameEl.textContent = cmd.name;
          item.appendChild(nameEl);

          const descEl = document.createElement('span');
          descEl.className = 'slash-command-desc';
          descEl.textContent = cmd.description;
          item.appendChild(descEl);

          item.addEventListener('click', () => {
            this._executeSlashCommand(cmd.name);
          });
          this._slashDropdownEl.appendChild(item);
        }
        this._slashDropdownEl.style.display = '';
        return;
      }
    }
    this._slashDropdownEl.style.display = 'none';
  }

  private _executeSlashCommand(command: string): void {
    this._slashDropdownEl.style.display = 'none';
    this._inputEl.value = '';

    switch (command) {
      case '/clear':
        this._messages = [];
        this._renderWelcome();
        break;
      case '/help':
        this._showHelpMessage();
        break;
      case '/model':
        this._modelSelector?.focus();
        break;
    }
  }

  private _showHelpMessage(): void {
    const helpMsg: ChatMessage = {
      id: generateUUID(),
      role: 'assistant',
      content: '**Available commands:**\n- `/model` — Switch the AI model\n- `/clear` — Clear the conversation\n- `/help` — Show this help message\n\n**Keyboard shortcuts:**\n- `Enter` — Send message\n- `Shift+Enter` — New line\n- `Cmd+B` — Toggle sidebar\n- `Cmd+N` — New conversation',
    };
    this._messages.push(helpMsg);
    this._renderMessage(helpMsg);
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
