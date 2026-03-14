import { Disposable, DisposableStore } from '@gho-work/base';

export interface ContextMenuItem {
  label?: string;
  action?: () => void;
  separator?: boolean;
}

export class ContextMenu extends Disposable {
  private readonly _element: HTMLElement;
  private readonly _disposables = this._register(new DisposableStore());

  private constructor(items: ContextMenuItem[], x: number, y: number) {
    super();

    this._element = document.createElement('div');
    this._element.classList.add('context-menu');
    this._element.style.position = 'fixed';
    this._element.style.left = `${x}px`;
    this._element.style.top = `${y}px`;
    this._element.setAttribute('role', 'menu');

    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.classList.add('context-menu-separator');
        this._element.appendChild(sep);
        continue;
      }

      const el = document.createElement('div');
      el.classList.add('context-menu-item');
      el.setAttribute('role', 'menuitem');
      el.setAttribute('tabindex', '0');
      el.textContent = item.label ?? '';
      el.addEventListener('click', () => {
        item.action?.();
        this._close();
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          item.action?.();
          this._close();
        }
      });
      this._element.appendChild(el);
    }

    document.body.appendChild(this._element);

    // Close on outside click
    const onOutsideClick = (e: MouseEvent) => {
      if (!this._element.contains(e.target as Node)) {
        this._close();
      }
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this._close();
      }
    };

    document.addEventListener('keydown', onEscape);
    this._disposables.add({ dispose: () => document.removeEventListener('keydown', onEscape) });

    requestAnimationFrame(() => {
      document.addEventListener('click', onOutsideClick);
      this._disposables.add({ dispose: () => document.removeEventListener('click', onOutsideClick) });
    });
  }

  private _close(): void {
    this._element.remove();
    this._disposables.clear();
  }

  static show(items: ContextMenuItem[], x: number, y: number): ContextMenu {
    return new ContextMenu(items, x, y);
  }

  override dispose(): void {
    this._close();
    super.dispose();
  }
}
