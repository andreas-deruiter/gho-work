import { Widget } from '../widget.js';
import { h } from '../dom.js';
import type { IThemeService } from '../theme.js';

export class AppearancePage extends Widget {
  constructor(_themeService: IThemeService) {
    const layout = h('div.settings-page-appearance', [
      h('div.theme-card'),
    ]);
    super(layout.root);
  }
}
