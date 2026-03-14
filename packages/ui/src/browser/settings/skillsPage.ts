import type { IIPCRenderer } from '@gho-work/platform/common';
import { Widget } from '../widget.js';
import { h } from '../dom.js';

export class SkillsPage extends Widget {
  constructor(_ipc: IIPCRenderer) {
    const layout = h('div.settings-page-skills', [
      h('div.skill-source-list'),
    ]);
    super(layout.root);
  }

  async load(): Promise<void> {
    // Stub — implemented in Task 6
  }
}
