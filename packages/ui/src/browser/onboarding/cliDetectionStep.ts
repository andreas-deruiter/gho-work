/**
 * CLI Detection step — scans for CLI tools, shows found/missing status.
 */
import { Emitter } from '@gho-work/base';
import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import type { ToolDetectResponse } from '@gho-work/platform/common';
import { Widget } from '../widget.js';
import { h } from '../dom.js';

export class CliDetectionStep extends Widget {
  private readonly _onDidContinue = this._register(new Emitter<void>());
  readonly onDidContinue = this._onDidContinue.event;

  private _contentEl: HTMLElement;

  constructor(container: HTMLElement, private readonly _ipc: IIPCRenderer) {
    super(container);
    this._contentEl = document.createElement('div');
    this._contentEl.className = 'onboarding-cli';
    this.element.appendChild(this._contentEl);
    void this._detect();
  }

  private async _detect(): Promise<void> {
    this._renderLoading();
    try {
      const result = await this._ipc.invoke(IPC_CHANNELS.ONBOARDING_DETECT_TOOLS) as ToolDetectResponse;
      this._renderResults(result.tools);
    } catch {
      this._renderResults([]);
    }
  }

  private _clear(): void {
    while (this._contentEl.firstChild) {
      this._contentEl.removeChild(this._contentEl.firstChild);
    }
  }

  private _renderLoading(): void {
    this._clear();
    const content = h('.onb-cli-content', [
      h('.onb-spinner'),
      h('h3@heading'),
    ]);
    content.heading.textContent = 'Detecting CLI tools...';
    this._contentEl.appendChild(content.root);
  }

  private _renderResults(tools: ToolDetectResponse['tools']): void {
    this._clear();
    const content = h('.onb-cli-content', [
      h('h3@heading'),
      h('p@desc'),
    ]);
    content.heading.textContent = 'CLI Tools Detected';
    content.desc.textContent = 'GHO Work can use these CLI tools to interact with external services.';

    const list = h('.cli-detect-list');

    for (const tool of tools) {
      const statusClass = tool.found ? 'found' : 'missing';
      const item = h(`.cli-detect-item.${statusClass}`, [
        h(`span.cli-status-icon.${statusClass}@icon`),
        h('.cli-info', [
          h('span.cli-name@name'),
          h('span.cli-desc@desc'),
        ]),
      ]);
      item.icon.textContent = tool.found ? '\u2713' : '\u2717';
      item.name.textContent = tool.name;
      item.desc.textContent = tool.description;

      if (tool.found && tool.version) {
        const version = h('span.cli-version@ver');
        version.ver.textContent = `v${tool.version}`;
        item.root.appendChild(version.root);
      }

      list.root.appendChild(item.root);
    }

    content.root.appendChild(list.root);

    const note = h('p.cli-note@note');
    note.note.textContent = 'Missing tools are optional. You can install them later from Settings > Connectors.';
    content.root.appendChild(note.root);

    const btn = h('button.btn-primary@btn');
    btn.btn.textContent = 'Continue';
    this.listen(btn.btn, 'click', () => this._onDidContinue.fire());
    content.root.appendChild(btn.root);

    this._contentEl.appendChild(content.root);
  }
}
