import { Disposable, Emitter } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import { h } from '../dom.js';
import { createUserIcon } from './icons.js';

export interface UserAvatarData {
  githubLogin: string | null;
  isAuthenticated: boolean;
}

export class UserAvatarItem extends Disposable {
  private readonly _onDidClick = this._register(new Emitter<void>());
  readonly onDidClick: Event<void> = this._onDidClick.event;

  readonly element: HTMLElement;

  constructor() {
    super();

    const { root } = h('span.status-bar-item.sb-user');
    this.element = root;

    root.setAttribute('role', 'button');
    root.setAttribute('tabindex', '0');
    root.setAttribute('aria-label', 'User');

    root.addEventListener('click', () => this._onDidClick.fire());
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this._onDidClick.fire();
      }
    });

    // Default: show user icon (not authenticated)
    this._showIcon();
  }

  update(data: UserAvatarData): void {
    if (data.isAuthenticated && data.githubLogin) {
      this._showAvatar(data.githubLogin);
    } else {
      this._showIcon();
    }
  }

  private _showAvatar(login: string): void {
    this.element.textContent = '';
    this.element.textContent = login[0].toUpperCase();
    this.element.classList.add('sb-user-avatar');
    this.element.title = `Signed in as ${login}`;
  }

  private _showIcon(): void {
    this.element.textContent = '';
    this.element.appendChild(createUserIcon());
    this.element.classList.remove('sb-user-avatar');
    this.element.title = 'Not signed in';
  }
}
