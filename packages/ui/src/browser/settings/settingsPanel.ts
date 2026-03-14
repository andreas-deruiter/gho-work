import type { IIPCRenderer } from '@gho-work/platform/common';
import { Widget } from '../widget.js';
import { h } from '../dom.js';
import type { IThemeService } from '../theme.js';
import { AppearancePage } from './appearancePage.js';
import { SkillsPage } from './skillsPage.js';
import { PluginsPage } from './pluginsPage.js';
import { ConnectorsPage } from './connectorsPage.js';

interface NavItem {
  id: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'skills', label: 'Skills' },
  { id: 'plugins', label: 'Plugins' },
  { id: 'connectors', label: 'Connectors' },
];

export class SettingsPanel extends Widget {
  private _activePage: Widget | undefined;
  private _activeNavId: string = 'appearance';
  private readonly _contentEl: HTMLElement;
  private readonly _navItemEls: Map<string, HTMLElement> = new Map();

  constructor(
    private readonly _ipc: IIPCRenderer,
    private readonly _themeService: IThemeService,
  ) {
    const layout = h('div.settings-layout', [
      h('div.settings-nav@nav'),
      h('div.settings-content@content'),
    ]);
    super(layout.root);

    this._contentEl = layout.content;

    for (const item of NAV_ITEMS) {
      const el = document.createElement('div');
      el.className = 'settings-nav-item';
      el.textContent = item.label;
      el.dataset.id = item.id;
      this.listen(el, 'click', () => this._showPage(item.id));
      layout.nav.appendChild(el);
      this._navItemEls.set(item.id, el);
    }

    this._showPage('appearance');
  }

  private _showPage(id: string): void {
    if (id === this._activeNavId && this._activePage) {
      return;
    }

    if (this._activePage) {
      this._activePage.dispose();
      this._activePage = undefined;
    }

    while (this._contentEl.firstChild) {
      this._contentEl.removeChild(this._contentEl.firstChild);
    }

    this._activeNavId = id;
    for (const [navId, el] of this._navItemEls) {
      el.classList.toggle('active', navId === id);
    }

    let page: Widget;
    switch (id) {
      case 'skills': {
        const skillsPage = new SkillsPage(this._ipc);
        void skillsPage.load();
        page = skillsPage;
        break;
      }
      case 'plugins':
        page = new PluginsPage(this._ipc);
        break;
      case 'connectors':
        page = new ConnectorsPage(this._ipc);
        break;
      case 'appearance':
      default:
        page = new AppearancePage(this._themeService);
        break;
    }

    this._activePage = page;
    this._contentEl.appendChild(page.getDomNode());
  }

  override dispose(): void {
    this._activePage?.dispose();
    this._activePage = undefined;
    super.dispose();
  }
}
