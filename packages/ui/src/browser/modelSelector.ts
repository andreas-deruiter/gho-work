/**
 * Model selector — custom dropdown styled as a subtle inline label.
 * Replaces native <select> for full visual control.
 */
import { Disposable, Emitter } from '@gho-work/base';
import type { Event } from '@gho-work/base';

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

export class ModelSelector extends Disposable {
  private _container!: HTMLElement;
  private _models: ModelInfo[] = [];
  private _selectedModel: string = '';
  private _triggerEl!: HTMLButtonElement;
  private _menuEl!: HTMLElement;
  private _isOpen = false;

  private readonly _onDidSelect = this._register(new Emitter<string>());
  readonly onDidSelectModel: Event<string> = this._onDidSelect.event;

  get selectedModel(): string {
    return this._selectedModel;
  }

  render(container: HTMLElement): void {
    this._container = container;
    this._container.className = 'model-selector';

    // Trigger button — looks like a text label
    this._triggerEl = document.createElement('button');
    this._triggerEl.className = 'model-selector-trigger';
    this._triggerEl.type = 'button';
    this._container.appendChild(this._triggerEl);

    // Dropdown menu
    this._menuEl = document.createElement('div');
    this._menuEl.className = 'model-selector-menu';
    this._container.appendChild(this._menuEl);

    this._triggerEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggle();
    });

    // Close on outside click
    const onDocClick = () => { if (this._isOpen) { this._close(); } };
    document.addEventListener('click', onDocClick);
    this._register({ dispose: () => document.removeEventListener('click', onDocClick) });

    this._updateTrigger();
  }

  setModels(models: ModelInfo[]): void {
    this._models = models;
    // Auto-select first model from server if none selected yet
    if (!this._selectedModel && models.length > 0) {
      this._selectedModel = models[0].id;
      this._onDidSelect.fire(this._selectedModel);
    }
    this._updateTrigger();
    this._buildMenu();
  }

  focus(): void {
    this._triggerEl?.focus();
  }

  private _toggle(): void {
    if (this._isOpen) {
      this._close();
    } else {
      this._open();
    }
  }

  private _open(): void {
    this._isOpen = true;
    this._menuEl.classList.add('open');
    this._triggerEl.classList.add('open');
  }

  private _close(): void {
    this._isOpen = false;
    this._menuEl.classList.remove('open');
    this._triggerEl.classList.remove('open');
  }

  private _updateTrigger(): void {
    if (!this._triggerEl) { return; }
    const model = this._models.find(m => m.id === this._selectedModel);
    const label = !this._selectedModel
      ? (this._models.length === 0 ? 'Loading…' : '')
      : (model?.name ?? this._selectedModel);

    // Clear and rebuild
    this._triggerEl.textContent = '';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'model-selector-label';
    labelSpan.textContent = label;
    this._triggerEl.appendChild(labelSpan);

    // Subtle chevron
    const chevron = document.createElement('span');
    chevron.className = 'model-selector-chevron';
    chevron.textContent = '›';
    this._triggerEl.appendChild(chevron);
  }

  private _buildMenu(): void {
    if (!this._menuEl) { return; }
    this._menuEl.textContent = '';

    for (const model of this._models) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'model-selector-item';
      if (model.id === this._selectedModel) {
        item.classList.add('selected');
      }

      const name = document.createElement('span');
      name.className = 'model-selector-item-name';
      name.textContent = model.name;
      item.appendChild(name);

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this._selectedModel = model.id;
        this._onDidSelect.fire(this._selectedModel);
        this._updateTrigger();
        this._buildMenu();
        this._close();
      });

      this._menuEl.appendChild(item);
    }
  }
}
