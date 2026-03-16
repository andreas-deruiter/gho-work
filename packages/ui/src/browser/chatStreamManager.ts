/**
 * ChatStreamManager — manages streaming state for assistant messages.
 * Handles content parts accumulation and incremental DOM updates.
 */
import { renderChatMarkdown } from './chatMarkdownRenderer.js';

/** A content part in the assistant response stream. */
export type ContentPart = { type: 'text'; content: string };

export class ChatStreamManager {
  private _contentParts: ContentPart[] = [];

  /** Reset for a new streaming message. */
  reset(): void {
    this._contentParts = [];
  }

  /**
   * Append a text delta — creates or extends the last text part.
   * @param delta - The text delta to append.
   * @param partsContainer - The DOM container for the current assistant message parts.
   */
  appendTextDelta(delta: string, partsContainer: HTMLElement | null): void {
    const lastPart = this._contentParts[this._contentParts.length - 1];
    if (lastPart && lastPart.type === 'text') {
      lastPart.content += delta;
    } else {
      this._contentParts.push({ type: 'text', content: delta });
      this._appendTextPartDom(partsContainer);
    }
    this._updateLastTextPart(partsContainer, true);
  }

  /**
   * Finalize rendering — re-renders the last text part without the streaming cursor.
   * @param partsContainer - The DOM container for the current assistant message parts.
   */
  finishRendering(partsContainer: HTMLElement | null): void {
    this._updateLastTextPart(partsContainer, false);
  }

  /** Creates a new empty text segment DOM element in the parts container. */
  private _appendTextPartDom(partsContainer: HTMLElement | null): void {
    if (!partsContainer) {
      return;
    }
    const textEl = document.createElement('div');
    textEl.className = 'chat-message-content';
    partsContainer.appendChild(textEl);
  }

  /** Re-renders only the last text segment with updated markdown content. */
  private _updateLastTextPart(partsContainer: HTMLElement | null, isStreaming: boolean): void {
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

    renderChatMarkdown(lastTextEl, lastTextPart.content, { isStreaming });
    if (isStreaming) {
      const cursor = document.createElement('span');
      cursor.className = 'chat-cursor';
      lastTextEl.appendChild(cursor);
    }
  }
}
