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
import { Disposable, DisposableStore, Emitter, generateUUID, MutableDisposable } from '@gho-work/base';
import type { Event, AgentEvent } from '@gho-work/base';
import type { IIPCRenderer, FileEntry } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import { ModelSelector } from './modelSelector.js';
import { ChatThinkingSection } from './chatThinkingSection.js';
import { ChatToolCallItem } from './chatToolCallItem.js';
import { renderChatMarkdown } from './chatMarkdownRenderer.js';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{ id: string; name: string; status: string }>;
  isStreaming?: boolean;
  attachments?: Array<{ name: string; path: string }>;
}

/** A content part in the assistant response stream. */
type ContentPart =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; toolCallId: string; toolName: string };

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

  /** Ordered content parts for the current streaming assistant message. */
  private _contentParts: ContentPart[] = [];
  /** Inline tool call widgets keyed by toolCallId. */
  private _inlineToolCalls = new Map<string, ChatToolCallItem>();
  /** Disposable store for inline tool call widgets (cleared per message). */
  private _inlineToolCallDisposables = this._register(new DisposableStore());

  private _modelSelector!: ModelSelector;
  private _conversationId: string = generateUUID();
  private _model: string = 'gpt-4o';

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
    this._clearElement(container);

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
    this._contentParts = [];
    this._inlineToolCallDisposables.clear();
    this._inlineToolCalls.clear();

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
        this._appendTextDelta(event.content);
        break;
      }
      case 'tool_call_start': {
        // Also add to thinking section for the collapsed summary count
        this._currentThinkingSection.value?.addToolCall(
          event.toolCall.id,
          event.toolCall.toolName,
        );
        // Add inline tool call widget in the message flow
        this._addInlineToolCall(event.toolCall.id, event.toolCall.toolName);
        this._scrollToBottom();
        break;
      }
      case 'tool_call_result': {
        const state = event.result.success ? 'completed' : 'failed';
        this._currentThinkingSection.value?.updateToolCall(event.toolCallId, state);
        // Update inline widget too
        const inlineItem = this._inlineToolCalls.get(event.toolCallId);
        if (inlineItem) {
          inlineItem.setState(state);
        }
        this._scrollToBottom();
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

  /**
   * Appends a text delta to the current assistant message parts.
   * If the last part is text, appends to it. Otherwise creates a new text part.
   * Only re-renders the last text segment's DOM for efficiency.
   */
  private _appendTextDelta(delta: string): void {
    const lastPart = this._contentParts[this._contentParts.length - 1];
    if (lastPart && lastPart.type === 'text') {
      lastPart.content += delta;
    } else {
      this._contentParts.push({ type: 'text', content: delta });
      // Create a new text segment DOM element
      this._appendTextPartDom();
    }
    this._updateLastTextPart();
  }

  /**
   * Adds an inline tool call widget to the message flow.
   * Creates a tool_call content part and inserts the widget DOM.
   */
  private _addInlineToolCall(toolCallId: string, toolName: string): void {
    this._contentParts.push({ type: 'tool_call', toolCallId, toolName });

    const item = new ChatToolCallItem(toolCallId, toolName, 'executing');
    this._inlineToolCallDisposables.add(item);
    this._inlineToolCalls.set(toolCallId, item);

    // Wrap in an inline container for styling
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-inline-tool-call';
    wrapper.dataset.toolCallId = toolCallId;
    wrapper.appendChild(item.getDomNode());

    const partsContainer = this._getPartsContainer();
    if (partsContainer) {
      partsContainer.appendChild(wrapper);
    }
  }

  /** Creates a new empty text segment DOM element in the parts container. */
  private _appendTextPartDom(): void {
    const partsContainer = this._getPartsContainer();
    if (!partsContainer) {
      return;
    }
    const textEl = document.createElement('div');
    textEl.className = 'chat-message-content';
    partsContainer.appendChild(textEl);
  }

  /** Re-renders only the last text segment with updated markdown content. */
  private _updateLastTextPart(): void {
    const partsContainer = this._getPartsContainer();
    if (!partsContainer) {
      return;
    }

    // Find the last .chat-message-content element
    const textEls = partsContainer.querySelectorAll('.chat-message-content');
    const lastTextEl = textEls[textEls.length - 1];
    if (!lastTextEl) {
      return;
    }

    // Find the corresponding text part
    const textParts = this._contentParts.filter(p => p.type === 'text');
    const lastTextPart = textParts[textParts.length - 1];
    if (!lastTextPart || lastTextPart.type !== 'text') {
      return;
    }

    const isStreaming = this._currentAssistantMessage?.isStreaming ?? false;
    renderChatMarkdown(lastTextEl, lastTextPart.content, { isStreaming });
    if (isStreaming) {
      const cursor = document.createElement('span');
      cursor.className = 'chat-cursor';
      lastTextEl.appendChild(cursor);
    }
    this._scrollToBottom();
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
      this._updateLastTextPart();
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
    this._onDidFinishResponse.fire();
  }

  private _renderMessage(msg: ChatMessage): void {
    const el = document.createElement('div');
    el.className = `chat-message chat-message-${msg.role}`;
    el.id = `msg-${msg.id}`;

    const body = document.createElement('div');
    body.className = 'chat-message-body';

    if (msg.role === 'user') {
      // User messages: show attached files above the bubble, right-aligned
      if (msg.attachments && msg.attachments.length > 0) {
        const attachedContext = document.createElement('div');
        attachedContext.className = 'chat-attached-context';
        for (const att of msg.attachments) {
          const pill = document.createElement('span');
          pill.className = 'chat-attached-context-pill';
          pill.textContent = att.name;
          pill.title = att.path;
          attachedContext.appendChild(pill);
        }
        body.appendChild(attachedContext);
      }

      // User content in a bubble
      const bubbleEl = document.createElement('div');
      bubbleEl.className = 'chat-user-bubble';
      bubbleEl.textContent = msg.content;
      body.appendChild(bubbleEl);
    } else {
      // Assistant messages: role label + parts container (thinking + inline tool calls + text)
      const roleLabel = document.createElement('div');
      roleLabel.className = 'chat-role-label';
      roleLabel.textContent = 'GHO Work';
      body.appendChild(roleLabel);

      // Parts container: thinking section, inline tool calls, and text segments
      // are all appended here in order as events stream in
      const partsEl = document.createElement('div');
      partsEl.className = 'chat-message-parts';
      body.appendChild(partsEl);

      // For non-streaming messages (loaded from history), render content directly
      if (!msg.isStreaming && msg.content) {
        const contentEl = document.createElement('div');
        contentEl.className = 'chat-message-content';
        this._setSanitizedMarkdown(contentEl, msg.content);
        partsEl.appendChild(contentEl);
      }

      // Typing indicator for empty streaming messages
      if (msg.isStreaming && !msg.content) {
        const indicator = document.createElement('span');
        indicator.className = 'chat-typing-indicator';
        partsEl.appendChild(indicator);
      }

      // Status
      const statusEl = document.createElement('div');
      statusEl.className = 'chat-message-status';
      body.appendChild(statusEl);
    }

    el.appendChild(body);
    this._messageListEl.appendChild(el);
    this._scrollToBottom();
  }

  /**
   * Renders markdown content into an element using renderChatMarkdown (marked + highlight.js + DOMPurify).
   * All output is sanitized to prevent XSS attacks.
   */
  private _setSanitizedMarkdown(el: Element, markdownText: string, isStreaming = false): void {
    renderChatMarkdown(el, markdownText, { isStreaming });
  }

  showError(message: string): void {
    this._showErrorBanner(message);
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
