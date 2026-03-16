/**
 * Chat input area — builds the input area DOM for the chat panel.
 * Contains textarea, send/cancel buttons, drag-drop zone, and model selector footer.
 */

export interface ChatInputElements {
  inputArea: HTMLElement;
  inputEl: HTMLTextAreaElement;
  sendBtnEl: HTMLButtonElement;
  cancelBtnEl: HTMLButtonElement;
  attachmentListEl: HTMLElement;
  slashDropdownEl: HTMLElement;
  modelSelectorContainer: HTMLElement;
}

export interface ChatInputCallbacks {
  onSendMessage: () => void;
  onCancelRequest: () => void;
  onFileDrop: (files: File[]) => void;
  onInputChange: () => void;
}

export function createChatInputArea(callbacks: ChatInputCallbacks): ChatInputElements {
  const inputArea = document.createElement('div');
  inputArea.className = 'chat-input-area';

  const inputWrapper = document.createElement('div');
  inputWrapper.className = 'chat-input-wrapper';

  // Attachment list (placed above the wrapper)
  const attachmentListEl = document.createElement('div');
  attachmentListEl.className = 'chat-attachments';
  inputArea.appendChild(attachmentListEl);

  // File drag-and-drop on the wrapper
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
      callbacks.onFileDrop(Array.from(e.dataTransfer.files));
    }
  });

  // Textarea with auto-resize
  const inputEl = document.createElement('textarea');
  inputEl.className = 'chat-input';
  inputEl.placeholder =
    'Ask GHO Work anything... (try "draft an email" or "analyze my data")';
  inputEl.rows = 1;
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      callbacks.onSendMessage();
    }
  });
  inputEl.addEventListener('input', () => {
    // Auto-resize
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 150) + 'px';
  });
  inputEl.addEventListener('input', () => {
    callbacks.onInputChange();
  });
  inputWrapper.appendChild(inputEl);

  // Slash command dropdown
  const slashDropdownEl = document.createElement('div');
  slashDropdownEl.className = 'slash-dropdown';
  slashDropdownEl.style.display = 'none';
  inputWrapper.appendChild(slashDropdownEl);

  // Send button with paper-plane SVG icon
  const sendBtnEl = document.createElement('button');
  sendBtnEl.className = 'chat-send-btn';
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
  sendBtnEl.appendChild(sendSvg);
  sendBtnEl.addEventListener('click', () => callbacks.onSendMessage());
  inputWrapper.appendChild(sendBtnEl);

  // Cancel button — same position/size as send button, swap via display
  const cancelBtnEl = document.createElement('button');
  cancelBtnEl.className = 'chat-cancel-btn';
  cancelBtnEl.title = 'Stop';
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
  cancelBtnEl.appendChild(stopSvg);
  cancelBtnEl.style.display = 'none';
  cancelBtnEl.addEventListener('click', () => callbacks.onCancelRequest());
  inputWrapper.appendChild(cancelBtnEl);

  inputArea.appendChild(inputWrapper);

  // Footer row: model selector container (left) + hint (right)
  const inputFooter = document.createElement('div');
  inputFooter.className = 'chat-input-footer';

  const modelSelectorContainer = document.createElement('div');
  modelSelectorContainer.className = 'chat-input-model';
  inputFooter.appendChild(modelSelectorContainer);

  const hint = document.createElement('div');
  hint.className = 'chat-hint';
  hint.textContent = 'Press Enter to send, Shift+Enter for new line';
  inputFooter.appendChild(hint);

  inputArea.appendChild(inputFooter);

  return {
    inputArea,
    inputEl,
    sendBtnEl,
    cancelBtnEl,
    attachmentListEl,
    slashDropdownEl,
    modelSelectorContainer,
  };
}
