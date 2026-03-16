/**
 * Chat message renderer — pure DOM-building functions for chat messages.
 * No state management, no IPC. All functions are pure with respect to
 * external state (they accept callbacks for side effects).
 */
import { generateUUID } from '@gho-work/base';
import { renderChatMarkdown } from './chatMarkdownRenderer.js';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{ id: string; name: string; status: string }>;
  isStreaming?: boolean;
  attachments?: Array<{ name: string; path: string }>;
}

/**
 * Renders markdown content into an element using renderChatMarkdown
 * (marked + highlight.js + DOMPurify). All output is sanitized to prevent XSS attacks.
 */
export function setSanitizedMarkdown(el: Element, markdownText: string): void {
  renderChatMarkdown(el, markdownText, { isStreaming: false });
}

/**
 * Builds the DOM for a single chat message (user or assistant).
 * For user messages: shows attached files as pills above a bubble.
 * For assistant messages: role label + parts container + typing indicator.
 *
 * @param msg - The chat message to render
 * @param setSanitizedMarkdownFn - Callback to render markdown into an element
 * @returns The outer message HTMLElement (not yet inserted into the DOM)
 */
export function renderMessage(
  msg: ChatMessage,
  setSanitizedMarkdownFn: (el: Element, text: string) => void,
): HTMLElement {
  const el = document.createElement('div');
  el.className = `chat-message chat-message-${msg.role}`;
  el.id = `msg-${msg.id}`;
  el.setAttribute('data-message-id', msg.id);

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
      setSanitizedMarkdownFn(contentEl, msg.content);
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
  return el;
}

/**
 * Builds the ASCII art welcome screen with suggestion buttons.
 *
 * @param onSuggestionClick - Callback invoked when the user clicks a suggestion button
 * @returns The welcome screen HTMLElement (not yet inserted into the DOM)
 */
export function renderWelcomeScreen(onSuggestionClick: (prompt: string) => void): HTMLElement {
  const welcome = document.createElement('div');
  welcome.className = 'chat-welcome';

  const ascii = document.createElement('pre');
  ascii.className = 'chat-welcome-ascii';
  ascii.textContent =
    '  __ _| |__   ___   __      _____  _ __| | __\n' +
    ' / _` | \'_ \\ / _ \\  \\ \\ /\\ / / _ \\| \'__| |/ /\n' +
    '| (_| | | | | (_) |  \\ V  V / (_) | |  |   < \n' +
    ' \\__, |_| |_|\\___/    \\_/\\_/ \\___/|_|  |_|\\_\\\n' +
    ' |___/';
  welcome.appendChild(ascii);

  const desc = document.createElement('p');
  desc.textContent = 'Your GitHub Copilot subscription just learned to do office work.';
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
      onSuggestionClick(prompt);
    });
    suggestions.appendChild(btn);
  }

  welcome.appendChild(suggestions);
  return welcome;
}

/**
 * Returns a ChatMessage object containing help text for the /help command.
 */
export function createHelpMessage(): ChatMessage {
  return {
    id: generateUUID(),
    role: 'assistant',
    content: '**Available commands:**\n- `/model` — Switch the AI model\n- `/clear` — Clear the conversation\n- `/help` — Show this help message\n\n**Keyboard shortcuts:**\n- `Enter` — Send message\n- `Shift+Enter` — New line\n- `Cmd+B` — Toggle sidebar\n- `Cmd+N` — New conversation',
  };
}

/**
 * Builds the error banner DOM element.
 *
 * @param message - The error message to display
 * @param onDismiss - Callback invoked when the dismiss button is clicked
 * @returns The banner HTMLElement (not yet inserted into the DOM)
 */
export function createErrorBanner(message: string, onDismiss: () => void): HTMLElement {
  const banner = document.createElement('div');
  banner.className = 'chat-error-banner';

  const text = document.createElement('span');
  text.textContent = message;
  banner.appendChild(text);

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'chat-error-dismiss';
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.addEventListener('click', () => onDismiss());
  banner.appendChild(dismissBtn);

  return banner;
}

/**
 * Removes all child nodes from an element.
 */
export function clearElement(el: Element): void {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}
