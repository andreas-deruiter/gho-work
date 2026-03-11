/**
 * Model selector dropdown — allows switching between available models.
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
  private _selectedModel: string = 'gpt-4o';

  private readonly _onDidSelect = this._register(new Emitter<string>());
  readonly onDidSelectModel: Event<string> = this._onDidSelect.event;

  get selectedModel(): string {
    return this._selectedModel;
  }

  render(container: HTMLElement): void {
    this._container = container;
    this._container.className = 'model-selector';
    this._updateUI();
  }

  setModels(models: ModelInfo[]): void {
    this._models = models;
    this._updateUI();
  }

  private _clearElement(el: Element): void {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  private _updateUI(): void {
    if (!this._container) { return; }
    this._clearElement(this._container);

    const select = document.createElement('select');
    select.className = 'model-selector-dropdown';

    if (this._models.length === 0) {
      const opt = document.createElement('option');
      opt.value = this._selectedModel;
      opt.textContent = this._selectedModel;
      select.appendChild(opt);
    }

    for (const model of this._models) {
      const opt = document.createElement('option');
      opt.value = model.id;
      opt.textContent = model.name;
      opt.selected = model.id === this._selectedModel;
      select.appendChild(opt);
    }

    select.addEventListener('change', () => {
      this._selectedModel = select.value;
      this._onDidSelect.fire(this._selectedModel);
    });

    this._container.appendChild(select);
  }
}
