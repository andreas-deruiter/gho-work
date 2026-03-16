/**
 * Chat panel — the primary interaction UI.
 * VS Code-style direct DOM manipulation with event-driven updates.
 * Uses marked for markdown rendering and DOMPurify for XSS prevention.
 *
 * Assistant messages use a parts-based rendering model: an ordered sequence of
 * text segments and inline tool-call widgets, similar to VS Code Copilot Chat.
 * Tool calls appear between text segments so the user can see tool invocations
 * in context as the response streams.
 */
import { Disposable, Emitter, generateUUID, MutableDisposable } from '@gho-work/base';
import type { Event, AgentEvent } from '@gho-work/base';
import type { IIPCRenderer, FileEntry } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import { ModelSelector } from './modelSelector.js';
import { ChatThinkingSection } from './chatThinkingSection.js';
import { ChatStreamManager } from './chatStreamManager.js';
import {
  type ChatMessage,
  renderMessage,
  renderWelcomeScreen,
  createHelpMessage,
  createErrorBanner,
  setSanitizedMarkdown,
  clearElement,
} from './chatMessageRenderer.js';

export interface SendMessageEvent {
  conversationId: string;
  content: string;
  model: string;
  attachments?: Array<{ name: string; path: string }>;
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
  private readonly _streamManager = new ChatStreamManager();

  private _modelSelector!: ModelSelector;
  private _conversationId: string = generateUUID();
  private _model: string = '';

  private _attachments: Array<{ type: 'file'; path: string; displayName: string }> = [];
  private _attachmentListEl!: HTMLElement;
  private _slashDropdownEl!: HTMLElement;

  private readonly _onDidSendMessage = this._register(new Emitter<SendMessageEvent>());
  readonly onDidSendMessage: Event<SendMessageEvent> = this._onDidSendMessage.event;

  private readonly _onDidFinishResponse = this._register(new Emitter<void>());
  readonly onDidFinishResponse: Event<void> = this._onDidFinishResponse.event;

  private readonly _onDidChangeAttachments = this._register(new Emitter<Array<{ name: string; path: string; size: number }>>());
  readonly onDidChangeAttachments: Event<Array<{ name: string; path: string; size: number }>> = this._onDidChangeAttachments.event;

  get modelSelector(): ModelSelector {
    return this._modelSelector;
  }

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
    clearElement(container);

    // Header with inline-editable title — rendered outside chat-panel so it spans full width
    const header = document.createElement('div');
    header.className = 'chat-header';

    const headerTitle = document.createElement('h2');
    headerTitle.className = 'chat-header-title';
    headerTitle.textContent = 'New Conversation';
    headerTitle.title = 'Click to rename';
    headerTitle.addEventListener('click', () => this._startTitleEdit(headerTitle));
    header.appendChild(headerTitle);

    container.appendChild(header);

    // Panel wrapper (max-width constrained)
    const panel = document.createElement('div');
    panel.className = 'chat-panel';

    // Model selector (will be placed below the input area)
    this._modelSelector = this._register(new ModelSelector());
    this._modelSelector.onDidSelectModel((modelId) => {
      this._model = modelId;
      void this._ipc.invoke(IPC_CHANNELS.MODEL_SELECT, { modelId });
    });

    // Load models from main process
    void this._loadModels();

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

    // Footer row: model selector (left) + hint (right)
    const inputFooter = document.createElement('div');
    inputFooter.className = 'chat-input-footer';

    const modelSelectorContainer = document.createElement('div');
    modelSelectorContainer.className = 'chat-input-model';
    this._modelSelector.render(modelSelectorContainer);
    inputFooter.appendChild(modelSelectorContainer);

    const hint = document.createElement('div');
    hint.className = 'chat-hint';
    hint.textContent = 'Press Enter to send, Shift+Enter for new line';
    inputFooter.appendChild(hint);

    inputArea.appendChild(inputFooter);

    panel.appendChild(inputArea);
    container.appendChild(panel);
  }

  private async _loadModels(): Promise<void> {
    try {
      const response = await this._ipc.invoke<{
        models: Array<{ id: string; name: string; provider: string }>;
        error?: string;
      }>(IPC_CHANNELS.MODEL_LIST);
      if (response.error) {
        console.error('[chatPanel] Model list error from SDK:', response.error);
      }
      this._modelSelector.setModels(response.models);
    } catch (err) {
      console.error('Failed to load models:', err);
    }
  }

  private _startTitleEdit(titleEl: HTMLElement): void {
    if (titleEl.querySelector('input')) { return; } // already editing

    const currentText = titleEl.textContent ?? '';
    titleEl.textContent = '';
    titleEl.classList.add('editing');

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'chat-header-title-input';
    input.value = currentText;

    // Size input to content
    const sizeToContent = () => {
      input.style.width = '0';
      input.style.width = `${Math.max(input.scrollWidth + 2, 40)}px`;
    };
    input.addEventListener('input', sizeToContent);

    titleEl.appendChild(input);
    sizeToContent();
    input.focus();
    input.select();

    const commit = () => {
      const newTitle = input.value.trim() || currentText;
      titleEl.textContent = newTitle;
      titleEl.classList.remove('editing');
      if (newTitle !== currentText) {
        void this._ipc.invoke(IPC_CHANNELS.CONVERSATION_RENAME, {
          conversationId: this._conversationId,
          title: newTitle,
        });
      }
    };

    const cancel = () => {
      titleEl.textContent = currentText;
      titleEl.classList.remove('editing');
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') {
        input.removeEventListener('blur', commit);
        cancel();
      }
    });
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

      // Update header title (header is sibling of chat-panel in the container)
      const container = this._messageListEl?.parentElement?.parentElement;
      const headerTitle = container?.querySelector('.chat-header-title');
      if (headerTitle) {
        headerTitle.textContent = response.conversation.title;
      }

      // Clear and re-render messages
      clearElement(this._messageListEl);

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

  async refreshTitle(): Promise<void> {
    try {
      const response = await this._ipc.invoke<{
        conversation: { id: string; title: string };
        messages: Array<{ id: string; role: string; content: string }>;
      }>(IPC_CHANNELS.CONVERSATION_GET, { conversationId: this._conversationId });

      const container = this._messageListEl?.parentElement?.parentElement;
      const headerTitle = container?.querySelector('.chat-header-title');
      if (headerTitle) {
        headerTitle.textContent = response.conversation.title;
      }
    } catch (err) {
      console.warn('Failed to refresh title:', err);
    }
  }

  private _renderWelcome(): void {
    clearElement(this._messageListEl);
    const welcome = renderWelcomeScreen((prompt) => {
      this._inputEl.value = prompt;
      void this._sendMessage();
    });
    this._messageListEl.appendChild(welcome);
  }

  scrollToMessage(messageId: string): void {
    const msgEl = this._messageListEl.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement | null;
    if (msgEl) {
      msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      msgEl.classList.add('chat-message--highlighted');
      setTimeout(() => msgEl.classList.remove('chat-message--highlighted'), 2000);
    }
  }

  /** Programmatically send a message (e.g., auto-kickoff for install conversations). */
  async sendMessage(content: string): Promise<void> {
    this._inputEl.value = content;
    await this._sendMessage();
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

    // Add user message (capture current attachments for display)
    const msgAttachments = this._attachments.length > 0
      ? this._attachments.map(a => ({ name: a.displayName, path: a.path }))
      : undefined;
    const userMsg: ChatMessage = { id: generateUUID(), role: 'user', content, attachments: msgAttachments };
    this._messages.push(userMsg);
    this._renderMessage(userMsg);

    // Reset parts-based state for the new assistant message
    this._streamManager.reset();
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

    // Create thinking section for this message (for extended thinking text only)
    const thinkingSection = new ChatThinkingSection();
    this._currentThinkingSection.value = thinkingSection; // auto-disposes previous
    const msgEl = document.getElementById(`msg-${this._currentAssistantMessage.id}`);
    const partsContainer = msgEl?.querySelector('.chat-message-parts');
    if (partsContainer) {
      partsContainer.appendChild(thinkingSection.getDomNode());
    }
    thinkingSection.setActive(true);

    // Fire the event (capture attachments before they're cleared)
    const currentAttachments = this._attachments.length > 0
      ? this._attachments.map(a => ({ name: a.displayName, path: a.path }))
      : undefined;
    this._onDidSendMessage.fire({
      conversationId: this._conversationId,
      content,
      model: this._model,
      attachments: currentAttachments,
    });

    // Send to main process
    try {
      await this._ipc.invoke(IPC_CHANNELS.AGENT_SEND_MESSAGE, {
        conversationId: this._conversationId,
        content,
        model: this._model,
        attachments: this._attachments.length > 0
          ? this._attachments.map(a => ({ name: a.displayName, path: a.path, size: 0 }))
          : undefined,
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
        this._scrollToBottom();
        break;
      }
      case 'thinking_delta': {
        this._currentThinkingSection.value?.setActive(true);
        this._currentThinkingSection.value?.appendThinkingText(event.content);
        this._scrollToBottom();
        break;
      }
      case 'text_delta': {
        this._currentAssistantMessage.content += event.content;
        this._streamManager.appendTextDelta(event.content, this._getPartsContainer());
        this._scrollToBottom();
        break;
      }
      case 'tool_call_start': {
        // Show tool calls only in the thinking section
        this._currentThinkingSection.value?.addToolCall(
          event.toolCall.id,
          event.toolCall.toolName,
        );
        this._scrollToBottom();
        break;
      }
      case 'tool_call_result': {
        const state = event.result.success ? 'completed' : 'failed';
        this._currentThinkingSection.value?.updateToolCall(event.toolCallId, state);
        this._scrollToBottom();
        break;
      }
      case 'error': {
        this._showErrorBanner(event.error);
        this._finishStreaming();
        break;
      }
      case 'skill_invoked': {
        this._currentThinkingSection.value?.addSkillInvocation(event.skillName, event.state);
        this._scrollToBottom();
        break;
      }
      case 'subagent_started': {
        this._currentThinkingSection.value?.addSubagent(event.subagentId, event.subagentName);
        this._scrollToBottom();
        break;
      }
      case 'subagent_completed': {
        this._currentThinkingSection.value?.updateSubagent(event.subagentId, event.state);
        this._scrollToBottom();
        break;
      }
      case 'done': {
        this._finishStreaming();
        break;
      }
    }
  }

  /** Gets the parts container for the current assistant message. */
  private _getPartsContainer(): HTMLElement | null {
    if (!this._currentAssistantMessage) {
      return null;
    }
    const msgEl = document.getElementById(`msg-${this._currentAssistantMessage.id}`);
    return msgEl?.querySelector('.chat-message-parts') as HTMLElement | null;
  }

  private _finishStreaming(): void {
    if (this._currentAssistantMessage) {
      this._currentAssistantMessage.isStreaming = false;
      // Final render of the last text part (removes cursor)
      this._streamManager.finishRendering(this._getPartsContainer());
    }
    this._currentThinkingSection.value?.setActive(false);
    // Belt-and-suspenders: ensure no thinking section in the DOM stays active
    // (guards against race conditions between IPC events and DOM updates)
    for (const el of this._messageListEl.querySelectorAll('.chat-thinking-section.thinking-active')) {
      el.classList.remove('thinking-active');
    }
    // Don't clear the MutableDisposable — the section stays in the DOM for scrollback.
    // It will be disposed when the next message creates a new section.
    this._currentAssistantMessage = null;
    this._isProcessing = false;
    this._sendBtnEl.disabled = false;
    this._sendBtnEl.style.display = '';
    this._cancelBtnEl.style.display = 'none';
    this._inputEl.focus();
    this._onDidFinishResponse.fire();
  }

  private _renderMessage(msg: ChatMessage): void {
    const el = renderMessage(msg, (elem, text) => setSanitizedMarkdown(elem, text));
    this._messageListEl.appendChild(el);
    this._scrollToBottom();
  }

  showError(message: string): void {
    this._showErrorBanner(message);
  }

  private _showErrorBanner(message: string): void {
    this._dismissErrorBanner();
    const banner = createErrorBanner(message, () => this._dismissErrorBanner());
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

  addAttachment(entry: FileEntry): void {
    if (this._attachments.some(a => a.path === entry.path)) { return; }
    this._attachments.push({ type: 'file', path: entry.path, displayName: entry.name });
    this._renderAttachments();
    this._onDidChangeAttachments.fire(
      this._attachments.map(a => ({ name: a.displayName, path: a.path, size: 0 }))
    );
  }

  removeAttachment(path: string): void {
    this._attachments = this._attachments.filter(a => a.path !== path);
    this._renderAttachments();
    this._onDidChangeAttachments.fire(
      this._attachments.map(a => ({ name: a.displayName, path: a.path, size: 0 }))
    );
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
    clearElement(this._attachmentListEl);
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
        clearElement(this._slashDropdownEl);
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
    const helpMsg = createHelpMessage();
    this._messages.push(helpMsg);
    this._renderMessage(helpMsg);
  }

  private _scrollToBottom(): void {
    this._messageListEl.scrollTop = this._messageListEl.scrollHeight;
  }
}
