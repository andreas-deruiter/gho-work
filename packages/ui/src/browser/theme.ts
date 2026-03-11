import { Disposable, Emitter, createServiceIdentifier } from '@gho-work/base';
import type { Event } from '@gho-work/base';

export type ThemeKind = 'light' | 'dark' | 'system';

export interface IThemeService {
  readonly currentTheme: ThemeKind;
  readonly onDidChangeTheme: Event<ThemeKind>;
  setTheme(theme: ThemeKind): void;
}

export const IThemeService = createServiceIdentifier<IThemeService>('IThemeService');

export class ThemeService extends Disposable implements IThemeService {
  private _currentTheme: ThemeKind = 'system';
  private readonly _onDidChangeTheme = this._register(new Emitter<ThemeKind>());
  readonly onDidChangeTheme: Event<ThemeKind> = this._onDidChangeTheme.event;

  get currentTheme(): ThemeKind {
    return this._currentTheme;
  }

  setTheme(theme: ThemeKind): void {
    this._currentTheme = theme;
    this._applyTheme(theme);
    this._onDidChangeTheme.fire(theme);
  }

  private _applyTheme(theme: ThemeKind): void {
    const resolved =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme;
    document.documentElement.setAttribute('data-theme', resolved);
  }
}
