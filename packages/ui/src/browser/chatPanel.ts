/**
 * Chat panel — the primary interaction UI.
 * VS Code-style direct DOM manipulation with event-driven updates.
 */
import { DisposableStore, generateUUID } from '@gho-work/base';
import type { AgentEvent } from '@gho-work/base';
import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{ name: string; status: string }>;
  isStreaming?: boolean;
}

export class ChatPanel {
  private disposables = new DisposableStore();
  private messages: ChatMessage[] = [];
  private messageListEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private sendBtnEl!: HTMLButtonElement;
  private isProcessing = false;
  private currentAssistantMessage: ChatMessage | null = null;

  constructor(private ipc: IIPCRenderer) {
    // Listen for agent events from main process
    this.ipc.on(IPC_CHANNELS.AGENT_EVENT, (...args: unknown[]) => {
      const event = args[0] as AgentEvent;
      this.handleAgentEvent(event);
    });
  }

  render(container: HTMLElement): void {
    container.innerHTML = '';

    // Panel wrapper
    const panel = document.createElement('div');
    panel.className = 'chat-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'chat-header';
    header.innerHTML = `
      <h2>New Conversation</h2>
      <span class="chat-model-badge">Mock Agent (Spike)</span>
    `;
    panel.appendChild(header);

    // Message list
    this.messageListEl = document.createElement('div');
    this.messageListEl.className = 'chat-messages';
    this.renderWelcome();
    panel.appendChild(this.messageListEl);

    // Input area
    const inputArea = document.createElement('div');
    inputArea.className = 'chat-input-area';

    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'chat-input-wrapper';

    this.inputEl = document.createElement('textarea');
    this.inputEl.className = 'chat-input';
    this.inputEl.placeholder =
      'Ask GHO Work anything... (try "draft an email" or "analyze my data")';
    this.inputEl.rows = 1;
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    this.inputEl.addEventListener('input', () => {
      // Auto-resize
      this.inputEl.style.height = 'auto';
      this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 150) + 'px';
    });
    inputWrapper.appendChild(this.inputEl);

    this.sendBtnEl = document.createElement('button');
    this.sendBtnEl.className = 'chat-send-btn';
    this.sendBtnEl.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg>
    `;
    this.sendBtnEl.addEventListener('click', () => this.sendMessage());
    inputWrapper.appendChild(this.sendBtnEl);

    inputArea.appendChild(inputWrapper);

    const hint = document.createElement('div');
    hint.className = 'chat-hint';
    hint.textContent = 'Press Enter to send, Shift+Enter for new line';
    inputArea.appendChild(hint);

    panel.appendChild(inputArea);
    container.appendChild(panel);
  }

  private renderWelcome(): void {
    this.messageListEl.innerHTML = `
      <div class="chat-welcome">
        <h1>GHO Work</h1>
        <p>Your AI-powered office assistant. This is a spike/proof of concept demonstrating the core architecture.</p>
        <div class="chat-welcome-suggestions">
          <button class="suggestion-btn" data-prompt="Draft an email to the team about the Q1 results">Draft an email</button>
          <button class="suggestion-btn" data-prompt="Analyze the sales data and find trends">Analyze data</button>
          <button class="suggestion-btn" data-prompt="What meetings do I have today?">Check meetings</button>
          <button class="suggestion-btn" data-prompt="Search for the project roadmap file">Search files</button>
        </div>
      </div>
    `;

    // Wire up suggestion buttons
    this.messageListEl.querySelectorAll('.suggestion-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const prompt = (btn as HTMLElement).dataset.prompt;
        if (prompt) {
          this.inputEl.value = prompt;
          this.sendMessage();
        }
      });
    });
  }

  private async sendMessage(): Promise<void> {
    const content = this.inputEl.value.trim();
    if (!content || this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    this.sendBtnEl.disabled = true;
    this.inputEl.value = '';
    this.inputEl.style.height = 'auto';

    // Clear welcome on first message
    const welcome = this.messageListEl.querySelector('.chat-welcome');
    if (welcome) {
      welcome.remove();
    }

    // Add user message
    const userMsg: ChatMessage = { id: generateUUID(), role: 'user', content };
    this.messages.push(userMsg);
    this.renderMessage(userMsg);

    // Create a placeholder assistant message for streaming
    this.currentAssistantMessage = {
      id: generateUUID(),
      role: 'assistant',
      content: '',
      toolCalls: [],
      isStreaming: true,
    };
    this.messages.push(this.currentAssistantMessage);
    this.renderMessage(this.currentAssistantMessage);

    // Send to main process
    try {
      await this.ipc.invoke(IPC_CHANNELS.AGENT_SEND_MESSAGE, {
        conversationId: 'spike-conversation',
        content,
      });
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  }

  private handleAgentEvent(event: AgentEvent): void {
    if (!this.currentAssistantMessage) {
      return;
    }

    switch (event.type) {
      case 'thinking': {
        this.updateAssistantStatus('Thinking...');
        break;
      }
      case 'text_delta': {
        this.currentAssistantMessage.content += event.content;
        this.updateAssistantContent();
        break;
      }
      case 'tool_call_start': {
        this.currentAssistantMessage.toolCalls = this.currentAssistantMessage.toolCalls || [];
        this.currentAssistantMessage.toolCalls.push({
          name: event.toolCall.toolName,
          status: 'running',
        });
        this.updateAssistantToolCalls();
        break;
      }
      case 'tool_call_result': {
        if (this.currentAssistantMessage.toolCalls?.length) {
          const last =
            this.currentAssistantMessage.toolCalls[
              this.currentAssistantMessage.toolCalls.length - 1
            ];
          last.status = 'completed';
          this.updateAssistantToolCalls();
        }
        break;
      }
      case 'error': {
        this.currentAssistantMessage.content += `\n\n**Error:** ${event.error}`;
        this.updateAssistantContent();
        this.finishStreaming();
        break;
      }
      case 'done': {
        this.finishStreaming();
        break;
      }
    }
  }

  private finishStreaming(): void {
    if (this.currentAssistantMessage) {
      this.currentAssistantMessage.isStreaming = false;
      this.updateAssistantContent();
      this.updateAssistantStatus('');
    }
    this.currentAssistantMessage = null;
    this.isProcessing = false;
    this.sendBtnEl.disabled = false;
    this.inputEl.focus();
  }

  private renderMessage(msg: ChatMessage): void {
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
    contentEl.textContent = msg.content;
    if (msg.isStreaming && !msg.content) {
      contentEl.innerHTML = '<span class="chat-typing-indicator"></span>';
    }
    body.appendChild(contentEl);

    // Status
    const statusEl = document.createElement('div');
    statusEl.className = 'chat-message-status';
    body.appendChild(statusEl);

    el.appendChild(body);
    this.messageListEl.appendChild(el);
    this.scrollToBottom();
  }

  private updateAssistantContent(): void {
    if (!this.currentAssistantMessage) {
      return;
    }
    const el = document.getElementById(`msg-${this.currentAssistantMessage.id}`);
    if (!el) {
      return;
    }
    const contentEl = el.querySelector('.chat-message-content');
    if (contentEl) {
      // Simple markdown-like rendering
      contentEl.innerHTML = this.renderMarkdown(this.currentAssistantMessage.content);
      if (this.currentAssistantMessage.isStreaming) {
        contentEl.innerHTML += '<span class="chat-cursor"></span>';
      }
    }
    this.scrollToBottom();
  }

  private updateAssistantStatus(status: string): void {
    if (!this.currentAssistantMessage) {
      return;
    }
    const el = document.getElementById(`msg-${this.currentAssistantMessage.id}`);
    if (!el) {
      return;
    }
    const statusEl = el.querySelector('.chat-message-status');
    if (statusEl) {
      statusEl.textContent = status;
    }
  }

  private updateAssistantToolCalls(): void {
    if (!this.currentAssistantMessage) {
      return;
    }
    const el = document.getElementById(`msg-${this.currentAssistantMessage.id}`);
    if (!el) {
      return;
    }
    const toolCallsEl = el.querySelector('.chat-tool-calls');
    if (toolCallsEl && this.currentAssistantMessage.toolCalls?.length) {
      toolCallsEl.innerHTML = this.currentAssistantMessage.toolCalls
        .map(
          (tc) => `
          <div class="tool-call-item tool-call-${tc.status}">
            <span class="tool-call-icon">${tc.status === 'running' ? '...' : '+'}</span>
            <span class="tool-call-name">${this.escapeHtml(tc.name)}</span>
            <span class="tool-call-status">${tc.status}</span>
          </div>
        `,
        )
        .join('');
    }
  }

  private renderMarkdown(text: string): string {
    // Very simple markdown rendering for the spike
    let html = this.escapeHtml(text);
    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Inline code
    html = html.replace(/`(.+?)`/g, '<code>$1</code>');
    // Line breaks
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private scrollToBottom(): void {
    this.messageListEl.scrollTop = this.messageListEl.scrollHeight;
  }

  dispose(): void {
    this.disposables.dispose();
  }
}
