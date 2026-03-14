import { Widget } from '../widget.js';
import { h } from '../dom.js';
import type { IThemeService, ThemeKind } from '../theme.js';

const THEMES: Array<{ id: ThemeKind; label: string }> = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

export class AppearancePage extends Widget {
  private readonly _cardEls: Map<ThemeKind, HTMLElement> = new Map();

  constructor(private readonly _themeService: IThemeService) {
    const layout = h('div.settings-page-appearance', [
      h('h2.settings-page-title@title'),
      h('p.settings-page-subtitle@subtitle'),
      h('div.settings-section@section'),
    ]);
    super(layout.root);

    layout.title.textContent = 'Appearance';
    layout.subtitle.textContent = 'Customize the look and feel of the application';

    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'settings-section-title';
    sectionTitle.textContent = 'Theme';
    layout.section.appendChild(sectionTitle);

    const cardContainer = document.createElement('div');
    cardContainer.className = 'theme-card-group';
    cardContainer.setAttribute('role', 'radiogroup');
    cardContainer.setAttribute('aria-label', 'Theme selection');
    layout.section.appendChild(cardContainer);

    for (const theme of THEMES) {
      const card = document.createElement('div');
      card.className = 'theme-card';
      card.setAttribute('data-theme', theme.id);
      card.setAttribute('role', 'radio');
      card.setAttribute('tabindex', '0');

      const preview = document.createElement('div');
      preview.className = 'theme-card-preview';
      this._buildPreview(preview, theme.id);
      card.appendChild(preview);

      const label = document.createElement('div');
      label.className = 'theme-card-label';
      label.textContent = theme.label;
      card.appendChild(label);

      this.listen(card, 'click', () => this._themeService.setTheme(theme.id));
      this.listen(card, 'keydown', (e) => {
        const key = (e as KeyboardEvent).key;
        if (key === 'Enter' || key === ' ') {
          e.preventDefault();
          this._themeService.setTheme(theme.id);
        } else if (key === 'ArrowRight' || key === 'ArrowDown') {
          e.preventDefault();
          const cards = Array.from(this._cardEls.values());
          const idx = cards.indexOf(card);
          const next = cards[(idx + 1) % cards.length];
          next.focus();
        } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
          e.preventDefault();
          const cards = Array.from(this._cardEls.values());
          const idx = cards.indexOf(card);
          const prev = cards[(idx - 1 + cards.length) % cards.length];
          prev.focus();
        }
      });

      cardContainer.appendChild(card);
      this._cardEls.set(theme.id, card);
    }

    this._updateSelected(this._themeService.currentTheme);

    this._register(this._themeService.onDidChangeTheme((theme) => {
      this._updateSelected(theme);
    }));
  }

  private _buildPreview(container: HTMLElement, themeId: ThemeKind): void {
    if (themeId === 'light') {
      container.style.background = '#f5f5f5';
      const bar1 = document.createElement('div');
      Object.assign(bar1.style, { background: '#fff', borderRadius: '3px', height: '8px', marginBottom: '4px', width: '70%' });
      const bar2 = document.createElement('div');
      Object.assign(bar2.style, { background: '#e5e5e5', borderRadius: '3px', height: '8px', width: '50%' });
      container.append(bar1, bar2);
    } else if (themeId === 'dark') {
      container.style.background = '#1a1a2e';
      const bar1 = document.createElement('div');
      Object.assign(bar1.style, { background: '#2a2a4a', borderRadius: '3px', height: '8px', marginBottom: '4px', width: '70%' });
      const bar2 = document.createElement('div');
      Object.assign(bar2.style, { background: '#2a2a4a', borderRadius: '3px', height: '8px', width: '50%' });
      container.append(bar1, bar2);
    } else {
      container.style.background = 'linear-gradient(135deg, #f5f5f5 50%, #1a1a2e 50%)';
    }
  }

  private _updateSelected(theme: ThemeKind): void {
    for (const [id, el] of this._cardEls) {
      const isSelected = id === theme;
      el.classList.toggle('selected', isSelected);
      el.setAttribute('aria-checked', String(isSelected));
    }
  }
}
