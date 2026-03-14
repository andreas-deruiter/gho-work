import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import type { InstructionsPathResponse } from '@gho-work/platform/common';
import { Widget } from '../widget.js';
import { h } from '../dom.js';

export class InstructionsPage extends Widget {
  private readonly _pathInputEl: HTMLInputElement;
  private readonly _statusEl: HTMLElement;
  private readonly _statusDotEl: HTMLElement;
  private readonly _statusTextEl: HTMLElement;

  constructor(private readonly _ipc: IIPCRenderer) {
    const layout = h('div.settings-page-instructions', [
      h('h2.settings-page-title@title'),
      h('p.settings-page-subtitle@subtitle'),
      h('div.settings-section@fileSection'),
      h('div.settings-section@tipsSection'),
    ]);
    super(layout.root);

    layout.title.textContent = 'Instructions';
    layout.subtitle.textContent =
      'Configure the instructions file that the agent reads at the start of every conversation';

    // --- Instructions File section ---
    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'settings-section-title';
    sectionTitle.textContent = 'Instructions File';
    layout.fileSection.appendChild(sectionTitle);

    const sectionSubtitle = document.createElement('div');
    sectionSubtitle.className = 'settings-section-subtitle';
    sectionSubtitle.textContent =
      'A markdown file with instructions, conventions, and context for the agent';
    layout.fileSection.appendChild(sectionSubtitle);

    // Path input row
    const inputRow = document.createElement('div');
    inputRow.className = 'skill-path-input-row';

    this._pathInputEl = document.createElement('input');
    this._pathInputEl.type = 'text';
    this._pathInputEl.className = 'skill-path-input';
    this._pathInputEl.readOnly = true;
    this._pathInputEl.style.fontFamily = "'SF Mono', 'Menlo', 'Monaco', monospace";
    this._pathInputEl.setAttribute('aria-label', 'Instructions file path');
    inputRow.appendChild(this._pathInputEl);

    const browseBtn = document.createElement('button');
    browseBtn.className = 'skill-path-browse-btn';
    browseBtn.textContent = 'Browse';
    browseBtn.setAttribute('aria-label', 'Browse for instructions file');
    this.listen(browseBtn, 'click', () => void this._browsePath());
    inputRow.appendChild(browseBtn);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'skill-path-browse-btn';
    resetBtn.textContent = 'Reset';
    resetBtn.setAttribute('aria-label', 'Reset to default instructions path');
    this.listen(resetBtn, 'click', () => void this._resetPath());
    inputRow.appendChild(resetBtn);

    layout.fileSection.appendChild(inputRow);

    // Status indicator
    this._statusEl = document.createElement('div');
    this._statusEl.className = 'instructions-status';

    this._statusDotEl = document.createElement('span');
    this._statusDotEl.className = 'instructions-status-dot';
    this._statusEl.appendChild(this._statusDotEl);

    this._statusTextEl = document.createElement('span');
    this._statusEl.appendChild(this._statusTextEl);

    layout.fileSection.appendChild(this._statusEl);

    // --- Tips section ---
    const tipsCard = document.createElement('div');
    tipsCard.className = 'instructions-tips';

    const tipsTitle = document.createElement('div');
    tipsTitle.className = 'settings-section-title';
    tipsTitle.textContent = 'Tips';
    tipsCard.appendChild(tipsTitle);

    const tipsList = document.createElement('ul');
    tipsList.className = 'instructions-tips-list';
    const tips = [
      'Edit this file with any text editor — changes take effect on the next conversation',
      'Use markdown formatting for structure and clarity',
      'Reference other files with relative paths from your home directory',
    ];
    for (const tip of tips) {
      const li = document.createElement('li');
      li.textContent = tip;
      tipsList.appendChild(li);
    }
    tipsCard.appendChild(tipsList);
    layout.tipsSection.appendChild(tipsCard);
  }

  async load(): Promise<void> {
    try {
      const result = (await this._ipc.invoke(
        IPC_CHANNELS.INSTRUCTIONS_GET_PATH,
      )) as InstructionsPathResponse;
      this._updateUI(result);
    } catch (err) {
      console.error('[InstructionsPage] Failed to load instructions path:', err);
    }
  }

  private _updateUI(result: InstructionsPathResponse): void {
    this._pathInputEl.value = result.path;
    if (result.exists) {
      this._statusDotEl.style.background = 'var(--color-success, #a6e3a1)';
      this._statusTextEl.style.color = 'var(--color-success, #a6e3a1)';
      this._statusTextEl.textContent = `File found — ${result.lineCount} lines`;
    } else {
      this._statusDotEl.style.background = 'var(--color-error, #f38ba8)';
      this._statusTextEl.style.color = 'var(--color-error, #f38ba8)';
      this._statusTextEl.textContent =
        'File not found — agent will run without instructions';
    }
  }

  private async _browsePath(): Promise<void> {
    try {
      const result = (await this._ipc.invoke(IPC_CHANNELS.DIALOG_OPEN_FILE, {
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      })) as { path: string | null };
      if (result.path) {
        const updated = (await this._ipc.invoke(
          IPC_CHANNELS.INSTRUCTIONS_SET_PATH,
          { path: result.path },
        )) as InstructionsPathResponse;
        this._updateUI(updated);
      }
    } catch (err) {
      console.error('[InstructionsPage] Failed to browse for instructions file:', err);
    }
  }

  private async _resetPath(): Promise<void> {
    try {
      const result = (await this._ipc.invoke(
        IPC_CHANNELS.INSTRUCTIONS_SET_PATH,
        { path: '' },
      )) as InstructionsPathResponse;
      this._updateUI(result);
    } catch (err) {
      console.error('[InstructionsPage] Failed to reset instructions path:', err);
    }
  }
}
